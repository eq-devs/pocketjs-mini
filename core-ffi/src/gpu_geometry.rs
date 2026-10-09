//! Backend-neutral triangle expansion adapted from pinned PocketJS GLES.
//! See gles/LICENSE-UPSTREAM.txt. Commands preserve painter order.
use crate::gpu_frame::{admitted_vertices, GlyphSnapshot, GpuSnapshot, MAX_CLIP_DEPTH};
use pocketjs_core::spec;
use std::collections::HashMap;
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vertex {
    pub position: [f32; 2],
    pub uv: [f32; 2],
    pub color: u32,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Clip {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Command {
    pub texture: u32,
    pub first: i32,
    pub count: i32,
    pub clip: Clip,
}
#[allow(dead_code)]
pub(crate) struct Geometry {
    pub vertices: Vec<Vertex>,
    pub commands: Vec<Command>,
    _allocation: crate::gpu_budget::Reservation,
}
struct Planner {
    vertices: Vec<Vertex>,
    commands: Vec<Command>,
    white: u32,
    images: Vec<i32>,
    glyphs: HashMap<(u8, u16), GlyphSnapshot>,
}
fn xy(word: u32) -> (f32, f32) {
    (
        (word as u16 as i16) as f32,
        ((word >> 16) as u16 as i16) as f32,
    )
}
fn wh(word: u32) -> (f32, f32) {
    ((word as u16) as f32, ((word >> 16) as u16) as f32)
}
#[allow(dead_code)]
pub(crate) fn expand(frame: &GpuSnapshot) -> Option<Geometry> {
    expand_with_budget(frame, crate::gpu_budget::shared())
}
pub(crate) fn expand_with_budget(
    frame: &GpuSnapshot,
    budget: &std::sync::Arc<crate::gpu_budget::Budget>,
) -> Option<Geometry> {
    let bound = admitted_vertices(&frame.draw.words)?;
    let bytes = bound
        .checked_mul(std::mem::size_of::<Vertex>())?
        .checked_add((bound / 3).checked_mul(std::mem::size_of::<Command>())?)?
        .checked_add(frame.glyphs.len().checked_mul(256)?)?
        .checked_add(frame.textures.len().checked_mul(4)?)?
        .checked_add(MAX_CLIP_DEPTH * std::mem::size_of::<Clip>())?;
    let allocation = budget.reserve(bytes)?;
    let mut planner = Planner {
        vertices: Vec::new(),
        commands: Vec::new(),
        white: u32::MAX,
        images: Vec::new(),
        glyphs: HashMap::new(),
    };
    planner.vertices.try_reserve_exact(bound).ok()?;
    planner.commands.try_reserve_exact(bound / 3).ok()?;
    planner
        .images
        .try_reserve_exact(frame.textures.len())
        .ok()?;
    planner
        .images
        .extend(frame.textures.iter().map(|texture| texture.handle));
    planner.glyphs.try_reserve(frame.glyphs.len()).ok()?;
    for glyph in &frame.glyphs {
        planner.glyphs.insert((glyph.slot, glyph.glyph), *glyph);
    }
    planner.build(
        &frame.draw.words,
        frame.draw.width as u32,
        frame.draw.height as u32,
    );
    Some(Geometry {
        vertices: planner.vertices,
        commands: planner.commands,
        _allocation: allocation,
    })
}
impl Planner {
    fn image_name(&self, handle: i32) -> Option<u32> {
        self.images.contains(&handle).then_some(handle as u32)
    }
    fn fill_source(&self, _texture: u32) -> (u32, [f32; 2]) {
        (self.white, [0.5, 0.5])
    }
    fn quad(
        &mut self,
        top_left: [f32; 2],
        bottom_right: [f32; 2],
        uv0: [f32; 2],
        uv1: [f32; 2],
        colors: [u32; 4],
    ) {
        let top_left_vertex = Vertex {
            position: top_left,
            uv: uv0,
            color: colors[0],
        };
        let top_right_vertex = Vertex {
            position: [bottom_right[0], top_left[1]],
            uv: [uv1[0], uv0[1]],
            color: colors[1],
        };
        let bottom_right_vertex = Vertex {
            position: bottom_right,
            uv: uv1,
            color: colors[2],
        };
        let bottom_left_vertex = Vertex {
            position: [top_left[0], bottom_right[1]],
            uv: [uv0[0], uv1[1]],
            color: colors[3],
        };
        self.vertices.extend_from_slice(&[
            top_left_vertex,
            top_right_vertex,
            bottom_right_vertex,
            top_left_vertex,
            bottom_right_vertex,
            bottom_left_vertex,
        ]);
    }

    fn flush(&mut self, texture: u32, clip: Clip, start: &mut usize) {
        let end = self.vertices.len();
        if end > *start {
            // A no-op clip push/pop can split otherwise contiguous geometry.
            // Merge only adjacent ranges with identical texture and scissor;
            // painter order and alpha compositing stay unchanged.
            if let Some(previous) = self.commands.last_mut() {
                if previous.texture == texture
                    && previous.clip == clip
                    && previous.first + previous.count == *start as i32
                {
                    previous.count += (end - *start) as i32;
                    *start = end;
                    return;
                }
            }
            self.commands.push(Command {
                texture,
                first: *start as i32,
                count: (end - *start) as i32,
                clip,
            });
            *start = end;
        }
    }

    fn build(&mut self, words: &[u32], logical_width: u32, logical_height: u32) {
        self.vertices.clear();
        self.commands.clear();
        let full = Clip {
            x: 0,
            y: 0,
            w: logical_width as i32,
            h: logical_height as i32,
        };
        let mut clip = full;
        let mut clip_stack = Vec::<Clip>::with_capacity(MAX_CLIP_DEPTH);
        let mut texture = self.white;
        let mut fill_source = 0;
        let mut fill = (self.white, [0.5, 0.5]);
        let mut start = 0usize;
        let mut index = 0usize;

        while index < words.len() {
            match words[index] {
                spec::draw_op::RECT if index + 4 <= words.len() => {
                    if fill_source != texture {
                        fill = self.fill_source(texture);
                        fill_source = fill.0;
                    }
                    if texture != fill.0 {
                        self.flush(texture, clip, &mut start);
                        texture = fill.0;
                    }
                    let (x, y) = xy(words[index + 1]);
                    let (width, height) = wh(words[index + 2]);
                    let color = words[index + 3];
                    if width > 0.0 && height > 0.0 && color >> 24 != 0 {
                        self.quad([x, y], [x + width, y + height], fill.1, fill.1, [color; 4]);
                    }
                    index += 4;
                }
                spec::draw_op::GRAD_RECT if index + 6 <= words.len() => {
                    if fill_source != texture {
                        fill = self.fill_source(texture);
                        fill_source = fill.0;
                    }
                    if texture != fill.0 {
                        self.flush(texture, clip, &mut start);
                        texture = fill.0;
                    }
                    let (x, y) = xy(words[index + 1]);
                    let (width, height) = wh(words[index + 2]);
                    let from = words[index + 3];
                    let to = words[index + 4];
                    let direction = words[index + 5];
                    let colors = if direction == spec::GradDir::ToTop as u32 {
                        [to, to, from, from]
                    } else if direction == spec::GradDir::ToLeft as u32 {
                        [to, from, from, to]
                    } else if direction == spec::GradDir::ToRight as u32 {
                        [from, to, to, from]
                    } else {
                        [from, from, to, to]
                    };
                    if width > 0.0 && height > 0.0 {
                        self.quad([x, y], [x + width, y + height], fill.1, fill.1, colors);
                    }
                    index += 6;
                }
                spec::draw_op::GLYPH_RUN if index + 3 <= words.len() => {
                    let slot = (words[index + 1] & 0xff) as usize;
                    let count = (words[index + 1] >> 16) as usize;
                    let next = index + 3 + count * 2;
                    if next > words.len() {
                        break;
                    }
                    let color = words[index + 2];
                    for glyph in 0..count {
                        let body = index + 3 + glyph * 2;
                        let (x, y) = xy(words[body]);
                        let gid = (words[body + 1] & 65535) as u16;
                        let Some(info) = self.glyphs.get(&(slot as u8, gid)).copied() else {
                            continue;
                        };
                        let name = info.handle as u32;
                        if texture != name {
                            self.flush(texture, clip, &mut start);
                            texture = name;
                        }
                        let [u0, v0, u1, v1] = info.uv;
                        self.quad(
                            [x, y],
                            [x + info.width as f32, y + info.height as f32],
                            [u0, v0],
                            [u1, v1],
                            [color; 4],
                        );
                    }
                    index = next;
                }
                spec::draw_op::TEX_QUAD if index + 9 <= words.len() => {
                    let handle = words[index + 1] as i32;
                    let Some(name) = self.image_name(handle) else {
                        index += 9;
                        continue;
                    };
                    if texture != name {
                        self.flush(texture, clip, &mut start);
                        texture = name;
                    }
                    let (x, y) = xy(words[index + 2]);
                    let (width, height) = wh(words[index + 3]);
                    if width > 0.0 && height > 0.0 {
                        self.quad(
                            [x, y],
                            [x + width, y + height],
                            [
                                f32::from_bits(words[index + 4]),
                                f32::from_bits(words[index + 5]),
                            ],
                            [
                                f32::from_bits(words[index + 6]),
                                f32::from_bits(words[index + 7]),
                            ],
                            [words[index + 8]; 4],
                        );
                    }
                    index += 9;
                }
                spec::draw_op::TEX_TRI if index + 12 <= words.len() => {
                    let handle = words[index + 1] as i32;
                    let Some(name) = self.image_name(handle) else {
                        index += 12;
                        continue;
                    };
                    if texture != name {
                        self.flush(texture, clip, &mut start);
                        texture = name;
                    }
                    let color = words[index + 11];
                    for vertex in 0..3 {
                        let offset = index + 2 + vertex * 3;
                        let (x, y) = xy(words[offset]);
                        self.vertices.push(Vertex {
                            position: [x, y],
                            uv: [
                                f32::from_bits(words[offset + 1]),
                                f32::from_bits(words[offset + 2]),
                            ],
                            color,
                        });
                    }
                    index += 12;
                }
                spec::draw_op::TRI if index + 7 <= words.len() => {
                    if texture != self.white {
                        self.flush(texture, clip, &mut start);
                        texture = self.white;
                    }
                    for vertex in 0..3 {
                        let (x, y) = xy(words[index + 1 + vertex]);
                        self.vertices.push(Vertex {
                            position: [x, y],
                            uv: [0.0, 0.0],
                            color: words[index + 4 + vertex],
                        });
                    }
                    index += 7;
                }
                spec::draw_op::SCISSOR if index + 3 <= words.len() => {
                    self.flush(texture, clip, &mut start);
                    clip_stack.push(clip);
                    let (x, y) = xy(words[index + 1]);
                    let (width, height) = wh(words[index + 2]);
                    clip = Clip {
                        x: x as i32,
                        y: y as i32,
                        w: width as i32,
                        h: height as i32,
                    };
                    index += 3;
                }
                spec::draw_op::SCISSOR_POP => {
                    self.flush(texture, clip, &mut start);
                    clip = clip_stack.pop().unwrap_or(full);
                    index += 1;
                }
                spec::draw_op::SURFACE_QUAD if index + 9 <= words.len() => {
                    index += 9;
                }
                _ => break,
            }
        }
        self.flush(texture, clip, &mut start);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gpu_frame::DrawSnapshot;
    #[test]
    fn nested_clip_batches_preserve_triangle_ranges_and_colors() {
        let rect = spec::draw_op::RECT;
        let clip = spec::draw_op::SCISSOR;
        let words = vec![
            rect,
            0,
            10 | (10 << 16),
            0xff0000ff,
            clip,
            2 | (3 << 16),
            4 | (5 << 16),
            rect,
            0,
            10 | (10 << 16),
            0xff00ff00,
            spec::draw_op::SCISSOR_POP,
            rect,
            0,
            10 | (10 << 16),
            0xffff0000,
        ];
        let frame = GpuSnapshot {
            draw: DrawSnapshot {
                _allocation: crate::gpu_budget::reserve(0).unwrap(),
                vertex_bound: 18,
                words,
                width: 64.0,
                height: 64.0,
            },
            textures: vec![],
            glyphs: vec![],
            _glyph_allocation: crate::gpu_budget::reserve(0).unwrap(),
            _texture_allocation: crate::gpu_budget::reserve(0).unwrap(),
        };
        let geometry = expand(&frame).unwrap();
        assert_eq!(geometry.vertices.len(), 18);
        assert_eq!(geometry.commands.len(), 3);
        assert_eq!(
            geometry.commands[1].clip,
            Clip {
                x: 2,
                y: 3,
                w: 4,
                h: 5
            }
        );
        assert_eq!(geometry.commands[0].clip, geometry.commands[2].clip);
        for (index, color) in [0xff0000ff, 0xff00ff00, 0xffff0000].iter().enumerate() {
            assert_eq!(geometry.commands[index].first, (index * 6) as i32);
            assert_eq!(geometry.commands[index].count, 6);
            assert!(geometry.vertices[index * 6..index * 6 + 6]
                .iter()
                .all(|vertex| vertex.color == *color));
        }
    }
}
