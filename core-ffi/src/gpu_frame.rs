//! Shared admission for bounded native GPU command/resource handoff.
//! Adapted from pinned PocketJS GLES source; see gles/LICENSE-UPSTREAM.txt.
use crate::gpu_texture::texture_rgba;
use pocketjs_core::{spec, Ui};

#[allow(dead_code)]
#[derive(Clone, Copy)]
pub(crate) struct GlyphSnapshot {
    pub slot: u8,
    pub glyph: u16,
    pub handle: i32,
    pub uv: [f32; 4],
    pub width: u32,
    pub height: u32,
}
#[allow(dead_code)]
pub(crate) struct GpuSnapshot {
    pub draw: DrawSnapshot,
    pub textures: Vec<TextureSnapshot>,
    pub glyphs: Vec<GlyphSnapshot>,
    pub(crate) _glyph_allocation: crate::gpu_budget::Reservation,
    pub(crate) _texture_allocation: crate::gpu_budget::Reservation,
}
/// Prepare only glyphs referenced by the validated stream, then own all bytes.
#[allow(dead_code)]
pub(crate) fn capture_frame(ui: &mut Ui, max_side: u32) -> Option<GpuSnapshot> {
    capture_frame_with_budget(ui, max_side, crate::gpu_budget::shared())
}
pub(crate) fn capture_frame_with_budget(
    ui: &mut Ui,
    max_side: u32,
    budget: &std::sync::Arc<crate::gpu_budget::Budget>,
) -> Option<GpuSnapshot> {
    let draw = capture_commands_with_budget(ui, budget)?;
    let glyph_allocation = budget.reserve((draw.vertex_bound / 6).checked_mul(256)?)?;
    let mut glyphs = Vec::new();
    glyphs.try_reserve_exact(draw.vertex_bound / 6).ok()?;
    let mut seen = std::collections::HashSet::new();
    seen.try_reserve(draw.vertex_bound / 6).ok()?;
    let mut index = 0;
    while index < draw.words.len() {
        let words = &draw.words;
        let length = match words[index] {
            spec::draw_op::GLYPH_RUN => {
                let slot = (words[index + 1] & 255) as u8;
                let count = (words[index + 1] >> 16) as usize;
                for offset in 0..count {
                    let glyph = (words[index + 4 + offset * 2] & 65535) as u16;
                    if !seen.insert(((slot as u32) << 16) | glyph as u32) {
                        continue;
                    }
                    let Some(atlas) = ui.font_atlas(slot) else {
                        continue;
                    };
                    if glyph >= atlas.glyph_count {
                        continue;
                    }
                    let (width, height) = (atlas.cell_w, atlas.cell_h);
                    let page = ui.prepare_glyph_page(slot, glyph)?;
                    admitted_image_bytes(ui, max_side)?;
                    glyphs.push(GlyphSnapshot {
                        slot,
                        glyph,
                        handle: page.handle as i32,
                        uv: page.uv(glyph),
                        width,
                        height,
                    });
                }
                3 + count * 2
            }
            spec::draw_op::RECT => 4,
            spec::draw_op::GRAD_RECT => 6,
            spec::draw_op::TRI => 7,
            spec::draw_op::TEX_QUAD => 9,
            spec::draw_op::TEX_TRI => 12,
            spec::draw_op::SCISSOR => 3,
            spec::draw_op::SCISSOR_POP => 1,
            _ => return None,
        };
        index += length;
    }
    let (textures, texture_allocation) = capture_textures_with_budget(ui, max_side, budget)?;
    Some(GpuSnapshot {
        draw,
        textures,
        glyphs,
        _glyph_allocation: glyph_allocation,
        _texture_allocation: texture_allocation,
    })
}

/// Upload bytes and identity owned independently of the retained UI/cache.
#[allow(dead_code)]
pub(crate) struct TextureSnapshot {
    pub handle: i32,
    pub revision: u64,
    pub width: u32,
    pub height: u32,
    pub linear: bool,
    pub rgba: Vec<u8>,
}
#[allow(dead_code)]
pub(crate) fn capture_textures(
    ui: &Ui,
    max_side: u32,
) -> Option<(Vec<TextureSnapshot>, crate::gpu_budget::Reservation)> {
    capture_textures_with_budget(ui, max_side, crate::gpu_budget::shared())
}
fn capture_textures_with_budget(
    ui: &Ui,
    max_side: u32,
    budget: &std::sync::Arc<crate::gpu_budget::Budget>,
) -> Option<(Vec<TextureSnapshot>, crate::gpu_budget::Reservation)> {
    // Admit the entire set before allocating any decoded copy.
    let payload = admitted_image_bytes(ui, max_side)?;
    let allocation = budget.reserve(
        payload.checked_add(
            ui.texture_slot_count()
                .checked_mul(std::mem::size_of::<TextureSnapshot>())?,
        )?,
    )?;
    let mut result = Vec::new();
    result.try_reserve_exact(ui.texture_slot_count()).ok()?;
    for slot in 0..ui.texture_slot_count() {
        if let Some((handle, revision, view)) = ui.texture_at_versioned(slot as u32) {
            let rgba = texture_rgba(view)?;
            result.push(TextureSnapshot {
                handle,
                revision,
                width: view.w,
                height: view.h,
                linear: view.linear,
                rgba,
            });
        }
    }
    Some((result, allocation))
}

/// An owned, validated command snapshot remains stable across later UI turns.
/// Texture/font resource capture is a separate required stage before GPU use.
#[allow(dead_code)]
pub(crate) struct DrawSnapshot {
    pub words: Vec<u32>,
    pub vertex_bound: usize,
    pub width: f32,
    pub height: f32,
    pub(crate) _allocation: crate::gpu_budget::Reservation,
}
#[allow(dead_code)]
pub(crate) fn capture_commands(ui: &mut Ui) -> Option<DrawSnapshot> {
    capture_commands_with_budget(ui, crate::gpu_budget::shared())
}
fn capture_commands_with_budget(
    ui: &mut Ui,
    budget: &std::sync::Arc<crate::gpu_budget::Budget>,
) -> Option<DrawSnapshot> {
    ui.draw();
    let source = &ui.current_draw_list().words;
    let vertex_bound = admitted_vertices(source)?;
    let (width, height) = ui.viewport();
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return None;
    }
    let allocation = budget.reserve(source.len().checked_mul(4)?)?;
    let mut words = Vec::new();
    words.try_reserve_exact(source.len()).ok()?;
    words.extend_from_slice(source);
    Some(DrawSnapshot {
        words,
        vertex_bound,
        width,
        height,
        _allocation: allocation,
    })
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;
    use crate::Instance;
    #[test]
    fn glyph_capture_owns_cross_page_resources_and_deduplicates_runs() {
        let mut atlas = Vec::new();
        atlas.extend_from_slice(&spec::font_atlas::MAGIC.to_le_bytes());
        atlas.extend_from_slice(&spec::font_atlas::VERSION.to_le_bytes());
        atlas.extend_from_slice(&50u16.to_le_bytes());
        atlas.extend_from_slice(&[64, 64, 60, 64, 0, 0, 1, 0]);
        for gid in 0..50u16 {
            atlas.extend_from_slice(&(65 + gid as u32).to_le_bytes());
            atlas.extend_from_slice(&gid.to_le_bytes());
            atlas.extend_from_slice(&[64, 0]);
        }
        atlas.resize(atlas.len() + 50 * 64 * 64, 127);
        let mut ui = Ui::new();
        assert!(ui.load_font_atlas(&atlas));
        let text = ui.create_node(spec::NodeType::Text as u8);
        ui.set_text(text, "ArA");
        ui.set_prop(text, spec::prop::WIDTH, 192.0);
        ui.set_prop(text, spec::prop::HEIGHT, 64.0);
        ui.insert_before(spec::ROOT_ID, text, 0);
        ui.tick();
        let frame = capture_frame(&mut ui, 4096).unwrap();
        let geometry = crate::gpu_geometry::expand(&frame).unwrap();
        assert_eq!(geometry.vertices.len(), 18);
        assert_eq!(geometry.commands.len(), 3);
        assert_eq!(geometry.commands[0].texture, geometry.commands[2].texture);
        assert_ne!(geometry.commands[0].texture, geometry.commands[1].texture);
        assert_eq!(frame.glyphs.len(), 2);
        assert_ne!(frame.glyphs[0].handle, frame.glyphs[1].handle);
        for glyph in &frame.glyphs {
            assert_eq!((glyph.width, glyph.height), (64, 64));
            assert_eq!(glyph.slot, 0);
            assert!(glyph
                .uv
                .iter()
                .all(|value| value.is_finite() && *value >= 0.0 && *value <= 1.0));
            assert!(frame
                .textures
                .iter()
                .any(|texture| texture.handle == glyph.handle && !texture.rgba.is_empty()));
        }
        let pixels = frame.textures[0].rgba.clone();
        ui.free_texture(frame.glyphs[0].handle);
        assert_eq!(frame.textures[0].rgba, pixels);
    }
    #[test]
    fn captured_texture_identity_and_pixels_survive_slot_reuse() {
        let mut ui = Ui::new();
        let handle = ui.upload_texture(&[1, 2, 3, 4], 1, 1, spec::psm::PSM_8888);
        assert!(handle >= 0);
        let (snapshot, _allocation) = capture_textures(&ui, 4096).unwrap();
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].handle, handle);
        assert_eq!((snapshot[0].width, snapshot[0].height), (1, 1));
        assert_eq!(snapshot[0].rgba, [1, 2, 3, 4]);
        ui.free_texture(handle);
        let replacement = ui.upload_texture(&[5, 6, 7, 8], 1, 1, spec::psm::PSM_8888);
        let (next, _next_allocation) = capture_textures(&ui, 4096).unwrap();
        assert_eq!(next[0].handle, replacement);
        assert_ne!(next[0].handle, snapshot[0].handle);
        assert_eq!(snapshot[0].rgba, [1, 2, 3, 4]);
        assert_eq!(next[0].rgba, [5, 6, 7, 8]);
        assert!(capture_textures(&ui, 0).is_none());
    }
    #[test]
    fn texture_capture_rejects_aggregate_before_decoding() {
        let mut ui = Ui::new();
        let indexed = vec![0u8; 1024 + 512 * 512];
        for _ in 0..64 {
            assert!(ui.upload_texture(&indexed, 512, 512, spec::psm::PSM_T8) >= 0);
        }
        assert!(capture_textures(&ui, 4096).is_none());
    }
    #[test]
    fn snapshot_owns_validated_commands_across_guest_turns() {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-ios").unwrap();
        engine
            .boot(
                "let n=0;globalThis.frame=()=>ui.setProp(1,64,++n===1?0xff00ff00:0xffff0000)",
                &[],
            )
            .unwrap();
        engine.frame(&[]).unwrap();
        let snapshot = engine.surface.with_ui(capture_commands).unwrap();
        assert_eq!((snapshot.width, snapshot.height), (64.0, 64.0));
        assert!(snapshot.vertex_bound > 0);
        let before = snapshot.words.clone();
        engine.frame(&[]).unwrap();
        let next = engine.surface.with_ui(capture_commands).unwrap();
        assert_ne!(next.words, before);
        assert_eq!(snapshot.words, before);
        assert_eq!(
            admitted_vertices(&snapshot.words),
            Some(snapshot.vertex_bound)
        );
    }

    #[test]
    fn snapshot_geometry_budget_failure_releases_and_recovers() {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-ios").unwrap();
        engine
            .boot("ui.setProp(1,64,0xff00ff00);globalThis.frame=()=>{}", &[])
            .unwrap();
        engine.frame(&[]).unwrap();

        let calibration = crate::gpu_budget::Budget::new(1024 * 1024);
        let frame = engine
            .surface
            .with_ui(|ui| capture_frame_with_budget(ui, 4096, &calibration))
            .unwrap();
        let frame_bytes = calibration.used();
        let bound = frame.draw.vertex_bound;
        let geometry_bytes = bound
            .checked_mul(std::mem::size_of::<crate::gpu_geometry::Vertex>())
            .unwrap()
            .checked_add(
                (bound / 3)
                    .checked_mul(std::mem::size_of::<crate::gpu_geometry::Command>())
                    .unwrap(),
            )
            .unwrap()
            .checked_add(frame.glyphs.len() * 256)
            .unwrap()
            .checked_add(frame.textures.len() * 4)
            .unwrap()
            .checked_add(MAX_CLIP_DEPTH * std::mem::size_of::<crate::gpu_geometry::Clip>())
            .unwrap();
        drop(frame);
        assert_eq!(calibration.used(), 0);

        let limit = frame_bytes + geometry_bytes - 1;
        let budget = crate::gpu_budget::Budget::new(limit);
        let frame = engine
            .surface
            .with_ui(|ui| capture_frame_with_budget(ui, 4096, &budget))
            .unwrap();
        assert_eq!(budget.used(), frame_bytes);
        assert!(crate::gpu_geometry::expand_with_budget(&frame, &budget).is_none());
        assert_eq!(budget.used(), frame_bytes);
        drop(frame);
        assert_eq!(budget.used(), 0);
        drop(budget.reserve(limit).unwrap());
        assert_eq!(budget.used(), 0);
    }
}
pub(crate) const MAX_DRAW_WORDS: usize = 262144;
pub(crate) const MAX_DRAW_VERTICES: usize = 262144;
pub(crate) const MAX_CLIP_DEPTH: usize = 256;
pub(crate) const MAX_TEXTURE_SLOTS: usize = 512;
pub(crate) const MAX_TEXTURE_BYTES: usize = 16 * 1024 * 1024;
pub(crate) const MAX_GPU_IMAGE_BYTES: usize = 64 * 1024 * 1024;

pub(crate) fn texture_bytes(width: u32, height: u32, max_side: u32) -> Option<usize> {
    if width == 0 || height == 0 || width > max_side || height > max_side {
        return None;
    }
    let bytes = (width as usize)
        .checked_mul(height as usize)?
        .checked_mul(4)?;
    (bytes <= MAX_TEXTURE_BYTES).then_some(bytes)
}

/// Conservative RGBA storage admission, including generated glyph pages.
/// Actual driver allocation and process-wide accounting need host measurements.
pub(crate) fn admitted_image_bytes(ui: &Ui, max_side: u32) -> Option<usize> {
    let slots = ui.texture_slot_count();
    if slots > MAX_TEXTURE_SLOTS {
        return None;
    }
    let mut bytes = 4usize; // Renderer-owned opaque white texel.
    for slot in 0..slots {
        if let Some((_, _, view)) = ui.texture_at_versioned(slot as u32) {
            bytes = bytes.checked_add(texture_bytes(view.w, view.h, max_side)?)?;
            if bytes > MAX_GPU_IMAGE_BYTES {
                return None;
            }
        }
    }
    Some(bytes)
}

/// Count expanded geometry before font preparation, cache uploads or VBO growth.
/// This validates the core-produced stream; guests do not receive a raw GL API.
pub(crate) fn admitted_vertices(words: &[u32]) -> Option<usize> {
    if words.len() > MAX_DRAW_WORDS {
        return None;
    }
    let (mut index, mut vertices, mut depth) = (0usize, 0usize, 0usize);
    while index < words.len() {
        let (length, added) = match words[index] {
            spec::draw_op::RECT => (4, 6),
            spec::draw_op::GRAD_RECT => (6, 6),
            spec::draw_op::TRI => (7, 3),
            spec::draw_op::TEX_QUAD => (9, 6),
            spec::draw_op::TEX_TRI => (12, 3),
            spec::draw_op::GLYPH_RUN if index + 3 <= words.len() => {
                let count = (words[index + 1] >> 16) as usize;
                (3 + count * 2, count * 6)
            }
            spec::draw_op::SCISSOR => {
                depth += 1;
                if depth > MAX_CLIP_DEPTH {
                    return None;
                }
                (3, 0)
            }
            spec::draw_op::SCISSOR_POP => {
                depth = depth.saturating_sub(1);
                (1, 0)
            }
            // Same-layer native controls are outside this host's supported scope.
            _ => return None,
        };
        if length > words.len() - index {
            return None;
        }
        let finite_uv = match words[index] {
            spec::draw_op::TEX_QUAD => {
                (4..8).all(|offset| f32::from_bits(words[index + offset]).is_finite())
            }
            spec::draw_op::TEX_TRI => (0..3).all(|vertex| {
                (1..3).all(|offset| {
                    f32::from_bits(words[index + 2 + vertex * 3 + offset]).is_finite()
                })
            }),
            _ => true,
        };
        if !finite_uv {
            return None;
        }
        vertices += added;
        if vertices > MAX_DRAW_VERTICES {
            return None;
        }
        index += length;
    }
    Some(vertices)
}
