//! Development-only replay sessions over the same engine as the mobile hosts.
//! The caller validates the tape/package hash and admits the embedded build plan.
use crate::{
    Instance,
    package_ffi::{MpPackageInputs, mp_package_select},
};
use std::{mem::size_of, ptr, slice};

pub struct ReplayFrame {
    pub pixels: Vec<u8>,
    pub effects: Vec<String>,
}

pub struct ReplaySession {
    engine: Instance,
    frames: usize,
    stopped: bool,
}

impl ReplaySession {
    pub fn new(
        payload: &[u8],
        identity: &str,
        target: &str,
        width: u32,
        height: u32,
        density: u32,
        launch: &str,
        admit_plan: impl FnOnce(&[u8]) -> Result<(), String>,
    ) -> Result<Self, String> {
        let target_id = match target {
            "pjm-ios" => 1,
            "pjm-android" => 2,
            _ => return Err("Invalid replay target".into()),
        };
        let mut selected = MpPackageInputs {
            size: size_of::<MpPackageInputs>() as u32,
            js: ptr::null(),
            js_len: 0,
            pak: ptr::null(),
            pak_len: 0,
            plan: ptr::null(),
            plan_len: 0,
        };
        // These slices borrow payload only during this call. Structural selection
        // checks all offsets/lengths before returning them to the caller.
        if unsafe {
            mp_package_select(
                payload.as_ptr(),
                payload.len(),
                target_id,
                identity.as_ptr(),
                identity.len(),
                &mut selected,
            )
        } != 0
        {
            return Err("Replay package structural admission failed".into());
        }
        let plan = unsafe { slice::from_raw_parts(selected.plan, selected.plan_len) };
        admit_plan(plan)?;
        let source =
            std::str::from_utf8(unsafe { slice::from_raw_parts(selected.js, selected.js_len) })
                .map_err(|_| "Replay guest UTF-8")?;
        let pak = unsafe { slice::from_raw_parts(selected.pak, selected.pak_len) };
        let mut engine = Instance::new(width, height, density, 32 * 1024 * 1024, target)?;
        engine.boot(source, pak)?;
        engine.lifecycle_data("launch", launch)?;
        engine.lifecycle("show")?;
        Ok(Self {
            engine,
            frames: 0,
            stopped: false,
        })
    }

    fn ready(&self) -> Result<(), String> {
        if self.stopped {
            Err("Replay session stopped".into())
        } else {
            Ok(())
        }
    }
    pub fn completion(&mut self, record: &str) -> Result<(), String> {
        self.ready()?;
        if let Err(error) = self.engine.post(record) {
            self.stopped = true;
            return Err(error);
        }
        Ok(())
    }
    pub fn lifecycle(&mut self, event: &str) -> Result<(), String> {
        self.ready()?;
        if !["show", "hide", "memoryWarning"].contains(&event) {
            return Err("Invalid replay lifecycle".into());
        }
        if let Err(error) = self.engine.lifecycle(event) {
            self.stopped = true;
            return Err(error);
        }
        Ok(())
    }
    pub fn frame(
        &mut self,
        contacts: &[u32],
        hits: &[i32],
        cancelled: &[u8],
    ) -> Result<ReplayFrame, String> {
        self.ready()?;
        if self.frames >= 36000 {
            self.stopped = true;
            return Err("Replay frame limit".into());
        }
        let result = (|| {
            self.engine.frame_input(contacts, Some(hits), cancelled)?;
            let pixels = self.engine.render()?.to_vec();
            let mut effects = Vec::new();
            while let Some(record) = self.engine.take() {
                effects.push(record);
            }
            self.frames += 1;
            Ok(ReplayFrame { pixels, effects })
        })();
        if result.is_err() {
            self.stopped = true;
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pocketjs_core::package::{MAGIC, VERSION, fnv1a64, section};

    fn package(source: &str) -> Vec<u8> {
        fn put(bytes: &mut [u8], offset: usize, value: u32) {
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        let mut identity = Vec::new();
        for text in ["replay", "dev.pjm.replay", "Replay"] {
            identity.extend_from_slice(&(text.len() as u16).to_le_bytes());
            identity.extend_from_slice(text.as_bytes());
        }
        let mut js = source.as_bytes().to_vec();
        js.push(0);
        let sections = [
            (section::IDENTITY, identity),
            (section::PLAN, b"{}".to_vec()),
            (section::JS, js),
            (section::PAK, vec![0; 4]),
        ];
        let mut bytes = vec![0; 136];
        put(&mut bytes, 0, MAGIC);
        put(&mut bytes, 4, VERSION);
        put(&mut bytes, 8, 2);
        put(&mut bytes, 12, 1);
        bytes[16..18].copy_from_slice(b"{}");
        bytes[32..39].copy_from_slice(b"pjm-ios");
        put(&mut bytes, 48, 7);
        put(&mut bytes, 52, 4);
        put(&mut bytes, 56, 72);
        for (index, (kind, value)) in sections.into_iter().enumerate() {
            while bytes.len() % 16 != 0 {
                bytes.push(0);
            }
            let offset = bytes.len();
            put(&mut bytes, 72 + index * 16, kind);
            put(&mut bytes, 80 + index * 16, offset as u32);
            put(&mut bytes, 84 + index * 16, value.len() as u32);
            bytes.extend_from_slice(&value);
        }
        let hash = fnv1a64(&[&bytes]);
        bytes.extend_from_slice(&hash.to_le_bytes());
        bytes
    }
    fn session(payload: &[u8]) -> ReplaySession {
        ReplaySession::new(
            payload,
            "dev.pjm.replay",
            "pjm-ios",
            16,
            16,
            1,
            r#"{"query":{"page":"detail"}}"#,
            |plan| {
                if plan == b"{}" {
                    Ok(())
                } else {
                    Err("Unexpected test plan".into())
                }
            },
        )
        .unwrap()
    }
    #[test]
    fn original_launch_and_completion_order_reproduce_native_frames() {
        let payload = package(
            "let n=0;globalThis.__miniLifecycle=(e,d)=>{if(e==='launch')ui.svcSend(d.query.page)};globalThis.frame=()=>{ui.setProp(1,64,0xff000000+(++n));ui.svcSend(n+':'+(ui.svcPoll()||'').trim())}",
        );
        let mut first = session(&payload);
        let mut second = session(&payload);
        for engine in [&mut first, &mut second] {
            engine.completion("recorded-reply").unwrap();
        }
        let a = first.frame(&[], &[], &[]).unwrap();
        let b = second.frame(&[], &[], &[]).unwrap();
        assert_eq!(a.pixels, b.pixels);
        assert_eq!(a.pixels.len(), 16 * 16 * 4);
        assert_eq!(a.effects, vec!["detail", "1:recorded-reply"]);
        assert_eq!(a.effects, b.effects);
        let a = first.frame(&[], &[], &[]).unwrap();
        let b = second.frame(&[], &[], &[]).unwrap();
        assert_eq!(a.pixels, b.pixels);
        assert_eq!(a.effects, vec!["2:"]);
        assert_eq!(a.effects, b.effects);
    }
    #[test]
    fn structural_and_plan_rejections_precede_guest_boot() {
        let payload = package("while(true){}");
        assert!(
            ReplaySession::new(
                &payload,
                "dev.other.app",
                "pjm-ios",
                16,
                16,
                1,
                "{}",
                |_| panic!("Must not admit mismatched identity")
            )
            .is_err()
        );
        let result = ReplaySession::new(
            &payload,
            "dev.pjm.replay",
            "pjm-ios",
            16,
            16,
            1,
            "{}",
            |_| Err("Plan denied before boot".into()),
        );
        assert_eq!(result.err().unwrap(), "Plan denied before boot");
    }
    #[test]
    fn failed_guest_turn_stops_replay_and_discards_effects() {
        let payload = package(
            "globalThis.frame=()=>{ui.svcSend('failed-effect');throw Error('replay failure')}",
        );
        let mut engine = session(&payload);
        assert!(engine.frame(&[], &[], &[]).is_err());
        assert!(
            engine
                .frame(&[], &[], &[])
                .err()
                .unwrap()
                .contains("stopped")
        );
    }
}
