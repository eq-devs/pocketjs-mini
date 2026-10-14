//! Test-build Android trace sections. Trace calls remain outside guest deadlines.
#[cfg(all(target_os = "android", feature = "android-turn-trace"))]
mod android {
    #[link(name = "android")]
    unsafe extern "C" {
        fn ATrace_isEnabled() -> bool;
        fn ATrace_beginSection(name: *const std::ffi::c_char);
        fn ATrace_endSection();
    }
    pub struct Turn(bool);
    impl Turn {
        pub fn begin(milliseconds: u64) -> Self {
            let enabled = unsafe { ATrace_isEnabled() };
            if enabled {
                let name = if milliseconds > 50 { c"pjm.guest-boot" } else { c"pjm.guest-turn" };
                unsafe { ATrace_beginSection(name.as_ptr()) };
            }
            Self(enabled)
        }
    }
    impl Drop for Turn {
        fn drop(&mut self) {
            if self.0 { unsafe { ATrace_endSection() } }
        }
    }
    pub fn expired() {
        if unsafe { ATrace_isEnabled() } {
            unsafe {
                ATrace_beginSection(c"pjm.guest-deadline-failure".as_ptr());
                ATrace_endSection();
            }
        }
    }
}
#[cfg(all(target_os = "android", feature = "android-turn-trace"))]
pub use android::{Turn, expired};

#[cfg(not(all(target_os = "android", feature = "android-turn-trace")))]
pub struct Turn;
#[cfg(not(all(target_os = "android", feature = "android-turn-trace")))]
impl Turn { pub fn begin(_: u64) -> Self { Self } }
#[cfg(not(all(target_os = "android", feature = "android-turn-trace")))]
pub fn expired() {}
