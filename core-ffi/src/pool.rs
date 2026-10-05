//! Owner-thread container policy. Adapters must finish guest cleanup and GPU
//! work inside `unload`; this policy never frees foreign-thread resources.
use std::collections::VecDeque;

pub trait RetainedGuest {
    fn hide(&mut self);
    fn show(&mut self);
    fn unload(&mut self);
    fn memory_warning(&mut self);
    fn failure(&self) -> Option<String> {
        None
    }
}
#[derive(Debug)]
pub enum PoolError<E> {
    Creation(E),
    Lifecycle(String),
}

pub struct InstancePool<G: RetainedGuest> {
    capacity: usize,
    // Least recently foregrounded first; foreground is always the last entry.
    entries: VecDeque<(String, G)>,
    foreground: bool,
}

impl<G: RetainedGuest> InstancePool<G> {
    pub fn new(capacity: usize) -> Self {
        assert!(
            (1..=3).contains(&capacity),
            "Instance capacity must be 1..=3"
        );
        Self {
            capacity,
            entries: VecDeque::new(),
            foreground: false,
        }
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    #[cfg(target_os = "android")]
    pub(crate) fn visit(
        &mut self,
        mut action: impl FnMut(&mut G) -> Result<(), String>,
    ) -> Result<(), String> {
        for (_, guest) in &mut self.entries {
            action(guest)?;
        }
        Ok(())
    }
    /// Native completions address a retained identity, never the current foreground.
    pub fn retained(&mut self, id: &str) -> Option<&mut G> {
        self.entries
            .iter_mut()
            .find(|(key, _)| key == id)
            .map(|(_, guest)| guest)
    }
    pub fn foreground(&mut self) -> Option<&mut G> {
        if self.foreground
            && self
                .entries
                .back()
                .is_some_and(|(_, guest)| guest.failure().is_some())
        {
            self.foreground = false;
        }
        if self.foreground {
            self.entries.back_mut().map(|(_, guest)| guest)
        } else {
            None
        }
    }
    /// Construct before disturbing the current guest. Failed authenticated loads
    /// therefore preserve its state and do not evict a retained guest.
    pub fn activate<E>(
        &mut self,
        id: &str,
        create: impl FnOnce() -> Result<G, E>,
    ) -> Result<(), PoolError<E>> {
        let existing = self.entries.iter().position(|(key, _)| key == id);
        let new_guest = if existing.is_none() {
            Some(create().map_err(PoolError::Creation)?)
        } else {
            None
        };
        if self.foreground && existing == Some(self.entries.len() - 1) {
            if let Some(error) = self.entries.back().unwrap().1.failure() {
                return Err(PoolError::Lifecycle(error));
            }
            return Ok(());
        }
        self.background();
        let mut entry = if let Some(index) = existing {
            self.entries.remove(index).unwrap()
        } else {
            (id.to_owned(), new_guest.unwrap())
        };
        entry.1.show();
        if let Some(error) = entry.1.failure() {
            entry.1.unload();
            self.resume();
            return Err(PoolError::Lifecycle(error));
        }
        if self.entries.len() == self.capacity {
            let (_, mut oldest) = self.entries.pop_front().unwrap();
            oldest.unload();
        }
        self.entries.push_back(entry);
        self.foreground = true;
        Ok(())
    }
    pub fn background(&mut self) {
        if self.foreground {
            self.entries.back_mut().unwrap().1.hide();
            self.foreground = false;
        }
    }
    pub fn resume(&mut self) {
        if !self.foreground && !self.entries.is_empty() {
            self.entries.back_mut().unwrap().1.show();
            self.foreground = self.entries.back().unwrap().1.failure().is_none();
        }
    }
    pub fn close(&mut self, id: &str) {
        if let Some(index) = self.entries.iter().position(|(key, _)| key == id) {
            if self.foreground && index == self.entries.len() - 1 {
                self.background();
            }
            let (_, mut guest) = self.entries.remove(index).unwrap();
            guest.unload();
        }
    }
    pub fn memory_warning(&mut self) {
        let _ = self.foreground();
        let retained = usize::from(self.foreground);
        while self.entries.len() > retained {
            let (_, mut guest) = self.entries.pop_front().unwrap();
            guest.unload();
        }
        if let Some(guest) = self.foreground() {
            guest.memory_warning();
        }
    }
}
impl<G: RetainedGuest> Drop for InstancePool<G> {
    fn drop(&mut self) {
        self.background();
        for (_, mut guest) in self.entries.drain(..) {
            guest.unload();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, rc::Rc};
    struct Guest(&'static str, Rc<RefCell<Vec<String>>>);
    impl Guest {
        fn record(&self, event: &str) {
            self.1.borrow_mut().push(format!("{}:{event}", self.0));
        }
    }
    impl RetainedGuest for Guest {
        fn hide(&mut self) {
            self.record("hide");
        }
        fn show(&mut self) {
            self.record("show");
        }
        fn unload(&mut self) {
            self.record("unload");
        }
        fn memory_warning(&mut self) {
            self.record("memory");
        }
    }
    #[test]
    fn lru_failed_load_and_pressure_order() {
        let log = Rc::new(RefCell::new(Vec::new()));
        let mut pool = InstancePool::new(3);
        for id in ["a", "b", "c"] {
            pool.activate(id, || Ok::<_, ()>(Guest(id, log.clone())))
                .unwrap();
        }
        pool.activate::<()>("a", || panic!("retained guest must not be recreated"))
            .unwrap();
        let before = log.borrow().clone();
        assert!(
            pool.activate("bad", || Err::<Guest, _>("signature"))
                .is_err()
        );
        assert_eq!(*log.borrow(), before);
        pool.activate("d", || Ok::<_, ()>(Guest("d", log.clone())))
            .unwrap();
        assert_eq!(pool.len(), 3);
        assert_eq!(&log.borrow()[7..], ["a:hide", "d:show", "b:unload"]);
        pool.memory_warning();
        assert_eq!(pool.len(), 1);
        assert_eq!(&log.borrow()[10..], ["c:unload", "a:unload", "d:memory"]);
        pool.background();
        pool.background();
        pool.resume();
        pool.resume();
        pool.close("d");
        assert!(pool.foreground().is_none());
        assert_eq!(
            &log.borrow()[13..],
            ["d:hide", "d:show", "d:hide", "d:unload"]
        );
    }
    #[test]
    fn background_pressure_and_drop_release_once() {
        let log = Rc::new(RefCell::new(Vec::new()));
        {
            let mut pool = InstancePool::new(1);
            pool.activate("a", || Ok::<_, ()>(Guest("a", log.clone())))
                .unwrap();
            pool.background();
            pool.memory_warning();
            assert_eq!(pool.len(), 0);
            pool.activate("b", || Ok::<_, ()>(Guest("b", log.clone())))
                .unwrap();
        }
        assert_eq!(
            *log.borrow(),
            [
                "a:show", "a:hide", "a:unload", "b:show", "b:hide", "b:unload"
            ]
        );
    }
}
