//! Structural admission only: native hosts must authenticate the full payload
//! and provisioned publisher key before selecting borrowed engine inputs.
use pocketjs_core::package::{Package, select_guest};
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    slice,
};
const MAX_VARIANTS: usize = 128;
const MAX_SECTION_VISITS: usize = 262_144;

// Bound repeated/shared section table work before the pinned parser traverses
// every variant. This is a preflight, not checksum/structure authentication.
fn admission_work_bounded(bytes: &[u8]) -> bool {
    let check = || -> Option<()> {
        let end = bytes.len().checked_sub(8)?;
        let read = |offset: usize| -> Option<usize> {
            let word: [u8; 4] = bytes.get(offset..offset.checked_add(4)?)?.try_into().ok()?;
            Some(u32::from_le_bytes(word) as usize)
        };
        if bytes.len() < 24 {
            return None;
        }
        let manifest_end = 16usize.checked_add(read(8)?)?;
        let table = manifest_end.checked_add(15)? & !15;
        let count = read(12)?;
        if manifest_end > end || table > end || count > MAX_VARIANTS || count > (end - table) / 40 {
            return None;
        }
        let mut visits = 0usize;
        for index in 0..count {
            let entry = table + index * 40;
            let sections = read(entry + 20)?;
            let offset = read(entry + 24)?;
            visits = visits.checked_add(sections)?;
            if visits > MAX_SECTION_VISITS || offset > end || sections > (end - offset) / 16 {
                return None;
            }
        }
        Some(())
    };
    check().is_some()
}
#[repr(C)]
pub struct MpPackageInputs {
    pub size: u32,
    pub js: *const u8,
    pub js_len: usize,
    pub pak: *const u8,
    pub pak_len: usize,
    pub plan: *const u8,
    pub plan_len: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use pocketjs_core::package::{MAGIC, VERSION, fnv1a64, section};
    fn put(bytes: &mut [u8], offset: usize, value: u32) {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }
    fn fixture(target: &str, abi: u32, terminated: bool) -> Vec<u8> {
        let mut identity = Vec::new();
        for value in ["test", "dev.pjm.test", "Test"] {
            identity.extend_from_slice(&(value.len() as u16).to_le_bytes());
            identity.extend_from_slice(value.as_bytes());
        }
        let mut js = b"globalThis.frame=()=>{}".to_vec();
        if terminated {
            js.push(0);
        }
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
        bytes[32..32 + target.len()].copy_from_slice(target.as_bytes());
        put(&mut bytes, 48, abi);
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
    fn output() -> MpPackageInputs {
        MpPackageInputs {
            size: std::mem::size_of::<MpPackageInputs>() as u32,
            js: std::ptr::null(),
            js_len: 0,
            pak: std::ptr::null(),
            pak_len: 0,
            plan: std::ptr::null(),
            plan_len: 0,
        }
    }
    #[test]
    fn repeated_tables_have_a_total_work_bound() {
        let offset = 32 + 65 * 40;
        let mut bytes = vec![0; offset + 4096 * 16 + 8];
        put(&mut bytes, 8, 2);
        put(&mut bytes, 12, 65);
        for index in 0..65 {
            let entry = 32 + index * 40;
            put(&mut bytes, entry + 20, 4096);
            put(&mut bytes, entry + 24, offset as u32);
        }
        assert!(bytes.len() < 70_000);
        assert!(!admission_work_bounded(&bytes));
        put(&mut bytes, 12, 64);
        assert!(admission_work_bounded(&bytes));
        put(&mut bytes, 56, u32::MAX);
        assert!(!admission_work_bounded(&bytes));
        for length in 0..24 {
            assert!(!admission_work_bounded(&bytes[..length]));
        }
        assert!(admission_work_bounded(&fixture("pjm-ios", 7, true)));
    }
    fn select(bytes: &[u8], target: u32, id: &[u8], out: &mut MpPackageInputs) -> i32 {
        unsafe {
            mp_package_select(
                bytes.as_ptr(),
                bytes.len(),
                target,
                id.as_ptr(),
                id.len(),
                out,
            )
        }
    }
    #[test]
    fn valid_variants_borrow_inputs_and_failed_selection_clears_them() {
        for (target, name) in [(1, "pjm-ios"), (2, "pjm-android")] {
            let bytes = fixture(name, 7, true);
            let mut out = output();
            assert_eq!(select(&bytes, target, b"dev.pjm.test", &mut out), 0);
            assert_eq!(
                unsafe { slice::from_raw_parts(out.js, out.js_len) },
                b"globalThis.frame=()=>{}"
            );
            assert_eq!(
                unsafe { slice::from_raw_parts(out.plan, out.plan_len) },
                b"{}"
            );
            assert_eq!(out.pak_len, 4);
            assert_eq!(select(&bytes, target, b"dev.pjm.other", &mut out), -1);
            assert!(out.js.is_null() && out.pak.is_null() && out.plan.is_null());
            assert_eq!((out.js_len, out.pak_len, out.plan_len), (0, 0, 0));
        }
    }
    #[test]
    fn malformed_structures_and_abi_are_rejected() {
        let bytes = fixture("pjm-ios", 7, true);
        let mut out = output();
        for length in 0..bytes.len() {
            assert_eq!(select(&bytes[..length], 1, b"dev.pjm.test", &mut out), -1);
        }
        assert_eq!(select(&bytes, 2, b"dev.pjm.test", &mut out), -1);
        assert_eq!(
            select(&fixture("pjm-ios", 8, true), 1, b"dev.pjm.test", &mut out),
            -1
        );
        assert_eq!(
            select(&fixture("pjm-ios", 7, false), 1, b"dev.pjm.test", &mut out),
            -1
        );
        let mut hostile = bytes.clone();
        put(&mut hostile, 80, u32::MAX);
        let end = hostile.len() - 8;
        let hash = fnv1a64(&[&hostile[..end]]);
        hostile[end..].copy_from_slice(&hash.to_le_bytes());
        assert_eq!(select(&hostile, 1, b"dev.pjm.test", &mut out), -1);
        assert_eq!(
            unsafe { mp_package_select(std::ptr::null(), 1, 1, b"x".as_ptr(), 1, &mut out) },
            -1
        );
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_package_select(
    payload: *const u8,
    length: usize,
    target: u32,
    identity: *const u8,
    identity_len: usize,
    output: *mut MpPackageInputs,
) -> i32 {
    if output.is_null()
        || unsafe { (*output).size } != std::mem::size_of::<MpPackageInputs>() as u32
    {
        return -1;
    }
    // Clear stale borrowed pointers even when later admission fails.
    unsafe {
        *output = MpPackageInputs {
            size: std::mem::size_of::<MpPackageInputs>() as u32,
            js: std::ptr::null(),
            js_len: 0,
            pak: std::ptr::null(),
            pak_len: 0,
            plan: std::ptr::null(),
            plan_len: 0,
        };
    }
    if payload.is_null()
        || length == 0
        || length > 64 * 1024 * 1024
        || identity.is_null()
        || identity_len == 0
        || identity_len > 128
    {
        return -1;
    }
    catch_unwind(AssertUnwindSafe(|| {
        let target = match target {
            1 => "pjm-ios",
            2 => "pjm-android",
            _ => return -1,
        };
        let bytes = unsafe { slice::from_raw_parts(payload, length) };
        if !admission_work_bounded(bytes) {
            return -1;
        }
        let Ok(identity) =
            std::str::from_utf8(unsafe { slice::from_raw_parts(identity, identity_len) })
        else {
            return -1;
        };
        let Ok(package) = Package::parse(bytes, false) else {
            return -1;
        };
        let Ok(Some(variant)) = package.find_variant(target) else {
            return -1;
        };
        let Ok(Some(embedded)) = variant.identity() else {
            return -1;
        };
        if embedded.id != identity {
            return -1;
        }
        let Ok(guest) = select_guest(bytes, target, 7, false) else {
            return -1;
        };
        let source = &guest.js[..guest.js.len() - 1];
        if source.len() > 16 * 1024 * 1024
            || std::str::from_utf8(source).is_err()
            || guest.plan.len() > 1024 * 1024
        {
            return -1;
        }
        unsafe {
            *output = MpPackageInputs {
                size: std::mem::size_of::<MpPackageInputs>() as u32,
                js: source.as_ptr(),
                js_len: source.len(),
                pak: guest.pak.as_ptr(),
                pak_len: guest.pak.len(),
                plan: guest.plan.as_ptr(),
                plan_len: guest.plan.len(),
            };
        }
        0
    }))
    .unwrap_or(-1)
}
