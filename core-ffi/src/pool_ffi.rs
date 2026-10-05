//! C entry points for the shared owner-thread retained engine container.
use crate::{
    Instance,
    ffi::{MpConfig, MpFrame},
    pool::InstancePool,
    retained::RetainedEngine,
};
use std::{
    cell::RefCell,
    ffi::{CString, c_char},
    panic::{AssertUnwindSafe, catch_unwind},
    rc::Rc,
    slice,
    thread::{self, ThreadId},
};
type Cleanup = unsafe extern "C" fn(*mut std::ffi::c_void, *const u8, usize, u64, *const u8, usize);
type Retire = unsafe extern "C" fn(*mut std::ffi::c_void, *const u8, usize, u64);
struct CleanupTarget {
    callback: Option<Cleanup>,
    context: *mut std::ffi::c_void,
    retire: Option<Retire>,
    retire_context: *mut std::ffi::c_void,
}
pub struct MpPool {
    #[cfg(target_os = "android")]
    gles_epoch: Option<u64>,
    #[cfg(target_os = "android")]
    last_gles_epoch: u64,
    owner: ThreadId,
    pool: InstancePool<RetainedEngine>,
    error: CString,
    next_generation: u64,
    cleanup: Rc<RefCell<CleanupTarget>>,
}
thread_local! {
    static ACTIVE_POOLS: RefCell<std::collections::HashSet<usize>> = RefCell::new(std::collections::HashSet::new());
}
struct CallGuard(usize);
impl CallGuard {
    fn enter(handle: *mut MpPool) -> Option<Self> {
        let key = handle as usize;
        let inserted = ACTIVE_POOLS.with(|active| active.borrow_mut().insert(key));
        if inserted { Some(Self(key)) } else { None }
    }
}
impl Drop for CallGuard {
    fn drop(&mut self) {
        ACTIVE_POOLS.with(|active| {
            active.borrow_mut().remove(&self.0);
        });
    }
}
fn call<T>(
    handle: *mut MpPool,
    failed: T,
    action: impl FnOnce(&mut MpPool) -> Result<T, String>,
) -> T {
    call_inner(handle, failed, true, action)
}
fn call_inner<T>(
    handle: *mut MpPool,
    failed: T,
    verify_gpu: bool,
    action: impl FnOnce(&mut MpPool) -> Result<T, String>,
) -> T {
    // Reject reentry before dereferencing a handle already borrowed by the
    // outer call, including while destruction callbacks run.
    let Some(_guard) = CallGuard::enter(handle) else {
        return failed;
    };
    if handle.is_null()
        || unsafe { std::ptr::addr_of!((*handle).owner).read() } != thread::current().id()
    {
        return failed;
    }
    let state = unsafe { &mut *handle };
    match catch_unwind(AssertUnwindSafe(|| {
        #[cfg(target_os = "android")]
        if verify_gpu {
            check_gpu(state)?;
        }
        #[cfg(not(target_os = "android"))]
        let _ = verify_gpu;
        action(state)
    })) {
        Ok(Ok(value)) => value,
        result => {
            let error = match result {
                Ok(Err(error)) => error,
                _ => {
                    state.pool = InstancePool::new(1);
                    "Container panic; guests released".into()
                }
            };
            state.error = CString::new(error.replace('\0', "?")).unwrap();
            failed
        }
    }
}
#[cfg(target_os = "android")]
fn check_gpu(state: &mut MpPool) -> Result<(), String> {
    state.pool.visit(|guest| {
        if let Some(engine) = guest.resources() {
            if let Some(epoch) = engine.graphics.epoch() {
                engine
                    .graphics
                    .current(epoch)
                    .map_err(str::to_owned)?
                    .require_current()?;
            }
        }
        Ok(())
    })
}
unsafe fn bytes<'a>(data: *const u8, length: usize, limit: usize) -> Result<&'a [u8], String> {
    if length > limit || (length > 0 && data.is_null()) {
        return Err("Invalid container input buffer".into());
    }
    Ok(if length == 0 {
        &[]
    } else {
        unsafe { slice::from_raw_parts(data, length) }
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_create(capacity: u32) -> *mut MpPool {
    if !(1..=3).contains(&capacity) {
        return std::ptr::null_mut();
    }
    catch_unwind(|| {
        Box::into_raw(Box::new(MpPool {
            #[cfg(target_os = "android")]
            gles_epoch: None,
            #[cfg(target_os = "android")]
            last_gles_epoch: 0,
            owner: thread::current().id(),
            pool: InstancePool::new(capacity as usize),
            error: CString::new("").unwrap(),
            next_generation: 1,
            cleanup: Rc::new(RefCell::new(CleanupTarget {
                callback: None,
                retire: None,
                retire_context: std::ptr::null_mut(),
                context: std::ptr::null_mut(),
            })),
        }))
    })
    .unwrap_or(std::ptr::null_mut())
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_activate(
    handle: *mut MpPool,
    id: *const u8,
    id_len: usize,
    config: *const MpConfig,
    js: *const u8,
    js_len: usize,
    pak: *const u8,
    pak_len: usize,
    launch: *const u8,
    launch_len: usize,
) -> i32 {
    call(handle, -1, |state| {
        let id = std::str::from_utf8(unsafe { bytes(id, id_len, 128) }?)
            .map_err(|_| "Container identity is not UTF-8")?;
        if id.is_empty()
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
        {
            return Err("Invalid container identity".into());
        }
        if config.is_null() {
            return Err("Missing engine configuration".into());
        }
        let config = unsafe { &*config };
        if config.size != std::mem::size_of::<MpConfig>() as u32 || config.abi != 1 {
            return Err("Invalid engine configuration ABI".into());
        }
        let target = match config.target {
            1 => "pjm-ios",
            2 => "pjm-android",
            _ => return Err("Invalid engine target".into()),
        };
        let js = std::str::from_utf8(unsafe { bytes(js, js_len, 16 * 1024 * 1024) }?)
            .map_err(|_| "Guest source is not UTF-8")?;
        let pak = unsafe { bytes(pak, pak_len, 64 * 1024 * 1024) }?;
        let launch = std::str::from_utf8(unsafe { bytes(launch, launch_len, 4096) }?)
            .map_err(|_| "Launch data is not UTF-8")?;
        let generation = state.next_generation;
        state.next_generation = generation
            .checked_add(1)
            .ok_or("Guest generations exhausted")?;
        let cleanup = state.cleanup.clone();
        let identity = id.to_owned();
        let retirement = cleanup.clone();
        let retired_identity = identity.clone();
        state
            .pool
            .activate(id, || {
                let mut engine = Instance::new(
                    config.width,
                    config.height,
                    config.density,
                    config.heap_bytes as usize,
                    target,
                )?;
                engine.boot(js, pak)?;
                let mut guest = RetainedEngine::new(engine)
                    .with_launch_data(if launch.is_empty() { "{}" } else { launch })?;
                guest.completion_generation = generation;
                Ok::<_, String>(
                    guest
                        .with_resource_retirement(|engine| {
                            #[cfg(target_os = "android")]
                            if let Some(epoch) = engine.graphics.epoch() {
                                // Pool mutation checks every retained binding before guest turns.
                                unsafe {
                                    engine
                                        .release_gles(epoch)
                                        .expect("Pool EGL retirement invariant");
                                }
                            }
                            #[cfg(not(target_os = "android"))]
                            let _ = engine;
                        })
                        .with_retirement(move || {
                            let target = retirement.borrow();
                            if let Some(callback) = target.retire {
                                unsafe {
                                    callback(
                                        target.retire_context,
                                        retired_identity.as_ptr(),
                                        retired_identity.len(),
                                        generation,
                                    )
                                }
                            }
                        })
                        .with_cleanup(move |engine| {
                            let target = cleanup.borrow();
                            if let Some(callback) = target.callback {
                                // Mailbox capacity bounds retirement to 32 records.
                                while let Some(line) = engine.take() {
                                    unsafe {
                                        callback(
                                            target.context,
                                            identity.as_ptr(),
                                            identity.len(),
                                            generation,
                                            line.as_ptr(),
                                            line.len(),
                                        )
                                    };
                                }
                            }
                        }),
                )
            })
            .map_err(|error| format!("{error:?}"))?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_set_cleanup(
    handle: *mut MpPool,
    callback: Option<Cleanup>,
    context: *mut std::ffi::c_void,
) -> i32 {
    call(handle, -1, |state| {
        let mut target = state.cleanup.borrow_mut();
        target.callback = callback;
        target.context = context;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_frame(
    handle: *mut MpPool,
    contacts: *const u32,
    count: usize,
) -> i32 {
    call(handle, -1, |state| {
        if count > 8 || (count > 0 && contacts.is_null()) {
            return Err("Invalid contacts".into());
        }
        let contacts = if count == 0 {
            &[]
        } else {
            unsafe { slice::from_raw_parts(contacts, count) }
        };
        state
            .pool
            .foreground()
            .ok_or("No foreground guest")?
            .frame(contacts, None, &[])?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_render(handle: *mut MpPool, output: *mut MpFrame) -> i32 {
    call(handle, -1, |state| {
        if output.is_null() {
            return Err("Missing frame output".into());
        }
        let engine = state
            .pool
            .foreground()
            .ok_or("No foreground guest")?
            .engine()?;
        let (width, height) = engine.dimensions();

        let pixels = engine.render()?;
        unsafe {
            output.write(MpFrame {
                pixels: pixels.as_ptr(),
                length: pixels.len(),
                width,
                height,
                stride: width * 4,
            })
        };
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_svc_take(
    handle: *mut MpPool,
    output: *mut u8,
    capacity: usize,
) -> isize {
    call(handle, -1, |state| {
        if capacity > 32 * 4097 || (capacity > 0 && output.is_null()) {
            return Err("Invalid completion output".into());
        }
        let output = if capacity == 0 {
            &mut []
        } else {
            unsafe { slice::from_raw_parts_mut(output, capacity) }
        };
        Ok(state
            .pool
            .foreground()
            .ok_or("No foreground guest")?
            .engine()?
            .take_into(output)? as isize)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_background(handle: *mut MpPool) -> i32 {
    call(handle, -1, |state| {
        state.pool.background();
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_resume(handle: *mut MpPool) -> i32 {
    call(handle, -1, |state| {
        state.pool.resume();
        if state.pool.foreground().is_none() {
            return Err("No healthy foreground guest".into());
        }
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_memory_warning(handle: *mut MpPool) -> i32 {
    call(handle, -1, |state| {
        state.pool.memory_warning();
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_last_error(handle: *mut MpPool) -> *const c_char {
    call_inner(handle, std::ptr::null(), false, |state| {
        Ok(state.error.as_ptr())
    })
}

/// Lazy per-guest binding; all retained bindings must use the same current context.
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_gles_epoch(handle: *mut MpPool) -> u64 {
    call_inner(handle, 0, false, |state| {
        #[cfg(target_os = "android")]
        {
            Ok(state.gles_epoch.unwrap_or(0))
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = state;
            Ok(0)
        }
    })
}
/// Lazy per-guest binding; all retained bindings must use the same current context.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_gles_render(
    handle: *mut MpPool,
    epoch: u64,
    frame: *const crate::ffi::MpGlesFrame,
) -> i32 {
    call(handle, -1, |state| {
        if frame.is_null()
            || unsafe { (*frame).size } != std::mem::size_of::<crate::ffi::MpGlesFrame>() as u32
        {
            return Err("Invalid GLES frame size".into());
        }
        #[cfg(target_os = "android")]
        {
            if epoch == 0
                || match state.gles_epoch {
                    Some(bound) => bound != epoch,
                    None => epoch <= state.last_gles_epoch,
                }
            {
                return Err("GPU context epoch mismatch".into());
            }
            state.pool.visit(|guest| {
                if let Some(engine) = guest.resources() {
                    if engine.graphics.epoch().is_some_and(|bound| bound != epoch) {
                        return Err("GPU context epoch mismatch".into());
                    }
                }
                Ok(())
            })?;
            let engine = state
                .pool
                .foreground()
                .ok_or("No foreground guest")?
                .engine()?;
            if !engine.graphics.is_attached() {
                unsafe {
                    engine.attach_gles(epoch)?;
                }
            }
            state.gles_epoch = Some(epoch);
            state.last_gles_epoch = epoch;
            let frame = unsafe { &*frame };
            unsafe {
                engine.render_gles(
                    epoch,
                    [frame.x, frame.y, frame.width, frame.height],
                    [frame.window_width, frame.window_height],
                )?;
            }
            Ok(0)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (state, epoch);
            Err("GLES backend unavailable on this platform".into())
        }
    })
}
/// Release driver objects while preserving retained guest realms.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_gles_release(handle: *mut MpPool, epoch: u64) -> i32 {
    call(handle, -1, |state| {
        #[cfg(target_os = "android")]
        {
            if epoch == 0 || state.gles_epoch != Some(epoch) {
                return Err("GPU context epoch mismatch".into());
            }
            state.pool.visit(|guest| {
                if let Some(engine) = guest.resources() {
                    if engine.graphics.is_attached() {
                        unsafe {
                            engine.release_gles(epoch)?;
                        }
                    }
                }
                Ok(())
            })?;
            state.gles_epoch = None;
            Ok(0)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (state, epoch);
            Err("GLES backend unavailable on this platform".into())
        }
    })
}
/// The host asserts the pool's original context was destroyed.
#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_gles_lost(handle: *mut MpPool, epoch: u64) -> i32 {
    call_inner(handle, -1, false, |state| {
        #[cfg(target_os = "android")]
        {
            if epoch == 0 || state.gles_epoch != Some(epoch) {
                return Err("GPU context epoch mismatch".into());
            }
            state.pool.visit(|guest| {
                if let Some(engine) = guest.resources() {
                    if engine.graphics.epoch().is_some_and(|bound| bound != epoch) {
                        return Err("GPU context epoch mismatch".into());
                    }
                }
                Ok(())
            })?;
            state.pool.visit(|guest| {
                if let Some(engine) = guest.resources() {
                    if engine.graphics.is_attached() {
                        engine.lose_gles(epoch)?;
                    }
                }
                Ok(())
            })?;
            state.gles_epoch = None;
            Ok(0)
        }
        #[cfg(not(target_os = "android"))]
        {
            let _ = (state, epoch);
            Err("GLES backend unavailable on this platform".into())
        }
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_destroy(handle: *mut MpPool) -> i32 {
    if handle.is_null() {
        return 0;
    }
    let Some(_guard) = CallGuard::enter(handle) else {
        return -1;
    };
    if unsafe { std::ptr::addr_of!((*handle).owner).read() } != thread::current().id() {
        return -1;
    }
    #[cfg(target_os = "android")]
    if let Err(error) = check_gpu(unsafe { &mut *handle }) {
        unsafe {
            (*handle).error = CString::new(error).unwrap();
        }
        return -1;
    }
    if catch_unwind(AssertUnwindSafe(|| drop(unsafe { Box::from_raw(handle) }))).is_ok() {
        0
    } else {
        -1
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_svc_post(
    handle: *mut MpPool,
    id: *const u8,
    id_len: usize,
    generation: u64,
    line: *const u8,
    length: usize,
) -> i32 {
    call(handle, -1, |state| {
        let id = std::str::from_utf8(unsafe { bytes(id, id_len, 128) }?)
            .map_err(|_| "Guest identity is not UTF-8")?;
        let line = std::str::from_utf8(unsafe { bytes(line, length, 4096) }?)
            .map_err(|_| "Completion is not UTF-8")?;
        let guest = state
            .pool
            .retained(id)
            .ok_or("Completion guest was evicted")?;
        if generation == 0 || guest.completion_generation != generation {
            return Err("Stale guest completion generation".into());
        }
        guest.engine()?.post(line)?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_generation(
    handle: *mut MpPool,
    id: *const u8,
    id_len: usize,
) -> u64 {
    call(handle, 0, |state| {
        let id = std::str::from_utf8(unsafe { bytes(id, id_len, 128) }?)
            .map_err(|_| "Guest identity is not UTF-8")?;
        Ok(state
            .pool
            .retained(id)
            .ok_or("Guest was evicted")?
            .completion_generation)
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_frame_input(
    handle: *mut MpPool,
    input: *const crate::ffi::MpInput,
) -> i32 {
    call(handle, -1, |state| {
        if input.is_null()
            || unsafe { (*input).size } < std::mem::size_of::<crate::ffi::MpInput>() as u32
        {
            return Err("Invalid input size".into());
        }
        let input = unsafe { &*input };
        if input.count > 8 || input.cancelled_count > 8 {
            return Err("Invalid input counts".into());
        }
        let count = input.count as usize;
        state
            .pool
            .foreground()
            .ok_or("No foreground guest")?
            .frame(
                &input.contacts[..count],
                Some(&input.hits[..count]),
                &input.cancelled[..input.cancelled_count as usize],
            )?;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_hit_test(
    handle: *mut MpPool,
    x: f32,
    y: f32,
    output: *mut i32,
) -> i32 {
    call(handle, -1, |state| {
        if output.is_null() {
            return Err("Missing hit output".into());
        }
        let hit = state
            .pool
            .foreground()
            .ok_or("No foreground guest")?
            .engine()?
            .hit_test(x, y)?;
        unsafe { output.write(hit) };
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_render_damage(
    handle: *mut MpPool,
    output: *mut MpFrame,
    damage: *mut crate::ffi::MpDamage,
) -> i32 {
    call(handle, -1, |state| {
        if output.is_null()
            || damage.is_null()
            || unsafe { (*damage).size } < std::mem::size_of::<crate::ffi::MpDamage>() as u32
        {
            return Err("Invalid damage output".into());
        }
        let engine = state
            .pool
            .foreground()
            .ok_or("No foreground guest")?
            .engine()?;
        let (width, height) = engine.dimensions();
        let pixels = engine.render()?;
        let frame = MpFrame {
            pixels: pixels.as_ptr(),
            length: pixels.len(),
            width,
            height,
            stride: width * 4,
        };
        let plan = engine.damage();
        let scale = engine.density();
        let mut result = crate::ffi::MpDamage {
            size: std::mem::size_of::<crate::ffi::MpDamage>() as u32,
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
            output.write(frame);
            damage.write(result)
        };
        Ok(0)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn mp_pool_set_retirement(
    handle: *mut MpPool,
    callback: Option<Retire>,
    context: *mut std::ffi::c_void,
) -> i32 {
    call(handle, -1, |state| {
        let mut target = state.cleanup.borrow_mut();
        target.retire = callback;
        target.retire_context = context;
        Ok(0)
    })
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_pool_close(handle: *mut MpPool, id: *const u8, length: usize) -> i32 {
    call(handle, -1, |state| {
        let id = std::str::from_utf8(unsafe { bytes(id, length, 128) }?)
            .map_err(|_| "Guest identity is not UTF-8")?;
        state.pool.close(id);
        Ok(0)
    })
}
