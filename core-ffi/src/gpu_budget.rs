//! Shared bound for explicit GPU handoff copies, independent of driver memory.
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, OnceLock,
};
pub(crate) struct Budget {
    limit: usize,
    used: AtomicUsize,
}
pub(crate) struct Reservation {
    budget: Arc<Budget>,
    bytes: usize,
}
impl Budget {
    pub(crate) fn new(limit: usize) -> Arc<Self> {
        Arc::new(Self {
            limit,
            used: AtomicUsize::new(0),
        })
    }
    pub(crate) fn reserve(self: &Arc<Self>, bytes: usize) -> Option<Reservation> {
        self.used
            .try_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                used.checked_add(bytes).filter(|next| *next <= self.limit)
            })
            .ok()?;
        Some(Reservation {
            budget: self.clone(),
            bytes,
        })
    }

    #[cfg(test)]
    pub(crate) fn used(&self) -> usize {
        self.used.load(Ordering::Acquire)
    }
}
impl Drop for Reservation {
    fn drop(&mut self) {
        self.budget.used.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}
pub(crate) fn reserve(bytes: usize) -> Option<Reservation> {
    shared().reserve(bytes)
}
pub(crate) fn shared() -> &'static Arc<Budget> {
    static SHARED: OnceLock<Arc<Budget>> = OnceLock::new();
    SHARED.get_or_init(|| Budget::new(128 * 1024 * 1024))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shared_capacity_and_failure_reclaim() {
        let budget = Budget::new(16);
        let first = budget.reserve(8).unwrap();
        let second = budget.reserve(8).unwrap();
        assert!(budget.reserve(1).is_none());
        assert!(budget.reserve(usize::MAX).is_none());
        drop(first);
        assert_eq!(budget.used.load(Ordering::Acquire), 8);
        drop(second);
        assert_eq!(budget.used.load(Ordering::Acquire), 0);
    }
    #[test]
    fn concurrent_reservations_release() {
        let budget = Budget::new(64);
        std::thread::scope(|scope| {
            for _ in 0..8 {
                let budget = budget.clone();
                scope.spawn(move || {
                    for _ in 0..1000 {
                        if let Some(lease) = budget.reserve(16) {
                            assert!(budget.used.load(Ordering::Acquire) <= 64);
                            drop(lease);
                        }
                    }
                });
            }
        });
        assert_eq!(budget.used.load(Ordering::Acquire), 0);
    }
}
