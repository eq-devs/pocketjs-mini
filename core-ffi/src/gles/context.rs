//! Explicit GPU context lifetime. Tokens are host-issued, nonzero and never reused.
//! Context loss is an assertion that the old driver context was destroyed.
use std::{marker::PhantomData, rc::Rc};

pub(crate) struct ContextState<R> {
    active: Option<(u64, R)>,
    last_token: u64,
    _owner: PhantomData<Rc<()>>,
}
impl<R> ContextState<R> {
    pub(crate) fn new() -> Self {
        Self {
            active: None,
            last_token: 0,
            _owner: PhantomData,
        }
    }
    pub(crate) fn attach(
        &mut self,
        token: u64,
        create: impl FnOnce() -> Option<R>,
    ) -> Result<(), &'static str> {
        if token == 0 || token <= self.last_token {
            return Err("Invalid GPU context token");
        }
        if self.active.is_some() {
            return Err("GPU context already attached");
        }
        let renderer = create().ok_or("GPU renderer creation failed")?;
        self.active = Some((token, renderer));
        self.last_token = token;
        Ok(())
    }
    pub(crate) fn current(&mut self, token: u64) -> Result<&mut R, &'static str> {
        match self.active.as_mut() {
            Some((bound, renderer)) if *bound == token => Ok(renderer),
            _ => Err("GPU context unavailable or mismatched"),
        }
    }
    pub(crate) fn is_attached(&self) -> bool {
        self.active.is_some()
    }
    pub(crate) fn epoch(&self) -> Option<u64> {
        self.active.as_ref().map(|(epoch, _)| *epoch)
    }
    /// Caller guarantees this token's original context is current.
    pub(crate) fn release(
        &mut self,
        token: u64,
        destroy: impl FnOnce(&mut R),
    ) -> Result<(), &'static str> {
        self.current(token)?;
        let (_, mut renderer) = self.active.take().unwrap();
        destroy(&mut renderer);
        Ok(())
    }
    /// No driver deletion: names belong to a context the host says was lost.
    pub(crate) fn lost(&mut self, token: u64) -> Result<(), &'static str> {
        self.current(token)?;
        self.active = None;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mismatched_context_cannot_render_delete_or_retire_owned_names() {
        let mut state = ContextState::new();
        state.attach(1, || Some(17)).unwrap();
        assert!(state.current(2).is_err());
        assert!(state.lost(2).is_err());
        let mut deletes = 0;
        assert!(state.release(2, |_| deletes += 1).is_err());
        assert_eq!(deletes, 0);
        assert_eq!(*state.current(1).unwrap(), 17);
        state
            .release(1, |value| {
                assert_eq!(*value, 17);
                deletes += 1;
            })
            .unwrap();
        assert_eq!(deletes, 1);
        assert!(state.current(1).is_err());
        assert!(state.release(1, |_| deletes += 1).is_err());
        assert_eq!(deletes, 1);
    }
    #[test]
    fn lost_context_recreates_without_deleting_old_driver_names() {
        let mut state = ContextState::new();
        state.attach(10, || Some(vec![31, 32])).unwrap();
        assert!(state.attach(11, || Some(vec![33])).is_err());
        state.lost(10).unwrap();
        assert!(
            state
                .attach(10, || panic!("Reused token created a renderer"))
                .is_err()
        );
        state.attach(11, || Some(vec![33])).unwrap();
        assert!(state.current(10).is_err());
        assert_eq!(state.current(11).unwrap(), &vec![33]);
    }
    #[test]
    fn failed_attach_preserves_empty_state_and_other_instances() {
        let mut first = ContextState::<u32>::new();
        let mut second = ContextState::new();
        assert!(
            first
                .attach(0, || panic!("Invalid token created a renderer"))
                .is_err()
        );
        assert!(first.attach(1, || None).is_err());
        second.attach(1, || Some(9)).unwrap();
        first.attach(2, || Some(7)).unwrap();
        first.lost(2).unwrap();
        assert_eq!(*second.current(1).unwrap(), 9);
    }
}
