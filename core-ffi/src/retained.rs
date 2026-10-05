//! Real engine adapter for owner-thread retention. Native presentation resources
//! still require a host adapter.
use crate::{Instance, pool::RetainedGuest};

pub struct RetainedEngine {
    engine: Option<Instance>,
    failure: Option<String>,
    contacts: Vec<u8>,
    launched: bool,
    launch_data: String,
    pub(crate) completion_generation: u64,
    cleanup: Option<Box<dyn FnMut(&mut Instance)>>,
    retire: Option<Box<dyn FnMut()>>,
}
impl RetainedEngine {
    pub fn new(engine: Instance) -> Self {
        Self {
            engine: Some(engine),
            failure: None,
            contacts: Vec::new(),
            launched: false,
            launch_data: "{}".into(),
            completion_generation: 0,
            cleanup: None,
            retire: None,
        }
    }
    pub fn with_cleanup(mut self, cleanup: impl FnMut(&mut Instance) + 'static) -> Self {
        self.cleanup = Some(Box::new(cleanup));
        self
    }
    pub fn with_retirement(mut self, retire: impl FnMut() + 'static) -> Self {
        self.retire = Some(Box::new(retire));
        self
    }
    /// Host-authenticated launch context, copied before first foreground entry.
    pub fn with_launch_data(mut self, data: &str) -> Result<Self, String> {
        if self.launched || data.len() > 4096 {
            return Err("Launch data is already committed or exceeds byte limit".into());
        }
        self.launch_data = data.to_owned();
        Ok(self)
    }
    pub fn engine(&mut self) -> Result<&mut Instance, String> {
        if let Some(error) = &self.failure {
            return Err(error.clone());
        }
        self.engine
            .as_mut()
            .ok_or_else(|| "Guest was unloaded".into())
    }
    pub fn frame(
        &mut self,
        contacts: &[u32],
        hits: Option<&[i32]>,
        cancelled: &[u8],
    ) -> Result<(), String> {
        let result = self.engine()?.frame_input(contacts, hits, cancelled);
        if let Err(error) = result {
            // Invalid caller input is recoverable; a failed guest turn is not.
            if self.engine.as_ref().is_some_and(|engine| !engine.ready) {
                self.failure = Some(error.clone());
            }
            return Err(error);
        }
        self.contacts = contacts
            .iter()
            .map(|word| ((word >> if word & 0x80000000 != 0 { 20 } else { 18 }) & 255) as u8)
            .collect();
        Ok(())
    }
    fn record(&mut self, result: Result<(), String>) {
        if let Err(error) = result {
            self.failure = Some(error);
            if let Some(engine) = &mut self.engine {
                engine.stop();
            }
        }
    }
}
impl RetainedGuest for RetainedEngine {
    fn failure(&self) -> Option<String> {
        self.failure.clone().or_else(|| {
            self.engine
                .as_ref()
                .filter(|engine| !engine.ready)
                .map(|_| "Guest is not running".into())
        })
    }
    fn hide(&mut self) {
        if let Some(engine) = &mut self.engine {
            let result = if self.contacts.is_empty() {
                Ok(())
            } else {
                engine.frame_input(&[], Some(&[]), &self.contacts)
            };
            let result = result
                .and_then(|()| engine.lifecycle("hide"))
                .and_then(|()| engine.suspend());
            self.contacts.clear();
            self.record(result);
        }
    }
    fn show(&mut self) {
        if let Some(engine) = &mut self.engine {
            let result = engine.resume().and_then(|()| {
                if !self.launched {
                    engine.lifecycle_data("launch", &self.launch_data)?;
                    self.launched = true;
                }
                engine.lifecycle("show")
            });
            self.record(result);
        }
    }
    fn unload(&mut self) {
        // One bounded final frame is reserved for cleanup; a stopped guest is
        // never revived. Taking the Option guarantees immediate realm release.
        if let Some(mut engine) = self.engine.take() {
            if engine.resume().is_ok() {
                if engine.lifecycle("unload").is_ok() {
                    if engine.frame(&[]).is_ok() {
                        if let Some(cleanup) = &mut self.cleanup {
                            cleanup(&mut engine);
                        }
                    }
                }
            }
            engine.stop();
            if let Some(retire) = &mut self.retire {
                retire();
            }
        }
        self.contacts.clear();
    }
    fn memory_warning(&mut self) {
        if let Some(engine) = &mut self.engine {
            let result = engine.lifecycle("memoryWarning");
            self.record(result);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pool::InstancePool;
    fn guest(id: &str) -> Result<RetainedEngine, String> {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-android")?;
        engine.boot(
            &format!("let n=0;globalThis.frame=()=>ui.svcSend('{id}:'+ ++n)"),
            &[],
        )?;
        Ok(RetainedEngine::new(engine))
    }
    fn tick(pool: &mut InstancePool<RetainedEngine>) -> String {
        let guest = pool.foreground().unwrap();
        guest.frame(&[], None, &[]).unwrap();
        guest.engine().unwrap().take().unwrap()
    }
    #[test]
    fn retained_launch_context_is_delivered_once_and_copied() {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-android").unwrap();
        engine.boot("let launches=0,id='';globalThis.__miniLifecycle=(event,data)=>{if(event==='launch'){launches++;id=data.query.id}};globalThis.frame=()=>ui.svcSend(launches+':'+id)",&[]).unwrap();
        let mut data = String::from(r#"{"source":"qr","path":"/detail","query":{"id":"123"}}"#);
        let retained = RetainedEngine::new(engine).with_launch_data(&data).unwrap();
        data.clear();
        let mut pool = InstancePool::new(3);
        pool.activate("a", || Ok::<_, String>(retained)).unwrap();
        assert_eq!(tick(&mut pool), "1:123");
        pool.activate("b", || guest("b")).unwrap();
        pool.activate::<String>("a", || panic!("must retain launch context"))
            .unwrap();
        pool.background();
        pool.resume();
        assert_eq!(tick(&mut pool), "1:123");
    }
    #[test]
    fn terminal_frame_failure_is_unscheduled_but_invalid_input_is_recoverable() {
        let mut pool = InstancePool::new(3);
        pool.activate("healthy", || guest("healthy")).unwrap();
        let current = pool.foreground().unwrap();
        assert!(current.frame(&[0x40000000], None, &[]).is_err());
        assert_eq!(tick(&mut pool), "healthy:1");
        pool.activate("loop", || {
            let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-android")?;
            engine.boot("globalThis.frame=()=>{while(true){}}", &[])?;
            Ok::<_, String>(RetainedEngine::new(engine))
        })
        .unwrap();
        assert!(pool.foreground().unwrap().frame(&[], None, &[]).is_err());
        assert!(pool.foreground().is_none());
        pool.activate::<String>("healthy", || panic!("healthy realm must survive"))
            .unwrap();
        assert_eq!(tick(&mut pool), "healthy:2");
    }
    #[test]
    fn memory_callback_failure_cannot_keep_running() {
        let mut pool = InstancePool::new(1);
        pool.activate("memory",||{
            let mut engine=Instance::new(64,64,1,24*1024*1024,"pjm-android")?;
            engine.boot("globalThis.frame=()=>{};globalThis.__miniLifecycle=e=>{if(e==='memoryWarning')throw Error('memory hook failed')}",&[])?;
            Ok::<_,String>(RetainedEngine::new(engine))
        }).unwrap();
        pool.memory_warning();
        assert!(pool.foreground().is_none());
        pool.resume();
        assert!(pool.foreground().is_none());
        pool.memory_warning();
        assert_eq!(pool.len(), 0);
    }
    #[test]
    fn failed_show_preserves_capacity_and_previous_foreground() {
        let mut pool = InstancePool::new(1);
        pool.activate("healthy", || guest("healthy")).unwrap();
        assert_eq!(tick(&mut pool), "healthy:1");
        let failure=pool.activate("broken",||{
            let mut engine=Instance::new(64,64,1,24*1024*1024,"pjm-android")?;
            engine.boot("globalThis.frame=()=>{};globalThis.__miniLifecycle=e=>{if(e==='show')while(true){}}",&[])?;
            Ok::<_,String>(RetainedEngine::new(engine))
        });
        assert!(matches!(failure, Err(crate::pool::PoolError::Lifecycle(_))));
        assert_eq!(pool.len(), 1);
        assert_eq!(tick(&mut pool), "healthy:2");
    }
    #[test]
    fn lifecycle_order_preserves_launch_once_and_frame_count() {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-android").unwrap();
        engine.boot("let n=0;globalThis.frame=()=>ui.svcSend('frame:'+ ++n);globalThis.__miniLifecycle=e=>ui.svcSend(e)", &[]).unwrap();
        let mut guest = RetainedEngine::new(engine);
        guest.show();
        assert_eq!(guest.engine().unwrap().take().unwrap(), "launch");
        assert_eq!(guest.engine().unwrap().take().unwrap(), "show");
        guest.hide();
        guest.show();
        guest.memory_warning();
        for event in ["hide", "show", "memoryWarning"] {
            assert_eq!(guest.engine().unwrap().take().unwrap(), event);
        }
        guest.frame(&[], None, &[]).unwrap();
        assert_eq!(guest.engine().unwrap().take().unwrap(), "frame:1");
    }
    #[test]
    fn real_realms_retain_state_and_eviction_cold_starts() {
        let mut pool = InstancePool::new(3);
        pool.activate("a", || guest("a")).unwrap();
        assert_eq!(tick(&mut pool), "a:1");
        for id in ["b", "c"] {
            pool.activate(id, || guest(id)).unwrap();
            assert_eq!(tick(&mut pool), format!("{id}:1"));
        }
        pool.activate::<String>("a", || panic!("must retain a"))
            .unwrap();
        assert_eq!(tick(&mut pool), "a:2");
        pool.background();
        assert!(pool.foreground().is_none());
        pool.resume();
        assert_eq!(tick(&mut pool), "a:3");
        pool.activate("d", || guest("d")).unwrap();
        assert_eq!(tick(&mut pool), "d:1");
        pool.activate("b", || guest("b")).unwrap();
        assert_eq!(tick(&mut pool), "b:1", "LRU b must cold start");
        pool.memory_warning();
        assert_eq!(pool.len(), 1);
        assert_eq!(tick(&mut pool), "b:2");
    }
    #[test]
    fn hide_delivers_explicit_contact_cancellation_before_freezing() {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-android").unwrap();
        engine
            .boot(
                "globalThis.frame=(keys,analog,contacts)=>ui.svcSend(JSON.stringify(contacts))",
                &[],
            )
            .unwrap();
        let mut guest = RetainedEngine::new(engine);
        let contact = 0x80000000u32 | (255u32 << 20) | (12 << 10) | 600;
        guest.frame(&[contact], Some(&[0]), &[]).unwrap();
        assert_eq!(
            guest.engine().unwrap().take().unwrap(),
            format!("[{}]", contact as i32)
        );
        guest.hide();
        assert!(guest.engine().unwrap().take().is_none());
        guest.show();
        assert_eq!(
            guest.engine().unwrap().take().unwrap(),
            format!("[{}]", 0x40000000u32 | (255 << 18))
        );
        guest.hide();
        guest.show();
        assert!(
            guest.engine().unwrap().take().is_none(),
            "cancel must not repeat"
        );
    }
    #[test]
    fn hidden_engine_rejects_frames_and_preserves_mailbox() {
        let mut guest = guest("a").unwrap();
        guest.frame(&[], None, &[]).unwrap();
        guest.hide();
        assert!(guest.frame(&[], None, &[]).is_err());
        assert!(guest.engine().unwrap().take().is_none());
        guest.show();
        assert_eq!(guest.engine().unwrap().take().unwrap(), "a:1");
        guest.unload();
        assert!(guest.engine().is_err());
        guest.unload();
    }
}
