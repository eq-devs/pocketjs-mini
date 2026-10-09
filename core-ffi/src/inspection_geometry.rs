//! Read-only inspection geometry, kept separate from guest debug/paint state.
//! 2D transform composition follows the exact pinned core draw.rs/fmath.rs.
use pocketjs_core::{Ui, spec, style::Resolved};
use std::collections::{HashMap, HashSet};
const PI: f32 = std::f32::consts::PI;
fn sin(x: f32) -> f32 {
    let mut r = x - 2.0 * PI * pocketjs_core::layout::floorf((x + PI) / (2.0 * PI));
    if r > PI / 2.0 {
        r = PI - r;
    } else if r < -PI / 2.0 {
        r = -PI - r;
    }
    let x2 = r * r;
    r * (1.0
        + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 + x2 * (-1.0 / 5040.0 + x2 * (1.0 / 362880.0)))))
}
#[derive(Clone, Copy, Debug)]
struct Affine {
    a: f32,
    b: f32,
    c: f32,
    d: f32,
    x: f32,
    y: f32,
}
impl Affine {
    const ID: Self = Self {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        x: 0.0,
        y: 0.0,
    };
    fn then(self, o: Self) -> Self {
        Self {
            a: self.a * o.a + self.c * o.b,
            b: self.b * o.a + self.d * o.b,
            c: self.a * o.c + self.c * o.d,
            d: self.b * o.c + self.d * o.d,
            x: self.a * o.x + self.c * o.y + self.x,
            y: self.b * o.x + self.d * o.y + self.y,
        }
    }
    fn point(self, x: f32, y: f32) -> (f32, f32) {
        (
            self.a * x + self.c * y + self.x,
            self.b * x + self.d * y + self.y,
        )
    }
}
fn local(rect: (f32, f32, f32, f32), r: &Resolved) -> Affine {
    let (x, y, w, h) = rect;
    let mut local = Affine {
        x: x + r.translate_x,
        y: y + r.translate_y,
        ..Affine::ID
    };
    if r.rotate != 0.0 || r.skew_x != 0.0 || r.scale != 1.0 || r.scale_x != 1.0 || r.scale_y != 1.0
    {
        let (cx, cy) = (w * (0.5 + r.origin_x), h * (0.5 + r.origin_y));
        let rad = r.rotate * (PI / 180.0);
        let (s, c) = if r.rotate == 0.0 {
            (0.0, 1.0)
        } else {
            (sin(rad), sin(rad + PI / 2.0))
        };
        let t = if r.skew_x == 0.0 {
            0.0
        } else {
            let rad = r.skew_x * (PI / 180.0);
            sin(rad) / sin(rad + PI / 2.0)
        };
        let (sx, sy) = (r.scale * r.scale_x, r.scale * r.scale_y);
        let (a, b, c, d) = (c * sx, s * sx, c * t * sy - s * sy, s * t * sy + c * sy);
        local = local.then(Affine {
            a,
            b,
            c,
            d,
            x: cx - (a * cx + c * cy),
            y: cy - (b * cx + d * cy),
        });
    }
    local
}
#[derive(Clone, Copy)]
struct Mat34 {
    m: [f32; 12],
}

impl Mat34 {
    const IDENTITY: Mat34 = Mat34 {
        m: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
    };

    /// self ∘ other (apply `other` first, then `self`).
    fn then(&self, o: &Mat34) -> Mat34 {
        let a = &self.m;
        let b = &o.m;
        let mut out = [0.0f32; 12];
        for row in 0..3 {
            for col in 0..4 {
                let mut v =
                    a[row * 4] * b[col] + a[row * 4 + 1] * b[4 + col] + a[row * 4 + 2] * b[8 + col];
                if col == 3 {
                    v += a[row * 4 + 3];
                }
                out[row * 4 + col] = v;
            }
        }
        Mat34 { m: out }
    }

    #[inline]
    fn apply(&self, x: f32, y: f32, z: f32) -> (f32, f32, f32) {
        let m = &self.m;
        (
            m[0] * x + m[1] * y + m[2] * z + m[3],
            m[4] * x + m[5] * y + m[6] * z + m[7],
            m[8] * x + m[9] * y + m[10] * z + m[11],
        )
    }

    fn translate(x: f32, y: f32, z: f32) -> Mat34 {
        Mat34 {
            m: [1.0, 0.0, 0.0, x, 0.0, 1.0, 0.0, y, 0.0, 0.0, 1.0, z],
        }
    }

    fn rot_x(deg: f32) -> Mat34 {
        let r = deg * (PI / 180.0);
        let (s, c) = (sin(r), sin(r + PI / 2.0));
        // Screen y grows DOWN: positive rotateX tips the top edge away, like CSS.
        Mat34 {
            m: [1.0, 0.0, 0.0, 0.0, 0.0, c, s, 0.0, 0.0, -s, c, 0.0],
        }
    }

    fn rot_y(deg: f32) -> Mat34 {
        let r = deg * (PI / 180.0);
        let (s, c) = (sin(r), sin(r + PI / 2.0));
        Mat34 {
            m: [c, 0.0, s, 0.0, 0.0, 1.0, 0.0, 0.0, -s, 0.0, c, 0.0],
        }
    }

    fn rot_z(deg: f32) -> Mat34 {
        let r = deg * (PI / 180.0);
        let (s, c) = (sin(r), sin(r + PI / 2.0));
        Mat34 {
            m: [c, -s, 0.0, 0.0, s, c, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        }
    }

    fn scale(sx: f32, sy: f32) -> Mat34 {
        Mat34 {
            m: [sx, 0.0, 0.0, 0.0, 0.0, sy, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        }
    }

    fn skew_x(deg: f32) -> Mat34 {
        let r = deg * (PI / 180.0);
        let t = sin(r) / sin(r + PI / 2.0);
        Mat34 {
            m: [1.0, t, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
        }
    }
}

// Matrix operations above are adapted from pinned draw.rs; see gles/LICENSE-UPSTREAM.txt.
#[derive(Clone, Copy)]
enum World {
    Flat(Affine),
    Projected {
        root: Affine,
        m: Mat34,
        distance: f32,
        cx: f32,
        cy: f32,
    },
}
fn local3(rect: (f32, f32, f32, f32), r: &Resolved) -> Mat34 {
    let (x, y, w, h) = rect;
    let (ox, oy) = (w * (0.5 + r.origin_x), h * (0.5 + r.origin_y));
    let mut m = Mat34::translate(x + r.translate_x, y + r.translate_y, r.translate_z)
        .then(&Mat34::translate(ox, oy, 0.0));
    if r.rotate != 0.0 {
        m = m.then(&Mat34::rot_z(r.rotate));
    }
    if r.rotate_x != 0.0 {
        m = m.then(&Mat34::rot_x(r.rotate_x));
    }
    if r.rotate_y != 0.0 {
        m = m.then(&Mat34::rot_y(r.rotate_y));
    }
    if r.skew_x != 0.0 {
        m = m.then(&Mat34::skew_x(r.skew_x));
    }
    let (sx, sy) = (r.scale * r.scale_x, r.scale * r.scale_y);
    if sx != 1.0 || sy != 1.0 {
        m = m.then(&Mat34::scale(sx, sy));
    }
    m.then(&Mat34::translate(-ox, -oy, 0.0))
}
type Box2 = [f32; 4]; // min x/y, max x/y, in screen coordinates
fn intersect(a: Box2, b: Box2) -> Box2 {
    [
        a[0].max(b[0]),
        a[1].max(b[1]),
        a[2].min(b[2]),
        a[3].min(b[3]),
    ]
}
fn bounds(world: Affine, w: f32, h: f32, screen: Box2) -> Option<Box2> {
    let pts = [
        world.point(0.0, 0.0),
        world.point(w, 0.0),
        world.point(w, h),
        world.point(0.0, h),
    ];
    point_bounds(pts, screen)
}
fn point_bounds(pts: [(f32, f32); 4], screen: Box2) -> Option<Box2> {
    if !pts.iter().all(|&(x, y)| x.is_finite() && y.is_finite()) {
        return None;
    }
    let mut out = [pts[0].0, pts[0].1, pts[0].0, pts[0].1];
    for &(x, y) in &pts[1..] {
        out = [out[0].min(x), out[1].min(y), out[2].max(x), out[3].max(y)];
    }
    out = intersect(out, screen);
    Some([out[0].floor(), out[1].floor(), out[2].ceil(), out[3].ceil()])
}
/// Bounds follow the pinned 2D walker and perspective collector without guest mutation.
pub(crate) fn screen_bounds(
    ui: &Ui,
    width: f32,
    height: f32,
) -> Result<HashMap<i32, Option<Box2>>, String> {
    let screen = [0.0, 0.0, width, height];
    let mut stack = vec![(spec::ROOT_ID, World::Flat(Affine::ID), screen, false)];
    let mut seen = HashSet::new();
    let mut result = HashMap::new();
    while let Some((id, parent, clip, hidden)) = stack.pop() {
        if seen.len() >= 16384 || !seen.insert(id) {
            return Err("Inspection geometry limit or cycle".into());
        }
        let rect = ui
            .layout_of(id)
            .ok_or("Inspection geometry missing layout")?;
        let style = ui
            .resolved_style(id)
            .ok_or("Inspection geometry missing style")?;
        let hidden = hidden || style.display == spec::Display::None as u8;
        let (world, raw) = match parent {
            World::Flat(parent) => {
                let world = parent.then(local(rect, &style));
                (World::Flat(world), bounds(world, rect.2, rect.3, screen))
            }
            World::Projected {
                root,
                m,
                distance,
                cx,
                cy,
            } => {
                let m = m.then(&local3(rect, &style));
                let pts =
                    [(0.0, 0.0), (rect.2, 0.0), (rect.2, rect.3), (0.0, rect.3)].map(|(x, y)| {
                        let (px, py, pz) = m.apply(x, y, 0.0);
                        let f = distance / (distance - pz).max(1.0);
                        root.point(cx + (px - cx) * f, cy + (py - cy) * f)
                    });
                (
                    World::Projected {
                        root,
                        m,
                        distance,
                        cx,
                        cy,
                    },
                    point_bounds(pts, screen),
                )
            }
        };
        let box2 = if hidden {
            None
        } else {
            raw.map(|b| intersect(b, clip))
                .filter(|b| b[2] > b[0] && b[3] > b[1])
        };
        // Nested overflow/perspective are not new contexts inside collect_3d.
        let next_clip =
            if matches!(world, World::Flat(_)) && style.overflow == spec::Overflow::Hidden as u8 {
                box2.unwrap_or([0.0; 4])
            } else {
                clip
            };
        let next_world = match world {
            World::Flat(root) if style.perspective > 0.0 => World::Projected {
                root,
                m: Mat34::IDENTITY,
                distance: style.perspective,
                cx: rect.2 * 0.5,
                cy: rect.3 * 0.5,
            },
            _ => world,
        };
        result.insert(id, box2);
        let children = ui.node_children(id);
        if stack.len() + children.len() > 16384 {
            return Err("Inspection geometry traversal limit".into());
        }
        for &child in children.iter().rev() {
            stack.push((child, next_world, next_clip, hidden || style.opacity <= 0.0));
        }
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn perspective_bounds_match_actual_projected_triangle_extents() {
        let mut ui = Ui::new();
        ui.set_viewport(320.0, 240.0);
        let parent = node(&mut ui, 1, 20.0, 30.0, 80.0, 80.0);
        let child = node(&mut ui, parent, 30.0, 30.0, 20.0, 20.0);
        ui.set_prop(parent, spec::prop::PERSPECTIVE, 200.0);
        ui.set_prop(child, spec::prop::TRANSLATE_Z, 100.0);
        ui.set_prop(child, spec::prop::BG_COLOR, 0xffffffffu32 as f64);
        ui.tick();
        let words = ui.draw().words.clone();
        let read = screen_bounds(&ui, 320.0, 240.0).unwrap();
        assert_eq!(read[&child], Some([40.0, 50.0, 80.0, 90.0]));
        assert_eq!(ui.draw().words, words);
        let tris: Vec<_> = words.chunks_exact(7).collect();
        assert_eq!(words.len() % 7, 0);
        assert!(!tris.is_empty());
        let mut ext = [
            f32::INFINITY,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NEG_INFINITY,
        ];
        for tri in tris {
            assert_eq!(tri[0], spec::draw_op::TRI);
            for &word in &tri[1..4] {
                let x = word as i16 as f32;
                let y = (word >> 16) as i16 as f32;
                ext = [ext[0].min(x), ext[1].min(y), ext[2].max(x), ext[3].max(y)];
            }
        }
        assert_eq!(Some(ext), read[&child]);
        ui.set_prop(child, spec::prop::ROTATE_Y, 35.0);
        ui.tick();
        let projected = screen_bounds(&ui, 320.0, 240.0).unwrap()[&child].unwrap();
        assert!(projected.iter().all(|x| x.is_finite()));
        assert_ne!(projected, ext);
    }
    fn node(ui: &mut Ui, parent: i32, x: f64, y: f64, w: f64, h: f64) -> i32 {
        let id = ui.create_node(spec::NodeType::View as u8);
        for (prop, value) in [
            (spec::prop::POS_TYPE, spec::PosType::Absolute as u8 as f64),
            (spec::prop::INSET_L, x),
            (spec::prop::INSET_T, y),
            (spec::prop::WIDTH, w),
            (spec::prop::HEIGHT, h),
        ] {
            ui.set_prop(id, prop, value);
        }
        ui.insert_before(parent, id, 0);
        id
    }
    #[test]
    fn actual_retained_tree_matches_renderer_transforms_and_preserves_draw_words() {
        let mut ui = Ui::new();
        let parent = node(&mut ui, 1, 20.0, 30.0, 80.0, 80.0);
        let child = node(&mut ui, parent, 5.0, 7.0, 20.0, 16.0);
        ui.set_prop(child, spec::prop::BG_COLOR, 0xffffffffu32 as f64);
        ui.set_prop(parent, spec::prop::TRANSLATE_X, 3.0);
        ui.set_prop(child, spec::prop::ROTATE, 30.0);
        ui.tick();
        let before = ui.draw().words.clone();
        let result = screen_bounds(&ui, 320.0, 240.0).unwrap();
        assert_eq!(ui.draw().words, before);
        let b = result[&child].unwrap();
        ui.debug_inspect(child);
        ui.draw();
        let xy = ui.debug_rect_xy();
        let wh = ui.debug_rect_wh();
        assert_eq!(
            b,
            [
                ((xy as i16) as f32),
                (((xy >> 16) as i16) as f32),
                ((xy as i16) as f32) + (wh & 65535) as f32,
                (((xy >> 16) as i16) as f32) + ((wh >> 16) & 65535) as f32
            ]
        );
        ui.debug_inspect(0);
        ui.set_prop(
            parent,
            spec::prop::OVERFLOW,
            spec::Overflow::Hidden as u8 as f64,
        );
        ui.set_prop(child, spec::prop::INSET_L, 70.0);
        ui.tick();
        let result = screen_bounds(&ui, 320.0, 240.0).unwrap();
        let p = result[&parent].unwrap();
        let c = result[&child].unwrap();
        assert!(c[2] <= p[2] && c[3] <= p[3]);
        ui.set_prop(parent, spec::prop::PERSPECTIVE, 200.0);
        ui.tick();
        assert!(screen_bounds(&ui, 320.0, 240.0).unwrap()[&child].is_some());
    }
    #[test]
    fn composed_boxes_clip_and_round_without_mutating_guest_state() {
        let world = Affine {
            x: 20.0,
            y: 30.0,
            ..Affine::ID
        }
        .then(Affine {
            a: 2.0,
            d: 3.0,
            x: 5.0,
            y: 7.0,
            ..Affine::ID
        });
        assert_eq!(
            bounds(world, 10.0, 8.0, [0.0, 0.0, 100.0, 100.0]),
            Some([25.0, 37.0, 45.0, 61.0])
        );
        assert_eq!(
            intersect([25.0, 37.0, 45.0, 61.0], [0.0, 0.0, 35.0, 50.0]),
            [25.0, 37.0, 35.0, 50.0]
        );
        assert_eq!(
            bounds(
                Affine {
                    a: -1.0,
                    x: 30.25,
                    ..Affine::ID
                },
                10.0,
                8.0,
                [0.0, 0.0, 100.0, 100.0]
            ),
            Some([20.0, 0.0, 31.0, 8.0])
        );
        assert!(
            bounds(
                Affine {
                    x: f32::INFINITY,
                    ..Affine::ID
                },
                10.0,
                8.0,
                [0.0, 0.0, 100.0, 100.0]
            )
            .is_none()
        );
    }
    #[test]
    fn exact_pinned_trig_remains_axis_aligned_for_zero_rotation() {
        assert_eq!(sin(0.0), 0.0);
        assert!((sin(PI / 2.0) - 1.0).abs() < 0.00001);
    }
}
