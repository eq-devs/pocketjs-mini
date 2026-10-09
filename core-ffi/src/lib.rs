//! Mini-owned per-instance engine composition. Native presentation is separate.
use pocket_mod::{
    Guest,
    qjs::{self, Array, CatchResultExt, Exception, Function, Object},
};
use pocket_ui_surface::UiSurface;
use pocketjs_core::{
    damage::{DamagePlan, DamagePolicy, DamageRect, DamageTracker},
    raster, spec,
};
use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    ffi::c_void,
    rc::Rc,
    time::{Duration, Instant},
};

const RECORD_BYTES: usize = 4096;
const RECORD_COUNT: usize = 32;
pub mod ffi;
#[cfg(any(target_os = "android", test))]
mod gles;
mod gpu_texture;
mod gpu_frame;
mod gpu_geometry;
mod gpu_ffi;
mod gpu_budget;
pub mod inspect;
mod inspection_geometry;
pub mod package_ffi;
pub mod pool;
pub mod pool_ffi;
pub mod replay;
pub mod retained;
#[derive(Default)]
struct Mailbox {
    incoming: VecDeque<String>,
    outgoing: VecDeque<String>,
}
struct Budget {
    deadline: Cell<Option<Instant>>,
    interrupted: Cell<bool>,
    rejections: RefCell<std::collections::HashSet<usize>>,
    rejection_overflow: Cell<bool>,
}
unsafe extern "C" fn rejection_tracker(
    ctx: *mut qjs::qjs::JSContext,
    promise: qjs::qjs::JSValue,
    reason: qjs::qjs::JSValue,
    handled: bool,
    opaque: *mut c_void,
) {
    let budget = unsafe { &*(opaque as *const Budget) };
    let id = unsafe { qjs::qjs::JS_VALUE_GET_PTR(promise) } as usize;
    let mut pending = budget.rejections.borrow_mut();
    if handled {
        pending.remove(&id);
    } else if pending.len() < 32 {
        pending.insert(id);
    } else {
        budget.rejection_overflow.set(true);
    }
    let _ = (ctx, reason);
}
fn service_error(ctx: &qjs::Ctx<'_>, code: &str, message: &str) -> qjs::Error {
    match Exception::from_message(ctx.clone(), message) {
        Ok(error) => match error.set("code", code) {
            Ok(()) => error.throw(),
            Err(error) => error,
        },
        Err(error) => error,
    }
}
unsafe extern "C" fn interrupt(_: *mut qjs::qjs::JSRuntime, opaque: *mut c_void) -> i32 {
    let budget = unsafe { &*(opaque as *const Budget) };
    let expired = budget
        .deadline
        .get()
        .is_some_and(|end| Instant::now() >= end);
    if expired {
        budget.interrupted.set(true);
    }
    i32::from(expired)
}

fn admit_styles(bytes: &[u8]) -> Result<(), &'static str> {
    if bytes.len() > 1024 * 1024 {
        return Err("Style source exceeds byte budget");
    }
    if bytes.len() >= 10
        && u32::from_le_bytes(bytes[..4].try_into().unwrap()) == spec::style_table::MAGIC
        && u16::from_le_bytes(bytes[4..6].try_into().unwrap()) == spec::style_table::VERSION
    {
        let records = u16::from_le_bytes([bytes[6], bytes[7]]);
        let timelines = u16::from_le_bytes([bytes[8], bytes[9]]);
        if records > 4096 || timelines > 256 {
            return Err("Style table exceeds record budget");
        }
    }
    Ok(())
}

fn font_admission(bytes: &[u8]) -> Result<Option<(u8, usize)>, &'static str> {
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Font atlas source exceeds byte budget");
    }
    if bytes.len() < spec::font_atlas::HEADER_SIZE
        || u32::from_le_bytes(bytes[..4].try_into().unwrap()) != spec::font_atlas::MAGIC
    {
        return Ok(None);
    }
    let version = u16::from_le_bytes([bytes[4], bytes[5]]);
    let density = if version == 2 {
        1usize
    } else if version == spec::font_atlas::VERSION {
        bytes[14] as usize
    } else {
        return Ok(None);
    };
    let count = u16::from_le_bytes([bytes[6], bytes[7]]) as usize;
    let slot = bytes[12];
    if count == 0
        || bytes[8] == 0
        || bytes[9] == 0
        || density == 0
        || slot as usize >= spec::MAX_FONT_SLOTS
    {
        return Ok(None);
    }
    let bitmap = count * bytes[8] as usize * bytes[9] as usize * density * density;
    let encoded =
        spec::font_atlas::HEADER_SIZE + count * spec::font_atlas::CMAP_ENTRY_SIZE + bitmap;
    if encoded > bytes.len() {
        return Ok(None);
    }
    Ok(Some((
        slot,
        bitmap + count * std::mem::size_of::<pocketjs_core::text::CmapEntry>(),
    )))
}

fn admit_boot_pack(pak: &[u8]) -> Result<(), String> {
    let mut entries = 0usize;
    let mut names = 0usize;
    let mut textures = 0usize;
    let mut pixels = 0usize;
    let mut fonts = 0usize;
    for entry in pocketjs_core::pak::entries(pak) {
        if entry.key == "ui:styles" {
            admit_styles(entry.blob).map_err(str::to_owned)?;
        }
        if entry.key.starts_with("ui:font.") {
            if let Some((_, required)) = font_admission(entry.blob).map_err(str::to_owned)? {
                fonts += required;
                if fonts > 8 * 1024 * 1024 {
                    return Err("Boot font assets exceed budget".into());
                }
            }
        }
        entries += 1;
        names += entry.key.len();
        if entries > 4096 || names > 512 * 1024 {
            return Err("Boot asset directory exceeds budget".into());
        }
        if entry.key.starts_with("ui:img.") || entry.key.starts_with("ui:sprite.") {
            let b = entry.blob;
            if b.len() < 5 {
                continue;
            }
            let w = u16::from_le_bytes([b[0], b[1]]) as usize;
            let h = u16::from_le_bytes([b[2], b[3]]) as usize;
            let (bpp, palette) = match b[4] {
                0 | 2 => (2, 0),
                3 => (4, 0),
                5 => (1, 1024),
                _ => continue,
            };
            if w == 0
                || h == 0
                || w > spec::TEX_MAX_DIM as usize
                || h > spec::TEX_MAX_DIM as usize
                || !w.is_power_of_two()
                || !h.is_power_of_two()
            {
                continue;
            }
            textures += 1;
            pixels += w * h * bpp + palette;
            if textures > 256 || pixels > 8 * 1024 * 1024 {
                return Err("Boot texture assets exceed budget".into());
            }
        }
    }
    Ok(())
}

pub struct Instance {
    #[cfg(target_os = "android")]
    graphics: gles::ContextState<gles::BoundRenderer>,
    // Drop the runtime before its interrupt handler's storage.
    guest: Guest,
    surface: UiSurface,
    mailbox: Rc<RefCell<Mailbox>>,
    pixels: Vec<u8>,
    tracker: DamageTracker,
    damage: DamagePlan,
    width: u32,
    height: u32,
    density: u32,
    ready: bool,
    started: bool,
    launched: bool,
    suspended: bool,
    budget: Box<Budget>,
}
impl Instance {
    pub fn new(
        width: u32,
        height: u32,
        density: u32,
        heap_bytes: usize,
        target: &str,
    ) -> Result<Self, String> {
        if width == 0
            || height == 0
            || width > 1024
            || height > 1024
            || !(1..=4).contains(&density)
            || !(8 * 1024 * 1024..=32 * 1024 * 1024).contains(&heap_bytes)
            || !["pjm-ios", "pjm-android"].contains(&target)
        {
            return Err("Invalid engine configuration".into());
        }
        let bytes = width as usize * height as usize * density as usize * density as usize * 4;
        if bytes > 16 * 1024 * 1024 {
            return Err("Framebuffer exceeds budget".into());
        }
        let guest = Guest::new().map_err(|error| error.to_string())?;
        let budget = Box::new(Budget {
            deadline: Cell::new(None),
            interrupted: Cell::new(false),
            rejections: RefCell::new(std::collections::HashSet::new()),
            rejection_overflow: Cell::new(false),
        });
        guest.with(|ctx| unsafe {
            let runtime = qjs::qjs::JS_GetRuntime(ctx.as_raw().as_ptr());
            qjs::qjs::JS_SetMemoryLimit(runtime, heap_bytes as _);
            // Unoptimized Rust host callbacks use more stack than release.
            let stack_bytes = if cfg!(debug_assertions) {
                1024 * 1024
            } else {
                256 * 1024
            };
            qjs::qjs::JS_SetMaxStackSize(runtime, stack_bytes);
            qjs::qjs::JS_SetInterruptHandler(
                runtime,
                Some(interrupt),
                (&*budget as *const Budget).cast_mut().cast(),
            );
            qjs::qjs::JS_SetHostPromiseRejectionTracker(
                runtime,
                Some(rejection_tracker),
                (&*budget as *const Budget).cast_mut().cast(),
            );
        });
        let surface = UiSurface::new_with_density((width as f32, height as f32), density);
        surface.set_identity(target, 7);
        Ok(Self {
            #[cfg(target_os = "android")]
            graphics: gles::ContextState::new(),
            guest,
            surface,
            mailbox: Rc::new(RefCell::new(Mailbox::default())),
            pixels: vec![0; bytes],
            tracker: DamageTracker::default(),
            damage: DamagePlan::full(DamageRect::new(0, 0, width as i32, height as i32)),
            width,
            height,
            density,
            ready: false,
            started: false,
            launched: false,
            suspended: false,
            budget,
        })
    }
    fn turn(
        &self,
        milliseconds: u64,
        action: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        self.budget.interrupted.set(false);
        self.budget
            .deadline
            .set(Some(Instant::now() + Duration::from_millis(milliseconds)));
        let result = action().and_then(|_| self.jobs());
        let expired = self.budget.interrupted.get()
            || self
                .budget
                .deadline
                .get()
                .is_some_and(|end| Instant::now() >= end);
        self.budget.deadline.set(None);
        if expired && result.is_ok() {
            Err("Guest turn deadline exceeded".into())
        } else if result.is_ok()
            && (!self.budget.rejections.borrow().is_empty() || self.budget.rejection_overflow.get())
        {
            Err("Guest has unhandled Promise rejection".into())
        } else {
            result
        }
    }
    fn jobs(&self) -> Result<(), String> {
        // Check between short Promise jobs too; a QuickJS interrupt alone
        // cannot bound an infinite chain of individually cheap jobs.
        self.guest.with(|ctx| unsafe {
            let runtime = qjs::qjs::JS_GetRuntime(ctx.as_raw().as_ptr());
            while qjs::qjs::JS_IsJobPending(runtime) {
                if self
                    .budget
                    .deadline
                    .get()
                    .is_some_and(|end| Instant::now() >= end)
                {
                    return Err("Guest job deadline exceeded".into());
                }
                let mut job_context = std::ptr::null_mut();
                if qjs::qjs::JS_ExecutePendingJob(runtime, &mut job_context) < 0 {
                    return Err(format!("Guest job failed: {:?}", ctx.catch()));
                }
            }
            Ok(())
        })
    }
    pub fn boot(&mut self, source: &str, pak: &[u8]) -> Result<(), String> {
        if self.started {
            return Err("Restart requires a new instance".into());
        }
        self.started = true;
        if source.len() > 16 * 1024 * 1024 || pak.len() > 64 * 1024 * 1024 {
            return Err("Guest artifact exceeds budget".into());
        }
        admit_boot_pack(pak)?;
        self.surface.feed_pak(pak);
        self.surface
            .mount(&self.guest)
            .map_err(|error| error.to_string())?;
        let mailbox = self.mailbox.clone();
        // Retain only tile dimensions, not another copy of the asset pack.
        // First matching key follows the pinned pack reader's lookup semantics.
        let mut tiles = std::collections::HashMap::new();
        for entry in pocketjs_core::pak::entries(pak) {
            tiles.entry(entry.key.to_owned()).or_insert_with(|| {
                let blob = entry.blob;
                if blob.len() < 28
                    || u32::from_le_bytes(blob[..4].try_into().unwrap()) != spec::tileset::MAGIC
                    || u16::from_le_bytes(blob[4..6].try_into().unwrap()) != spec::tileset::VERSION
                {
                    return None;
                }
                let w = u16::from_le_bytes([blob[8], blob[9]]) as usize;
                let h = u16::from_le_bytes([blob[10], blob[11]]) as usize;
                if w == 0
                    || h == 0
                    || w > spec::TEX_MAX_DIM as usize
                    || h > spec::TEX_MAX_DIM as usize
                    || !w.is_power_of_two()
                    || !h.is_power_of_two()
                {
                    return None;
                }
                Some(w * h + 1024)
            });
        }
        self.guest
            .with(|ctx| -> qjs::Result<()> {
                let ui: Object = ctx.globals().get("ui")?;
                // Track live core IDs; subtree destruction returns admission capacity.
                let live = Rc::new(RefCell::new(std::collections::HashSet::new()));
                let text_sizes =
                    Rc::new(RefCell::new(std::collections::HashMap::<i32, usize>::new()));
                let text_total = Rc::new(Cell::new(0usize));
                let allocated = live.clone();
                let surface = self.surface.clone();
                ui.set(
                    "createNode",
                    Function::new(
                        ctx.clone(),
                        move |ctx: qjs::Ctx<'_>, kind: i32| -> qjs::Result<i32> {
                            if allocated.borrow().len() >= 16384 {
                                return Err(service_error(
                                    &ctx,
                                    "BUSY",
                                    "Native live node budget exhausted",
                                ));
                            }
                            let node = surface.with_ui(|ui| ui.create_node(kind as u8));
                            if node != 0 {
                                allocated.borrow_mut().insert(node);
                            }
                            Ok(node)
                        },
                    )?,
                )?;
                let surface = self.surface.clone();
                let freed_text = text_sizes.clone();
                let freed_total = text_total.clone();
                ui.set(
                    "destroyNode",
                    Function::new(ctx.clone(), move |id: i32| {
                        surface.with_ui(|ui| {
                            let mut pending = vec![id];
                            let mut destroyed = Vec::new();
                            while let Some(node) = pending.pop() {
                                pending.extend_from_slice(ui.node_children(node));
                                destroyed.push(node);
                            }
                            ui.destroy_node(id);
                            let mut live = live.borrow_mut();
                            for node in destroyed {
                                if !ui.node_exists(node) {
                                    live.remove(&node);
                                    if let Some(bytes) = freed_text.borrow_mut().remove(&node) {
                                        freed_total.set(freed_total.get() - bytes);
                                    }
                                }
                            }
                        });
                    })?,
                )?;
                ui.set(
                    "svcOpen",
                    Function::new(ctx.clone(), |name: String| name == "mini")?,
                )?;
                for name in ["setText", "replaceText"] {
                    let surface = self.surface.clone();
                    let sizes = text_sizes.clone();
                    let total = text_total.clone();
                    ui.set(
                        name,
                        Function::new(
                            ctx.clone(),
                            move |ctx: qjs::Ctx<'_>,
                                  id: i32,
                                  text: qjs::Coerced<String>|
                                  -> qjs::Result<()> {
                                if text.0.len() > 4096 {
                                    return Err(service_error(
                                        &ctx,
                                        "BUSY",
                                        "Native text node exceeds byte budget",
                                    ));
                                }
                                if !surface.with_ui(|ui| {
                                    ui.node_type(id) == Some(spec::NodeType::Text as u8)
                                }) {
                                    return Ok(());
                                }
                                let previous = sizes.borrow().get(&id).copied().unwrap_or(0);
                                let next = total.get() - previous + text.0.len();
                                if next > 2 * 1024 * 1024 {
                                    return Err(service_error(
                                        &ctx,
                                        "BUSY",
                                        "Native aggregate text budget exhausted",
                                    ));
                                }
                                surface.with_ui(|ui| ui.set_text(id, &text.0));
                                if text.0.is_empty() {
                                    sizes.borrow_mut().remove(&id);
                                } else {
                                    sizes.borrow_mut().insert(id, text.0.len());
                                }
                                total.set(next);
                                Ok(())
                            },
                        )?,
                    )?;
                }
                let surface = self.surface.clone();
                ui.set(
                    "uploadTexture",
                    Function::new(
                        ctx.clone(),
                        move |ctx: qjs::Ctx<'_>,
                              buffer: qjs::TypedArray<u8>,
                              width: i32,
                              height: i32,
                              format: i32|
                              -> qjs::Result<i32> {
                            let Some(bytes) = buffer.as_bytes() else {
                                return Ok(-1);
                            };
                            if bytes.len() > 4 * 1024 * 1024 {
                                return Err(service_error(
                                    &ctx,
                                    "BUSY",
                                    "Raw texture upload exceeds byte budget",
                                ));
                            }
                            surface.with_ui(|ui| {
                                let mut live = 0usize;
                                let mut used = 0usize;
                                for slot in 0..ui.texture_slot_count() {
                                    if let Some((_, texture)) = ui.texture_at(slot as u32) {
                                        live += 1;
                                        used += texture.pixels.len()
                                            + texture.palette.map_or(0, |palette| palette.len());
                                    }
                                }
                                if live >= 256 || used + bytes.len() > 8 * 1024 * 1024 {
                                    return Err(service_error(
                                        &ctx,
                                        "BUSY",
                                        "Native texture budget exhausted",
                                    ));
                                }
                                Ok(ui.upload_texture(
                                    bytes,
                                    width as u32,
                                    height as u32,
                                    format as u32,
                                ))
                            })
                        },
                    )?,
                )?;
                let surface = self.surface.clone();
                ui.set(
                    "uploadImgEntry",
                    Function::new(
                        ctx.clone(),
                        move |ctx: qjs::Ctx<'_>, buffer: qjs::TypedArray<u8>| -> qjs::Result<i32> {
                            let Some(bytes) = buffer.as_bytes() else {
                                return Ok(-1);
                            };
                            if bytes.len() > 4 * 1024 * 1024 {
                                return Err(service_error(
                                    &ctx,
                                    "BUSY",
                                    "Image entry exceeds byte budget",
                                ));
                            }
                            if bytes.len() < 8 {
                                return Ok(-1);
                            }
                            let w = u16::from_le_bytes([bytes[0], bytes[1]]) as usize;
                            let h = u16::from_le_bytes([bytes[2], bytes[3]]) as usize;
                            let (bpp, palette) = match bytes[4] {
                                0 | 2 => (2, 0),
                                3 => (4, 0),
                                5 => (1, 1024),
                                _ => return Ok(-1),
                            };
                            // Match the pinned core's dimension validation before estimating
                            // decoded storage. RLE input length is not its allocation size.
                            if w == 0
                                || h == 0
                                || w > 512
                                || h > 512
                                || !w.is_power_of_two()
                                || !h.is_power_of_two()
                            {
                                return Ok(-1);
                            }
                            let required = w * h * bpp + palette;
                            surface.with_ui(|ui| {
                                let mut live = 0usize;
                                let mut used = 0usize;
                                for slot in 0..ui.texture_slot_count() {
                                    if let Some((_, texture)) = ui.texture_at(slot as u32) {
                                        live += 1;
                                        used += texture.pixels.len()
                                            + texture.palette.map_or(0, |palette| palette.len());
                                    }
                                }
                                if live >= 256 || used + required > 8 * 1024 * 1024 {
                                    return Err(service_error(
                                        &ctx,
                                        "BUSY",
                                        "Native texture budget exhausted",
                                    ));
                                }
                                Ok(ui.upload_img_entry(bytes))
                            })
                        },
                    )?,
                )?;
                let surface = self.surface.clone();
                ui.set(
                    "__miniAdmitTile",
                    Function::new(
                        ctx.clone(),
                        move |ctx: qjs::Ctx<'_>,
                              key: qjs::Coerced<String>,
                              index: i32|
                              -> qjs::Result<i32> {
                            if index < 0 {
                                return Ok(-1);
                            }
                            let Some(Some(required)) = tiles.get(&key.0) else {
                                return Ok(-1);
                            };
                            surface.with_ui(|ui| {
                                let mut live = 0usize;
                                let mut used = 0usize;
                                for slot in 0..ui.texture_slot_count() {
                                    if let Some((_, texture)) = ui.texture_at(slot as u32) {
                                        live += 1;
                                        used += texture.pixels.len()
                                            + texture.palette.map_or(0, |palette| palette.len());
                                    }
                                }
                                if live >= 256 || used + required > 8 * 1024 * 1024 {
                                    return Err(service_error(
                                        &ctx,
                                        "BUSY",
                                        "Native texture budget exhausted",
                                    ));
                                }
                                Ok(())
                            })?;
                            Ok(0)
                        },
                    )?,
                )?;
                ctx.eval::<(), _>("(()=>{const load=ui.loadTileTexture,admit=ui.__miniAdmitTile;delete ui.__miniAdmitTile;ui.loadTileTexture=(key,index)=>{key=String(key);index=index|0;return admit(key,index)<0?-1:load(key,index)}})()")?;
                let surface = self.surface.clone();
                ui.set("loadStyles", Function::new(ctx.clone(), move |ctx: qjs::Ctx<'_>, buffer: qjs::TypedArray<u8>| -> qjs::Result<bool> {
                    let Some(bytes) = buffer.as_bytes() else { return Ok(false); };
                    admit_styles(bytes).map_err(|message| service_error(&ctx, "BUSY", message))?;
                    Ok(surface.with_ui(|ui| ui.load_styles(bytes)))
                })?)?;
                let surface = self.surface.clone();
                ui.set("loadFontAtlas", Function::new(ctx.clone(), move |ctx: qjs::Ctx<'_>, buffer: qjs::TypedArray<u8>| -> qjs::Result<bool> {
                    let Some(bytes) = buffer.as_bytes() else { return Ok(false); };
                    let Some((slot, required)) = font_admission(bytes).map_err(|message| service_error(&ctx, "BUSY", message))? else { return Ok(false); };
                    surface.with_ui(|ui| {
                        let used: usize = (0..spec::MAX_FONT_SLOTS).filter(|other| *other != slot as usize).filter_map(|other| ui.font_atlas(other as u8)).map(|atlas| atlas.bitmap.len() + atlas.glyph_count as usize * std::mem::size_of::<pocketjs_core::text::CmapEntry>()).sum();
                        if used + required > 8 * 1024 * 1024 { return Err(service_error(&ctx, "BUSY", "Native font atlas budget exhausted")); }
                        Ok(ui.load_font_atlas(bytes))
                    })
                })?)?;
                let outgoing = mailbox.clone();
                ui.set(
                    "svcSend",
                    Function::new(
                        ctx.clone(),
                        move |ctx: qjs::Ctx<'_>, line: String| -> qjs::Result<()> {
                            let line = line.strip_suffix('\n').unwrap_or(&line);
                            let mut mailbox = outgoing.borrow_mut();
                            if line.is_empty()
                                || line.len() > RECORD_BYTES
                                || line.contains(['\n', '\r', '\0'])
                            {
                                return Err(service_error(
                                    &ctx,
                                    "PROTOCOL",
                                    "Invalid native service record",
                                ));
                            }
                            if mailbox.outgoing.len() >= RECORD_COUNT {
                                return Err(service_error(
                                    &ctx,
                                    "BUSY",
                                    "Native request queue is full",
                                ));
                            }
                            mailbox.outgoing.push_back(line.to_owned());
                            Ok(())
                        },
                    )?,
                )?;
                ui.set(
                    "svcPoll",
                    Function::new(ctx.clone(), move || -> Option<String> {
                        let mut mailbox = mailbox.borrow_mut();
                        let mut batch = String::new();
                        while let Some(line) = mailbox.incoming.front() {
                            if batch.len() + line.len() + 1 > 8192 {
                                break;
                            }
                            batch.push_str(&mailbox.incoming.pop_front().unwrap());
                            batch.push('\n');
                        }
                        if batch.is_empty() {
                            None
                        } else {
                            Some(batch)
                        }
                    })?,
                )?;
                Ok(())
            })
            .map_err(|error| error.to_string())?;
        self.turn(2000, || {
            self.guest.with(|ctx| {
                ctx.eval::<(), _>(source.as_bytes())
                    .catch(&ctx)
                    .map_err(|error| error.to_string())
            })
        })?;
        if !self.guest.has_frame() {
            return Err("Guest installed no frame handler".into());
        }
        self.ready = true;
        Ok(())
    }
    pub fn frame(&mut self, touches: &[u32]) -> Result<(), String> {
        self.frame_input(touches, None, &[])
    }
    pub fn hit_test(&self, x: f32, y: f32) -> Result<i32, String> {
        if !self.ready || !x.is_finite() || !y.is_finite() {
            return Err("Invalid hit query".into());
        }
        Ok(self.surface.with_ui(|ui| ui.hit_test_bounds(x, y)))
    }
    pub fn frame_input(
        &mut self,
        touches: &[u32],
        latched_hits: Option<&[i32]>,
        cancelled: &[u8],
    ) -> Result<(), String> {
        if !self.ready
            || self.suspended
            || touches.len() > 8
            || cancelled.len() > 8
            || touches.iter().any(|word| word & 0x40000000 != 0)
            || latched_hits.is_some_and(|hits| hits.len() != touches.len())
        {
            return Err("Invalid guest state or contacts".into());
        }
        let mut hits = [0i32; 8];
        let count = self.surface.with_ui(|ui| ui.touch_hits(touches, &mut hits));
        if let Some(latched) = latched_hits {
            hits[..latched.len()].copy_from_slice(latched);
        }
        let result = self.turn(50, || {
            self.guest.with(|ctx| -> Result<(), String> {
                let frame: Function = ctx
                    .globals()
                    .get("frame")
                    .map_err(|error| error.to_string())?;
                let contacts = Array::new(ctx.clone()).map_err(|error| error.to_string())?;
                let facts = Array::new(ctx.clone()).map_err(|error| error.to_string())?;
                for (index, value) in touches.iter().enumerate() {
                    contacts
                        .set(index, *value)
                        .map_err(|error| error.to_string())?;
                }
                for (index, id) in cancelled.iter().enumerate() {
                    contacts
                        .set(touches.len() + index, 0x40000000u32 | ((*id as u32) << 18))
                        .map_err(|error| error.to_string())?;
                }
                for (index, value) in hits[..count].iter().enumerate() {
                    facts
                        .set(index, *value)
                        .map_err(|error| error.to_string())?;
                }
                frame
                    .call::<_, ()>((0u32, spec::ANALOG_CENTER, contacts, facts))
                    .catch(&ctx)
                    .map_err(|error| error.to_string())
            })
        });
        if result.is_err() {
            self.ready = false;
            self.mailbox.borrow_mut().outgoing.clear();
            return result;
        }
        self.surface.tick();
        Ok(())
    }
    pub fn render(&mut self) -> Result<&[u8], String> {
        if !self.ready {
            return Err("Guest is not running".into());
        }
        let pixels = &mut self.pixels;
        let tracker = &mut self.tracker;
        self.damage = self.surface.with_ui(|ui| {
            let words = ui.draw().words.clone();
            match raster::render_scaled_argb_incremental(
                ui,
                &words,
                pixels,
                self.density,
                tracker,
                DamagePolicy::default(),
            ) {
                Ok(plan) => plan,
                Err(_) => {
                    raster::render_scaled_argb(ui, &words, pixels, self.density);
                    tracker.invalidate();
                    DamagePlan::full(DamageRect::new(0, 0, self.width as i32, self.height as i32))
                }
            }
        });
        Ok(&self.pixels)
    }
    /// The host must keep this instance on its GL owner thread and make the
    /// original GLES2 context current. Epochs are nonzero and never reused.
    #[cfg(target_os = "android")]
    pub unsafe fn attach_gles(&mut self, epoch: u64) -> Result<(), String> {
        self.graphics
            .attach(epoch, || unsafe { gles::BoundRenderer::new() })
            .map_err(str::to_owned)
    }
    /// Render the retained UI directly; coordinates use the host's top-left
    /// physical viewport. The attached epoch's context must be current.
    #[cfg(target_os = "android")]
    pub unsafe fn render_gles(
        &mut self,
        epoch: u64,
        viewport: [i32; 4],
        window: [i32; 2],
    ) -> Result<(), String> {
        if !self.ready || self.suspended {
            return Err("Guest is not running".into());
        }
        let [x, y, width, height] = viewport;
        let [window_width, window_height] = window;
        if x < 0
            || y < 0
            || width <= 0
            || height <= 0
            || window_width <= 0
            || window_height <= 0
            || x.checked_add(width)
                .is_none_or(|right| right > window_width)
            || y.checked_add(height)
                .is_none_or(|bottom| bottom > window_height)
        {
            return Err("Invalid GPU viewport".into());
        }
        let renderer = self.graphics.current(epoch).map_err(str::to_owned)?;
        renderer.require_current()?;
        let rendered = self.surface.with_ui(|ui| unsafe {
            renderer
                .renderer
                .render(ui, x, y, width, height, window_width, window_height, true)
        });
        if rendered {
            Ok(())
        } else {
            Err("GPU rendering failed".into())
        }
    }
    /// Release driver objects only with their original context current.
    #[cfg(target_os = "android")]
    pub unsafe fn release_gles(&mut self, epoch: u64) -> Result<(), String> {
        self.graphics
            .current(epoch)
            .map_err(str::to_owned)?
            .require_current()?;
        self.graphics
            .release(epoch, |renderer| unsafe { renderer.renderer.destroy() })
            .map_err(str::to_owned)
    }
    /// The host asserts the original context was destroyed; no GL calls occur.
    #[cfg(target_os = "android")]
    pub fn lose_gles(&mut self, epoch: u64) -> Result<(), String> {
        self.graphics.lost(epoch).map_err(str::to_owned)
    }
    pub fn damage(&self) -> &DamagePlan {
        &self.damage
    }
    pub fn density(&self) -> u32 {
        self.density
    }
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width * self.density, self.height * self.density)
    }
    pub fn take(&self) -> Option<String> {
        if self.ready && !self.suspended {
            self.mailbox.borrow_mut().outgoing.pop_front()
        } else {
            None
        }
    }
    pub fn take_into(&self, output: &mut [u8]) -> Result<usize, String> {
        if !self.ready || self.suspended {
            return Err("Guest is not running".into());
        }
        let mut mailbox = self.mailbox.borrow_mut();
        let mut written = 0;
        while let Some(line) = mailbox.outgoing.front() {
            let count = line.len() + 1;
            if written + count > output.len() {
                if written == 0 {
                    return Err("Output buffer cannot fit the next record".into());
                }
                break;
            }
            let line = mailbox.outgoing.pop_front().unwrap();
            output[written..written + line.len()].copy_from_slice(line.as_bytes());
            output[written + line.len()] = b'\n';
            written += count;
        }
        Ok(written)
    }
    /// Optional SDK hook, run between frames under the same execution/job budget.
    pub fn system_back(&mut self) -> Result<bool, String> {
        if !self.ready || self.suspended {
            return Err("Guest is not in the foreground".into());
        }
        let mut handled = false;
        let result = self.turn(50, || {
            self.guest.with(|ctx| {
                let callback: Option<Function> = ctx.globals().get("__miniBack")
                    .catch(&ctx).map_err(|error| error.to_string())?;
                if let Some(callback) = callback {
                    let value: qjs::Value = callback.call(())
                        .catch(&ctx).map_err(|error| error.to_string())?;
                    handled = value.as_bool().ok_or("Back callback must return a boolean")?;
                }
                Ok(())
            })
        });
        if let Err(error) = result {
            self.stop();
            return Err(error);
        }
        Ok(handled)
    }
    /// Optional SDK lifecycle hook, run between frames under the execution/job budget.
    pub fn lifecycle(&mut self, event: &str) -> Result<(), String> {
        self.lifecycle_data(event, "{}")
    }
    pub fn lifecycle_data(&mut self, event: &str, data: &str) -> Result<(), String> {
        if event == "launch" && self.launched {
            return Err("Guest was already launched".into());
        }
        if data.len() > 4096 {
            return Err("Lifecycle data exceeds byte limit".into());
        }
        if !self.ready
            || !matches!(
                event,
                "launch" | "show" | "hide" | "unload" | "memoryWarning"
            )
        {
            return Err("Invalid lifecycle event or guest state".into());
        }
        let result = self.turn(50, || {
            self.guest.with(|ctx| {
                let payload = ctx
                    .json_parse(data)
                    .catch(&ctx)
                    .map_err(|error| error.to_string())?;
                let callback: Option<Function> = ctx
                    .globals()
                    .get("__miniLifecycle")
                    .map_err(|error| error.to_string())?;
                if let Some(callback) = callback {
                    callback
                        .call::<_, ()>((event, payload))
                        .catch(&ctx)
                        .map_err(|error| error.to_string())?;
                }
                Ok(())
            })
        });
        if result.is_err() {
            self.stop();
        } else if event == "launch" {
            self.launched = true;
        }
        result
    }
    pub fn suspend(&mut self) -> Result<(), String> {
        if !self.ready {
            return Err("Guest is not running".into());
        }
        self.suspended = true;
        Ok(())
    }
    pub fn resume(&mut self) -> Result<(), String> {
        if !self.ready {
            return Err("Guest is not running".into());
        }
        self.suspended = false;
        Ok(())
    }
    pub fn stop(&mut self) {
        self.ready = false;
        self.mailbox.borrow_mut().outgoing.clear();
    }
    pub fn post(&self, line: &str) -> Result<(), String> {
        if !self.ready
            || line.is_empty()
            || line.len() > RECORD_BYTES
            || line.contains(['\n', '\r', '\0'])
        {
            return Err("Invalid native completion".into());
        }
        let mut mailbox = self.mailbox.borrow_mut();
        if mailbox.incoming.len() >= RECORD_COUNT {
            return Err("Native completion queue is full".into());
        }
        mailbox.incoming.push_back(line.to_owned());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn guest() -> Instance {
        Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-android").unwrap()
    }
    #[test]
    fn font_budget_rejects_growth_and_allows_slot_replacement() {
        let mut engine = guest();
        let source = "const atlas=new Uint8Array(16+512*8+512*64*32),view=new DataView(atlas.buffer);view.setUint32(0,MAGIC,true);view.setUint16(4,2,true);view.setUint16(6,512,true);atlas.set([64,32,24,32],8);let loaded=true;for(let slot=0;slot<7;slot++){atlas[12]=slot;loaded=ui.loadFontAtlas(atlas)&&loaded}atlas[12]=7;let code='';try{ui.loadFontAtlas(atlas)}catch(e){code=e.code}atlas[12]=0;const replaced=ui.loadFontAtlas(atlas);let single='';try{ui.loadFontAtlas(new Uint8Array(2*1024*1024+1))}catch(e){single=e.code}globalThis.frame=()=>ui.svcSend([loaded,code,replaced,single,ui.loadFontAtlas(new Uint8Array(4))].join(':'))".replace("MAGIC", &spec::font_atlas::MAGIC.to_string());
        engine.boot(&source, &[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "true:BUSY:true:BUSY:false");
        assert!(engine.surface.with_ui(|ui| ui.font_atlas(7).is_none()));
    }
    #[test]
    fn style_admission_rejects_declared_capacity_before_parsing() {
        let mut header = vec![0u8; 10];
        header[..4].copy_from_slice(&spec::style_table::MAGIC.to_le_bytes());
        header[4..6].copy_from_slice(&spec::style_table::VERSION.to_le_bytes());
        header[6..8].copy_from_slice(&4097u16.to_le_bytes());
        assert!(admit_styles(&header).is_err());
        header[6..8].copy_from_slice(&0u16.to_le_bytes());
        header[8..10].copy_from_slice(&257u16.to_le_bytes());
        assert!(admit_styles(&header).is_err());
        assert!(admit_styles(&vec![0; 1024 * 1024 + 1]).is_err());
        let mut engine = guest();
        engine.boot("let code='';try{ui.loadStyles(new Uint8Array(1024*1024+1))}catch(e){code=e.code}globalThis.frame=()=>ui.svcSend(code+':'+ui.loadStyles(new Uint8Array(4)))", &[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY:false");
    }
    #[test]
    fn boot_texture_pack_rejects_before_native_asset_allocation() {
        let count = 257usize;
        let directory = 24usize;
        let names = directory + count * 24;
        let data = names + count * 8;
        let mut pak = vec![0u8; data + 12];
        pak[..4].copy_from_slice(&spec::pak::MAGIC.to_le_bytes());
        pak[4..6].copy_from_slice(&spec::pak::VERSION.to_le_bytes());
        for (offset, value) in [
            (8, count as u32),
            (12, directory as u32),
            (16, names as u32),
        ] {
            pak[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        for i in 0..count {
            let offset = directory + i * 24;
            for (field, value) in [(4, data as u32), (8, 12), (12, (i * 8) as u32)] {
                pak[offset + field..offset + field + 4].copy_from_slice(&value.to_le_bytes());
            }
            pak[offset + 16..offset + 18].copy_from_slice(&8u16.to_le_bytes());
            pak[names + i * 8..names + (i + 1) * 8].copy_from_slice(b"ui:img.x");
        }
        pak[data..data + 5].copy_from_slice(&[1, 0, 1, 0, 3]);
        let mut engine = guest();
        assert!(
            engine
                .boot("globalThis.frame=()=>{}", &pak)
                .unwrap_err()
                .contains("Boot texture")
        );
        assert_eq!(engine.surface.with_ui(|ui| ui.texture_slot_count()), 0);
        // Nine directory entries may point at one payload; each upload owns
        // its own native copy, so counting unique payloads would be unsafe.
        pak[8..12].copy_from_slice(&9u32.to_le_bytes());
        pak.resize(data + 8 + 512 * 512 * 4, 0);
        pak[data..data + 5].copy_from_slice(&[0, 2, 0, 2, 3]);
        for i in 0..9 {
            let offset = directory + i * 24;
            pak[offset + 8..offset + 12].copy_from_slice(&(8u32 + 512 * 512 * 4).to_le_bytes());
        }
        let mut byte_limited = guest();
        assert!(
            byte_limited
                .boot("globalThis.frame=()=>{}", &pak)
                .unwrap_err()
                .contains("Boot texture")
        );
        assert_eq!(
            byte_limited.surface.with_ui(|ui| ui.texture_slot_count()),
            0
        );
        let mut healthy = guest();
        healthy
            .boot("globalThis.frame=()=>ui.svcSend('healthy')", &[])
            .unwrap();
        healthy.frame(&[]).unwrap();
        assert_eq!(healthy.take().unwrap(), "healthy");
    }
    #[test]
    fn tileset_upload_shares_texture_admission_and_reclaims_capacity() {
        let mut blob = vec![0u8; 28 + 8 + 1024 + 2];
        blob[..4].copy_from_slice(&spec::tileset::MAGIC.to_le_bytes());
        blob[4..6].copy_from_slice(&spec::tileset::VERSION.to_le_bytes());
        for (offset, value) in [(6, 1u16), (8, 4), (10, 4), (12, 1), (14, 1)] {
            blob[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
        }
        for (offset, value) in [(16, 36u32), (20, 28), (24, 1060), (32, 2)] {
            blob[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        blob[1060..].copy_from_slice(&[142, 3]);
        let mut pak = vec![0u8; 52];
        pak[..4].copy_from_slice(&spec::pak::MAGIC.to_le_bytes());
        pak[4..6].copy_from_slice(&spec::pak::VERSION.to_le_bytes());
        for (offset, value) in [
            (8, 1u32),
            (12, 24),
            (16, 48),
            (28, 52),
            (32, blob.len() as u32),
        ] {
            pak[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
        }
        pak[40..42].copy_from_slice(&4u16.to_le_bytes());
        pak[48..52].copy_from_slice(b"tile");
        pak.extend_from_slice(&blob);
        let mut engine = guest();
        engine.boot("const pixels=new Uint8Array(512*512*4),handles=[];for(let i=0;i<8;i++)handles.push(ui.uploadTexture(pixels,512,512,3));let code='';try{ui.loadTileTexture('tile',0)}catch(e){code=e.code}ui.freeTexture(handles[0]);const handle=ui.loadTileTexture('tile',0);globalThis.frame=()=>ui.svcSend(code+':'+(handle>=0)+':'+ui.loadTileTexture('missing',0)+':'+ui.loadTileTexture('tile',-1))", &pak).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY:true:-1:-1");
        engine.surface.with_ui(|ui| {
            let (_, texture) = (0..ui.texture_slot_count())
                .filter_map(|slot| ui.texture_at(slot as u32))
                .find(|(_, texture)| texture.w == 4)
                .unwrap();
            assert_eq!(texture.pixels, &[3u8; 16]);
            assert_eq!(texture.palette.unwrap().len(), 1024);
        });
    }
    #[test]
    fn compressed_image_admission_counts_decoded_storage_and_palette() {
        let mut engine = guest();
        engine.boot("const pixels=new Uint8Array(512*512*4),handles=[];for(let i=0;i<8;i++)handles.push(ui.uploadTexture(pixels,512,512,3));const image=new Uint8Array(1034);image.set([4,0,4,0,5,1,0,0]);image.set([142,3],1032);let code='';try{ui.uploadImgEntry(image)}catch(e){code=e.code}ui.freeTexture(handles[0]);const handle=ui.uploadImgEntry(image);globalThis.frame=()=>ui.svcSend(code+':'+(handle>=0)+':'+ui.uploadImgEntry(new Uint8Array(7)))",&[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY:true:-1");
        engine.surface.with_ui(|ui| {
            let (_, texture) = (0..ui.texture_slot_count())
                .filter_map(|slot| ui.texture_at(slot as u32))
                .find(|(_, texture)| texture.w == 4)
                .unwrap();
            assert_eq!(texture.pixels, &[3u8; 16]);
            assert_eq!(texture.palette.unwrap().len(), 1024);
        });
    }
    #[test]
    fn raw_texture_byte_budget_reclaims_capacity_and_isolates_guests() {
        let mut engine = guest();
        engine.boot("const pixels=new Uint8Array(512*512*4),handles=[];for(let i=0;i<8;i++)handles.push(ui.uploadTexture(pixels,512,512,3));const a=handles[0],b=handles[7];let aggregate='',single='';try{ui.uploadTexture(new Uint8Array(4),1,1,3)}catch(e){aggregate=e.code}try{ui.uploadTexture(new Uint8Array(4*1024*1024+1),1,1,3)}catch(e){single=e.code}ui.freeTexture(a);const reused=ui.uploadTexture(pixels,512,512,3);globalThis.frame=()=>ui.svcSend([a>=0,b>=0,aggregate,single,reused>=0].join(':'))",&[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "true:true:BUSY:BUSY:true");
        let mut other = guest();
        other.boot("const handle=ui.uploadTexture(new Uint8Array(4),1,1,3);globalThis.frame=()=>ui.svcSend(String(handle>=0))", &[]).unwrap();
        other.frame(&[]).unwrap();
        assert_eq!(other.take().unwrap(), "true");
    }
    #[test]
    fn raw_texture_quota_reclaims_freed_handles() {
        let mut engine = guest();
        engine.boot("const pixels=new Uint8Array(64*64*4),handles=[];for(let i=0;i<256;i++)handles.push(ui.uploadTexture(pixels,64,64,3));let code='';try{ui.uploadTexture(pixels,64,64,3)}catch(e){code=e.code}ui.freeTexture(handles[0]);const replacement=ui.uploadTexture(pixels,64,64,3);globalThis.frame=()=>ui.svcSend(code+':'+(replacement>0))",&[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY:true");
    }
    #[test]
    fn aggregate_text_admission_reclaims_replacement_and_destroy_capacity() {
        let mut engine = guest();
        engine.boot("const nodes=[];const text='x'.repeat(4096);for(let i=0;i<512;i++){let n=ui.createNode(1);nodes.push(n);ui.setText(n,text)}const extra=ui.createNode(1);let code='';try{ui.setText(extra,text)}catch(e){code=e.code}ui.replaceText(nodes[0],'');ui.setText(extra,text);ui.destroyNode(nodes[1]);const reused=ui.createNode(1);ui.setText(reused,text);globalThis.frame=()=>ui.svcSend(code)",&[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY");
        let id = engine
            .guest
            .with(|ctx| ctx.eval::<i32, _>("reused"))
            .unwrap();
        assert_eq!(
            engine.surface.with_ui(|ui| ui.node_text(id).unwrap().len()),
            4096
        );
    }
    #[test]
    fn native_text_limit_counts_utf8_and_preserves_previous_value() {
        let mut engine = guest();
        engine.boot("const n=ui.createNode(1);ui.setText(n,42);let code='';try{ui.replaceText(n,'😀'.repeat(1025))}catch(e){code=e.code}globalThis.frame=()=>ui.svcSend(code)",&[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY");
        let value = engine.guest.with(|ctx| ctx.eval::<i32, _>("n")).unwrap();
        assert_eq!(
            engine
                .surface
                .with_ui(|ui| ui.node_text(value).map(str::to_owned)),
            Some("42".into())
        );
    }
    #[test]
    fn native_live_node_budget_reclaims_subtrees_and_isolates_guests() {
        let mut engine = guest();
        engine.boot("let code='';const root=ui.createNode(1);for(let i=1;i<16384;i++){const n=ui.createNode(1);ui.insertBefore(root,n,0)}try{ui.createNode(1)}catch(e){code=e.code}ui.destroyNode(root);for(let i=0;i<16385;i++){const n=ui.createNode(1);ui.destroyNode(n)}globalThis.frame=()=>ui.svcSend(code)",&[]).unwrap();
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "BUSY");
        let mut healthy = guest();
        healthy
            .boot(
                "const n=ui.createNode(1);globalThis.frame=()=>ui.svcSend(n>0?'ok':'failed')",
                &[],
            )
            .unwrap();
        healthy.frame(&[]).unwrap();
        assert_eq!(healthy.take().unwrap(), "ok");
    }
    #[test]
    fn launch_data_enters_guest_as_json_values() {
        let mut engine = guest();
        engine.boot("globalThis.frame=()=>{};globalThis.__miniLifecycle=(event,data)=>ui.svcSend(event+':'+data.source+':'+data.path+':'+data.query.id)",&[]).unwrap();
        assert!(
            engine
                .lifecycle_data("launch", &" ".repeat(4097))
                .unwrap_err()
                .contains("byte limit")
        );
        engine
            .lifecycle_data(
                "launch",
                r#"{"source":"qr","path":"/detail","query":{"id":"123"}}"#,
            )
            .unwrap();
        assert_eq!(engine.take().unwrap(), "launch:qr:/detail:123");
        assert!(
            engine
                .lifecycle("launch")
                .unwrap_err()
                .contains("already launched")
        );
        engine.frame(&[]).unwrap();
    }
    #[test]
    fn system_back_is_optional_strict_and_bounded() {
        let mut absent = guest();
        absent.boot("globalThis.frame=()=>{}", &[]).unwrap();
        assert!(!absent.system_back().unwrap());
        absent.suspend().unwrap();
        assert!(absent.system_back().is_err());
        absent.resume().unwrap();
        absent.frame(&[]).unwrap();

        let mut routed = guest();
        routed.boot("let depth=2,n=0;globalThis.frame=()=>ui.svcSend('frame:'+ ++n);globalThis.__miniBack=()=>{if(depth===1)return false;depth--;ui.svcSend('back:'+depth);return true}", &[]).unwrap();
        routed.frame(&[]).unwrap();
        assert_eq!(routed.take().unwrap(), "frame:1");
        assert!(routed.system_back().unwrap());
        assert_eq!(routed.take().unwrap(), "back:1");
        assert!(!routed.system_back().unwrap());
        routed.frame(&[]).unwrap();
        assert_eq!(routed.take().unwrap(), "frame:2");

        for hook in ["()=>1", "()=>Promise.resolve(true)", "()=>{throw Error('bad back')}", "()=>{while(true){}}", "()=>{const f=()=>Promise.resolve().then(f);f();return true}"] {
            let mut malicious = guest();
            malicious.boot(&format!("globalThis.frame=()=>{{}};globalThis.__miniBack={hook}"), &[]).unwrap();
            assert!(malicious.system_back().is_err());
            assert!(malicious.frame(&[]).is_err());
            let mut healthy = guest();
            healthy.boot("globalThis.frame=()=>{}", &[]).unwrap();
            healthy.frame(&[]).unwrap();
        }
    }
    #[test]
    fn lifecycle_callbacks_and_promise_jobs_are_bounded() {
        for callback in [
            "()=>{while(true){}}",
            "()=>{const f=()=>Promise.resolve().then(f);f()}",
        ] {
            let mut engine = guest();
            engine
                .boot(
                    &format!("globalThis.frame=()=>{{}};globalThis.__miniLifecycle={callback}"),
                    &[],
                )
                .unwrap();
            assert!(engine.lifecycle("show").is_err());
            assert!(engine.frame(&[]).is_err());
            assert!(engine.resume().is_err());
        }
        let mut engine = guest();
        engine
            .boot(
                "globalThis.frame=()=>{};globalThis.__miniLifecycle=e=>ui.svcSend(e)",
                &[],
            )
            .unwrap();
        assert!(engine.lifecycle("invalid").is_err());
        for event in ["launch", "show", "hide", "memoryWarning", "unload"] {
            engine.lifecycle(event).unwrap();
            assert_eq!(engine.take().unwrap(), event);
        }
    }
    #[test]
    fn suspension_preserves_realm_and_queued_completions_without_advancing_frames() {
        let mut engine = guest();
        engine
            .boot(
                "let n=0;globalThis.frame=()=>ui.svcSend(++n+':'+(ui.svcPoll()||'').trim())",
                &[],
            )
            .unwrap();
        engine.frame(&[]).unwrap();
        engine.suspend().unwrap();
        engine.suspend().unwrap();
        assert!(engine.frame(&[]).is_err());
        assert!(engine.take().is_none());
        engine.post("completion").unwrap();
        engine.resume().unwrap();
        engine.resume().unwrap();
        assert_eq!(engine.take().unwrap(), "1:");
        engine.frame(&[]).unwrap();
        assert_eq!(engine.take().unwrap(), "2:completion");
        engine.stop();
        assert!(engine.resume().is_err());
    }
    #[test]
    fn retained_damage_matches_full_repaint_through_movement_and_removal() {
        for density in [1, 3] {
            let mut engine = Instance::new(64, 64, density, 24 * 1024 * 1024, "pjm-ios").unwrap();
            engine.boot("globalThis.frame=()=>{}", &[]).unwrap();
            let node = engine.surface.with_ui(|ui| {
                let node = ui.create_node(spec::NodeType::View as u8);
                ui.set_prop(node, spec::prop::WIDTH, 12.0);
                ui.set_prop(node, spec::prop::HEIGHT, 12.0);
                ui.set_prop(node, spec::prop::BG_COLOR, 0xffff0000u32 as f64);
                ui.insert_before(spec::ROOT_ID, node, 0);
                node
            });
            let mut saw_partial = false;
            for step in 0..8 {
                if step > 0 {
                    engine.surface.with_ui(|ui| {
                        if step == 7 {
                            ui.destroy_node(node);
                        } else {
                            ui.set_prop(node, spec::prop::TRANSLATE_X, (step * 4) as f64);
                            ui.set_prop(node, spec::prop::BG_COLOR, (0xff00ff00u32 + step) as f64);
                        }
                    });
                }
                engine.frame(&[]).unwrap();
                let retained = engine.render().unwrap().to_vec();
                assert!(engine.damage().region_count() > 0);
                saw_partial |= !engine.damage().is_full_redraw();
                let mut reference = vec![0; retained.len()];
                engine.surface.with_ui(|ui| {
                    let words = ui.draw().words.clone();
                    raster::render_scaled_argb(ui, &words, &mut reference, density);
                });
                assert_eq!(retained, reference, "step {step}, density {density}");
                assert_eq!(engine.render().unwrap(), reference);
                assert_eq!(engine.damage().region_count(), 0, "unchanged frame");
            }
            assert!(saw_partial);
        }
    }
    #[test]
    fn independent_guests_core_ids_mailboxes_and_teardown() {
        let mut first = guest();
        let mut second = guest();
        first
            .boot(
                "let n=ui.createNode(1);globalThis.frame=()=>ui.svcSend('first:'+n)",
                &[],
            )
            .unwrap();
        second
            .boot(
                "let n=ui.createNode(1);globalThis.frame=()=>ui.svcSend('second:'+n)",
                &[],
            )
            .unwrap();
        first.frame(&[]).unwrap();
        second.frame(&[]).unwrap();
        let a = first.take().unwrap();
        let b = second.take().unwrap();
        assert_eq!(a.split(':').last(), b.split(':').last());
        assert!(first.take().is_none());
        drop(first);
        second.frame(&[]).unwrap();
        assert_eq!(second.take().unwrap(), b);
        assert_eq!(second.render().unwrap().len(), 64 * 64 * 4);
    }
    #[test]
    fn unhandled_promises_fail_the_turn_but_same_turn_handlers_recover() {
        let mut frame_failure = guest();
        frame_failure.boot("globalThis.frame=()=>{ui.svcSend('discard');Promise.reject(new Error('frame failure'))}", &[]).unwrap();
        assert!(
            frame_failure
                .frame(&[])
                .unwrap_err()
                .contains("unhandled Promise")
        );
        assert!(frame_failure.take().is_none());
        assert!(frame_failure.frame(&[]).is_err());
        let mut broken = guest();
        assert!(
            broken
                .boot(
                    "globalThis.frame=()=>{};Promise.reject(new Error('boom'))",
                    &[]
                )
                .unwrap_err()
                .contains("unhandled Promise")
        );
        let mut handled = guest();
        handled.boot("globalThis.frame=()=>ui.svcSend('healthy');const p=Promise.reject(new Error('expected'));Promise.resolve().then(()=>p.catch(()=>{}))", &[]).unwrap();
        handled.frame(&[]).unwrap();
        assert_eq!(handled.take().unwrap(), "healthy");
        let mut chain = guest();
        let error = chain
            .boot(
                "globalThis.frame=()=>{};const f=()=>Promise.resolve().then(f);f()",
                &[],
            )
            .unwrap_err();
        assert!(
            error.contains("unhandled Promise") || error.contains("deadline"),
            "{error}"
        );
    }
    #[test]
    fn quotas_and_failures_remain_local() {
        let mut looping = guest();
        assert!(looping.boot("while(true){}", &[]).is_err());
        assert!(looping.take().is_none());
        let mut jobs = guest();
        assert!(
            jobs.boot(
                "globalThis.frame=()=>{};const f=()=>{Promise.resolve().then(f)};f()",
                &[]
            )
            .unwrap_err()
            .contains("deadline")
        );
        let mut limited = guest();
        assert!(
            limited
                .boot(
                    "const x=new Uint8Array(64*1024*1024);globalThis.frame=()=>{}",
                    &[]
                )
                .unwrap_err()
                .contains("memory")
        );
        let mut healthy = guest();
        healthy
            .boot("globalThis.frame=()=>ui.svcSend('ok')", &[])
            .unwrap();
        for _ in 0..32 {
            healthy.frame(&[]).unwrap();
        }
        assert!(healthy.frame(&[]).is_err());
        assert!(healthy.take().is_none());
        let mut incoming = guest();
        incoming.boot("globalThis.frame=()=>{}", &[]).unwrap();
        for _ in 0..32 {
            incoming.post("reply").unwrap();
        }
        assert!(incoming.post("overflow").is_err());
    }
    #[test]
    fn frame_failure_is_terminal_and_native_capacity_errors_have_codes() {
        let mut broken = guest();
        broken
            .boot(
                "globalThis.frame=()=>{ui.svcSend('must-not-dispatch');while(true){}}",
                &[],
            )
            .unwrap();
        assert!(broken.frame(&[]).unwrap_err().contains("interrupted"));
        assert!(broken.take().is_none());
        assert!(
            broken
                .boot("globalThis.frame=()=>{}", &[])
                .unwrap_err()
                .contains("new instance")
        );
        let mut healthy = guest();
        healthy.boot("globalThis.frame=()=>{for(let i=0;i<33;i++){try{ui.svcSend('ok')}catch(error){globalThis.errorCode=error.code}}}",&[]).unwrap();
        healthy.frame(&[]).unwrap();
        assert_eq!(
            healthy
                .guest
                .with(|ctx| ctx.globals().get::<_, String>("errorCode"))
                .unwrap(),
            "BUSY"
        );
        for _ in 0..32 {
            assert_eq!(healthy.take().unwrap(), "ok");
        }
        assert!(healthy.take().is_none());
    }
}

/// Strict verification for host-provisioned Ed25519 keys. No guest callback.
/// # Safety
/// Nonempty inputs must point to readable buffers of the specified lengths.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn mp_ed25519_verify(
    key: *const u8,
    key_len: usize,
    signature: *const u8,
    signature_len: usize,
    message: *const u8,
    message_len: usize,
) -> i32 {
    if key.is_null()
        || key_len != 32
        || signature.is_null()
        || signature_len != 64
        || message_len > 65536
        || (message.is_null() && message_len != 0)
    {
        return -1;
    }
    std::panic::catch_unwind(|| {
        let key_bytes: &[u8; 32] = unsafe { std::slice::from_raw_parts(key, 32) }
            .try_into()
            .unwrap();
        let signature_bytes: &[u8; 64] = unsafe { std::slice::from_raw_parts(signature, 64) }
            .try_into()
            .unwrap();
        let data = if message_len == 0 {
            &[]
        } else {
            unsafe { std::slice::from_raw_parts(message, message_len) }
        };
        let Ok(verifier) = ed25519_dalek::VerifyingKey::from_bytes(key_bytes) else {
            return -1;
        };
        if verifier
            .verify_strict(data, &ed25519_dalek::Signature::from_bytes(signature_bytes))
            .is_ok()
        {
            0
        } else {
            -1
        }
    })
    .unwrap_or(-1)
}
#[cfg(test)]
mod signature_tests {
    use super::mp_ed25519_verify;
    fn hex(value: &str) -> Vec<u8> {
        (0..value.len())
            .step_by(2)
            .map(|index| u8::from_str_radix(&value[index..index + 2], 16).unwrap())
            .collect()
    }
    #[test]
    fn rfc8032_vector_and_strict_rejections() {
        let key = hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
        let signature = hex(
            "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
        );
        unsafe {
            assert_eq!(
                mp_ed25519_verify(
                    key.as_ptr(),
                    32,
                    signature.as_ptr(),
                    64,
                    std::ptr::null(),
                    0
                ),
                0
            );
            assert_eq!(
                mp_ed25519_verify(
                    key.as_ptr(),
                    32,
                    signature.as_ptr(),
                    64,
                    b"wrong".as_ptr(),
                    5
                ),
                -1
            );
            let mut changed = signature.clone();
            changed[0] ^= 1;
            assert_eq!(
                mp_ed25519_verify(key.as_ptr(), 32, changed.as_ptr(), 64, std::ptr::null(), 0),
                -1
            );
            let mut weak_key = [0u8; 32];
            weak_key[0] = 1;
            let mut weak_signature = [0u8; 64];
            weak_signature[0] = 1;
            assert_eq!(
                mp_ed25519_verify(
                    weak_key.as_ptr(),
                    32,
                    weak_signature.as_ptr(),
                    64,
                    std::ptr::null(),
                    0
                ),
                -1
            );
            changed[32..].fill(255);
            assert_eq!(
                mp_ed25519_verify(key.as_ptr(), 32, changed.as_ptr(), 64, std::ptr::null(), 0),
                -1
            );
            assert_eq!(
                mp_ed25519_verify(
                    std::ptr::null(),
                    32,
                    signature.as_ptr(),
                    64,
                    std::ptr::null(),
                    0
                ),
                -1
            );
            assert_eq!(
                mp_ed25519_verify(
                    key.as_ptr(),
                    32,
                    signature.as_ptr(),
                    63,
                    std::ptr::null(),
                    0
                ),
                -1
            );
            assert_eq!(
                mp_ed25519_verify(
                    key.as_ptr(),
                    32,
                    signature.as_ptr(),
                    64,
                    b"x".as_ptr(),
                    65537
                ),
                -1
            );
        }
    }
}
