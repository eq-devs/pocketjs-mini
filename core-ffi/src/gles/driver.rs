//! EGL identity supplements the host's non-reusable binding epoch.
use super::Renderer;
use std::ffi::c_void;
#[link(name = "EGL")]
unsafe extern "C" {
    fn eglGetCurrentContext() -> *mut c_void;
    fn eglGetCurrentDisplay() -> *mut c_void;
}
pub(crate) struct BoundRenderer {
    display: *mut c_void,
    context: *mut c_void,
    pub(crate) renderer: Renderer,
}
impl BoundRenderer {
    pub(crate) unsafe fn new() -> Option<Self> {
        let display = unsafe { eglGetCurrentDisplay() };
        let context = unsafe { eglGetCurrentContext() };
        if display.is_null() || context.is_null() {
            return None;
        }
        let renderer = unsafe { Renderer::new() }?;
        Some(Self {
            display,
            context,
            renderer,
        })
    }
    pub(crate) fn require_current(&self) -> Result<(), String> {
        if unsafe { eglGetCurrentDisplay() } != self.display
            || unsafe { eglGetCurrentContext() } != self.context
        {
            return Err("Original EGL context is not current".into());
        }
        Ok(())
    }
}
