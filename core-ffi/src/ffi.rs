use crate::Instance;
use std::{
    ffi::{c_char, CString},
    panic::{catch_unwind, AssertUnwindSafe},
    slice,
    thread::{self, ThreadId},
};
#[repr(C)]
pub struct MpConfig {
    pub size: u32,
    pub abi: u32,
    pub width: u32,
    pub height: u32,
    pub density: u32,
    pub heap_bytes: u32,
    pub target: u32,
}
#[repr(C)]
pub struct MpFrame {
    pub pixels: *const u8,
    pub length: usize,
    pub width: u32,
    pub height: u32,
    pub stride: u32,
}
pub struct MpInstance {
    engine: Instance,
    owner: ThreadId,
    error: CString,
}
fn call<R>(
    handle: *mut MpInstance,
    failed: R,
    action: impl FnOnce(&mut MpInstance) -> Result<R, String>,
) -> R {
    if handle.is_null() {
        return failed;
    }
    // Opaque handle validity/lifetime is the native caller's contract.
    let owner = unsafe { std::ptr::addr_of!((*handle).owner).read() };
    if owner != thread::current().id() {
        return failed;
    }
    let state = unsafe { &mut *handle };
    match catch_unwind(AssertUnwindSafe(|| action(state))) {
        Ok(Ok(value)) => value,
        result => {
            let message = match result {
                Ok(Err(message)) => message,
                _ => {
                    state.engine.stop();
                    "Engine panic; instance stopped".into()
                }
            };
            state.error = CString::new(
                message
                    .chars()
                    .take(512)
                    .map(|c| if c == '\0' { ' ' } else { c })
                    .collect::<String>(),
            )
            .unwrap();
            failed
        }
    }
}
unsafe fn bytes<'a>(pointer: *const u8, length: usize, limit: usize) -> Result<&'a [u8], String> {
    if length > limit || (pointer.is_null() && length != 0) {
        return Err("Invalid byte span".into());
    }
    if length == 0 {
        Ok(&[])
    } else {
        Ok(unsafe { slice::from_raw_parts(pointer, length) })
    }
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_abi_version() -> u32 {
    1
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_create(config: *const MpConfig) -> *mut MpInstance {
    if config.is_null() {
        return std::ptr::null_mut();
    }
    let result = catch_unwind(AssertUnwindSafe(|| {
        if unsafe { (*config).size } < (std::mem::size_of::<MpConfig>() as u32) {
            return Err("Invalid configuration size".to_string());
        }
        let config = unsafe { &*config };
        if config.abi != 1 {
            return Err("Unsupported ABI".into());
        }
        let target = match config.target {
            1 => "pjm-ios",
            2 => "pjm-android",
            _ => return Err("Invalid target".into()),
        };
        let engine = Instance::new(
            config.width,
            config.height,
            config.density,
            config.heap_bytes as usize,
            target,
        )?;
        Ok(Box::into_raw(Box::new(MpInstance {
            engine,
            owner: thread::current().id(),
            error: CString::default(),
        })))
    }));
    result
        .ok()
        .and_then(Result::ok)
        .unwrap_or(std::ptr::null_mut())
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_boot(
    handle: *mut MpInstance,
    js: *const u8,
    js_len: usize,
    pak: *const u8,
    pak_len: usize,
) -> i32 {
    call(handle, -1, |state| {
        let js = unsafe { bytes(js, js_len, 16 * 1024 * 1024) }?;
        let pak = unsafe { bytes(pak, pak_len, 64 * 1024 * 1024) }?;
        state.engine.boot(
            std::str::from_utf8(js).map_err(|_| "Guest source is not UTF-8")?,
            pak,
        )?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_frame(
    handle: *mut MpInstance,
    contacts: *const u32,
    count: usize,
) -> i32 {
    call(handle, -1, |state| {
        if count > 8 || (contacts.is_null() && count != 0) {
            return Err("Invalid contacts".into());
        }
        let touches = if count == 0 {
            &[]
        } else {
            unsafe { slice::from_raw_parts(contacts, count) }
        };
        state.engine.frame(touches)?;
        Ok(0)
    })
}
#[repr(C)]
pub struct MpInput {
    pub size: u32,
    pub count: u32,
    pub contacts: [u32; 8],
    pub hits: [i32; 8],
    pub cancelled_count: u32,
    pub cancelled: [u8; 8],
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_frame_input(handle: *mut MpInstance, input: *const MpInput) -> i32 {
    call(handle, -1, |state| {
        if input.is_null() || unsafe { (*input).size } < std::mem::size_of::<MpInput>() as u32 {
            return Err("Invalid input size".into());
        }
        let input = unsafe { &*input };
        if input.count > 8 || input.cancelled_count > 8 {
            return Err("Invalid input counts".into());
        }
        let count = input.count as usize;
        state.engine.frame_input(
            &input.contacts[..count],
            Some(&input.hits[..count]),
            &input.cancelled[..input.cancelled_count as usize],
        )?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_hit_test(
    handle: *mut MpInstance,
    x: f32,
    y: f32,
    output: *mut i32,
) -> i32 {
    call(handle, -1, |state| {
        if output.is_null() {
            return Err("Missing hit output".into());
        }
        let hit = state.engine.hit_test(x, y)?;
        unsafe {
            *output = hit;
        }
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_render(handle: *mut MpInstance, output: *mut MpFrame) -> i32 {
    call(handle, -1, |state| {
        if output.is_null() {
            return Err("Missing frame output".into());
        }
        let (width, height) = state.engine.dimensions();
        let pixels = state.engine.render()?;
        unsafe {
            *output = MpFrame {
                pixels: pixels.as_ptr(),
                length: pixels.len(),
                width,
                height,
                stride: width * 4,
            }
        };
        Ok(0)
    })
}
#[repr(C)]
pub struct MpDamage {
    pub size: u32,
    pub full_redraw: u32,
    pub count: u32,
    pub regions: [[u32; 4]; 8],
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_render_damage(
    handle: *mut MpInstance,
    output: *mut MpFrame,
    damage: *mut MpDamage,
) -> i32 {
    call(handle, -1, |state| {
        if output.is_null()
            || damage.is_null()
            || unsafe { (*damage).size } < std::mem::size_of::<MpDamage>() as u32
        {
            return Err("Invalid frame or damage output".into());
        }
        let (width, height) = state.engine.dimensions();
        let pixels = state.engine.render()?;
        let frame = MpFrame {
            pixels: pixels.as_ptr(),
            length: pixels.len(),
            width,
            height,
            stride: width * 4,
        };
        let plan = state.engine.damage();
        let scale = state.engine.density();
        let mut result = MpDamage {
            size: std::mem::size_of::<MpDamage>() as u32,
            full_redraw: u32::from(plan.is_full_redraw()),
            count: plan.region_count() as u32,
            regions: [[0; 4]; 8],
        };
        for (slot, rect) in result.regions.iter_mut().zip(plan.regions()) {
            *slot = [
                rect.x0.max(0) as u32 * scale,
                rect.y0.max(0) as u32 * scale,
                (rect.x1 - rect.x0).max(0) as u32 * scale,
                (rect.y1 - rect.y0).max(0) as u32 * scale,
            ];
        }
        unsafe {
            *output = frame;
            *damage = result;
        }
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_svc_take(
    handle: *mut MpInstance,
    output: *mut u8,
    capacity: usize,
) -> isize {
    call(handle, -1, |state| {
        if capacity > 32 * 4097 || (output.is_null() && capacity != 0) {
            return Err("Invalid completion output".into());
        }
        let output = if capacity == 0 {
            &mut []
        } else {
            unsafe { slice::from_raw_parts_mut(output, capacity) }
        };
        state.engine.take_into(output).map(|count| count as isize)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_svc_post(
    handle: *mut MpInstance,
    line: *const u8,
    length: usize,
) -> i32 {
    call(handle, -1, |state| {
        let line = unsafe { bytes(line, length, 4096) }?;
        state
            .engine
            .post(std::str::from_utf8(line).map_err(|_| "Completion is not UTF-8")?)?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_last_error(handle: *mut MpInstance) -> *const c_char {
    call(handle, std::ptr::null(), |state| Ok(state.error.as_ptr()))
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_destroy(handle: *mut MpInstance) -> i32 {
    if handle.is_null() {
        return 0;
    }
    if unsafe { (*handle).owner } != thread::current().id() {
        return -1;
    }
    let result = catch_unwind(AssertUnwindSafe(|| drop(unsafe { Box::from_raw(handle) })));
    if result.is_ok() {
        0
    } else {
        -1
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn mp_suspend(handle: *mut MpInstance) -> i32 {
    call(handle, -1, |state| {
        state.engine.suspend()?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_resume(handle: *mut MpInstance) -> i32 {
    call(handle, -1, |state| {
        state.engine.resume()?;
        Ok(0)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn mp_lifecycle(handle: *mut MpInstance, event: u32) -> i32 {
    call(handle, -1, |state| {
        let name = match event {
            1 => "launch",
            2 => "show",
            3 => "hide",
            4 => "unload",
            5 => "memoryWarning",
            _ => return Err("Invalid lifecycle event".into()),
        };
        state.engine.lifecycle(name)?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_launch(handle: *mut MpInstance, data: *const u8, length: usize) -> i32 {
    call(handle, -1, |state| {
        let payload = unsafe { bytes(data, length, 4096) }?;
        let payload = std::str::from_utf8(payload).map_err(|_| "Launch data is not UTF-8")?;
        state.engine.lifecycle_data("launch", payload)?;
        Ok(0)
    })
}
