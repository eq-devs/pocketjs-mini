//! Tiny ABI adapter. Upstream owns QuickJS, layout, rasterization and touch.
use pocket_apple::*;
use std::ffi::c_char;

pub struct Mini {
    engine: *mut PocketApple,
    frame: PocketAppleFrame,
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pjm_create(
    js: *const u8,
    js_len: usize,
    pak: *const u8,
    pak_len: usize,
) -> *mut Mini {
    let engine = pocket_apple_create(1, 480, 272);
    if engine.is_null() {
        return std::ptr::null_mut();
    }
    let status = pocket_apple_set_identity(engine, c"ios-dev".as_ptr(), 7);
    if status != 0
        || pocket_apple_load_pak(engine, pak, pak_len) != 0
        || pocket_apple_eval_bundle(engine, js, js_len, c"mini".as_ptr()) != 0
    {
        pocket_apple_destroy(engine);
        return std::ptr::null_mut();
    }
    Box::into_raw(Box::new(Mini {
        engine,
        frame: unsafe { std::mem::zeroed() },
    }))
}

#[unsafe(no_mangle)]
pub extern "C" fn pjm_error() -> *const c_char {
    pocket_apple_last_error()
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pjm_tick(handle: *mut Mini, contact: i64) -> i32 {
    if handle.is_null() {
        return -1;
    }
    let state = unsafe { &mut *handle };
    let word = contact as u32;
    pocket_apple_frame(state.engine, 0, 0, &word, usize::from(contact >= 0))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pjm_pixels(handle: *mut Mini) -> *const u8 {
    if handle.is_null() {
        return std::ptr::null();
    }
    let state = unsafe { &mut *handle };
    if pocket_apple_render(state.engine, &mut state.frame) != 0 {
        return std::ptr::null();
    }
    state.frame.pixels
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn pjm_destroy(handle: *mut Mini) {
    if !handle.is_null() {
        let state = unsafe { Box::from_raw(handle) };
        pocket_apple_destroy(state.engine);
    }
}
