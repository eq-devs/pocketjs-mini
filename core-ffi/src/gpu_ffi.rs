//! Synchronous owner-thread GPU snapshot callback; no pointers escape the call.
use crate::{Instance, gpu_frame, gpu_geometry};
use std::ffi::c_void;
#[repr(C)]
pub struct MpGpuTexture {
    pub handle: u32,
    pub revision: u64,
    pub width: u32,
    pub height: u32,
    pub linear: u32,
    pub pixels: *const u8,
    pub length: usize,
}
#[repr(C)]
pub struct MpGpuSnapshot {
    pub size: u32,
    pub width: f32,
    pub height: f32,
    pub vertices: *const gpu_geometry::Vertex,
    pub vertex_count: usize,
    pub commands: *const gpu_geometry::Command,
    pub command_count: usize,
    pub textures: *const MpGpuTexture,
    pub texture_count: usize,
}
pub type MpGpuCallback = unsafe extern "C" fn(*mut c_void, *const MpGpuSnapshot) -> i32;
pub(crate) unsafe fn deliver(
    engine: &mut Instance,
    max_side: u32,
    callback: Option<MpGpuCallback>,
    context: *mut c_void,
) -> Result<(), String> {
    let callback = callback.ok_or("Missing GPU snapshot callback")?;
    if max_side == 0 || max_side > 16384 {
        return Err("Invalid GPU texture dimension limit".into());
    }
    if !engine.ready || engine.suspended {
        return Err("GPU snapshot guest unavailable".into());
    }
    let snapshot = engine
        .surface
        .with_ui(|ui| gpu_frame::capture_frame(ui, max_side))
        .ok_or("GPU snapshot admission failed")?;
    let geometry = gpu_geometry::expand(&snapshot).ok_or("GPU geometry admission failed")?;
    let _descriptor_allocation = crate::gpu_budget::reserve(
        snapshot
            .textures
            .len()
            .checked_mul(std::mem::size_of::<MpGpuTexture>())
            .ok_or("GPU descriptor size overflow")?,
    )
    .ok_or("GPU snapshot copy budget exceeded")?;
    let mut textures = Vec::new();
    textures
        .try_reserve_exact(snapshot.textures.len())
        .map_err(|_| "GPU descriptor allocation failed")?;
    for texture in &snapshot.textures {
        textures.push(MpGpuTexture {
            handle: texture.handle as u32,
            revision: texture.revision,
            width: texture.width,
            height: texture.height,
            linear: u32::from(texture.linear),
            pixels: texture.rgba.as_ptr(),
            length: texture.rgba.len(),
        });
    }
    let frame = MpGpuSnapshot {
        size: std::mem::size_of::<MpGpuSnapshot>() as u32,
        width: snapshot.draw.width,
        height: snapshot.draw.height,
        vertices: geometry.vertices.as_ptr(),
        vertex_count: geometry.vertices.len(),
        commands: geometry.commands.as_ptr(),
        command_count: geometry.commands.len(),
        textures: textures.as_ptr(),
        texture_count: textures.len(),
    };
    if unsafe { callback(context, &frame) } != 0 {
        return Err("Host rejected GPU snapshot".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ffi::*;
    struct Capture {
        handle: *mut MpInstance,
        calls: usize,
        reject: std::cell::Cell<bool>,
    }
    unsafe extern "C" fn receive(context: *mut c_void, frame: *const MpGpuSnapshot) -> i32 {
        let capture = unsafe { &mut *context.cast::<Capture>() };
        let frame = unsafe { &*frame };
        assert_eq!(frame.size, std::mem::size_of::<MpGpuSnapshot>() as u32);
        assert_eq!((frame.width, frame.height), (64.0, 64.0));
        assert_eq!(frame.vertex_count, 6);
        let vertices = unsafe { std::slice::from_raw_parts(frame.vertices, frame.vertex_count) };
        assert!(vertices.iter().all(|vertex| vertex.color == 0xff00ff00));
        assert_eq!(unsafe { mp_frame(capture.handle, std::ptr::null(), 0) }, -1);
        capture.calls += 1;
        i32::from(capture.reject.get())
    }
    #[test]
    fn callback_rejection_reentry_and_invalid_limits_preserve_guest() {
        unsafe {
            let config = MpConfig {
                size: 28,
                abi: 1,
                width: 64,
                height: 64,
                density: 1,
                heap_bytes: 24 * 1024 * 1024,
                target: 1,
            };
            let handle = mp_create(&config);
            assert!(!handle.is_null());
            let js = b"ui.setProp(1,64,0xff00ff00);globalThis.frame=()=>{}";
            assert_eq!(
                mp_boot(handle, js.as_ptr(), js.len(), std::ptr::null(), 0),
                0
            );
            assert_eq!(mp_frame(handle, std::ptr::null(), 0), 0);
            let mut capture = Capture {
                handle,
                calls: 0,
                reject: std::cell::Cell::new(false),
            };
            let context = (&mut capture as *mut Capture).cast();
            assert_eq!(mp_gpu_snapshot(handle, 0, Some(receive), context), -1);
            assert_eq!(mp_gpu_snapshot(handle, 16385, Some(receive), context), -1);
            assert_eq!(mp_gpu_snapshot(handle, 4096, None, context), -1);
            assert_eq!(capture.calls, 0);
            assert_eq!(mp_gpu_snapshot(handle, 4096, Some(receive), context), 0);
            assert_eq!(capture.calls, 1);
            capture.reject.set(true);
            assert_eq!(mp_gpu_snapshot(handle, 4096, Some(receive), context), -1);
            assert_eq!(mp_frame(handle, std::ptr::null(), 0), 0);
            assert_eq!(mp_destroy(handle), 0);
        }
    }
}
