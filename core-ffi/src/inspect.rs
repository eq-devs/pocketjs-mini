//! Bounded, read-only retained-tree inspection at an owner-thread boundary.
use crate::Instance;
use pocketjs_core::spec;
use std::collections::HashSet;
fn quoted(text: &str) -> String {
    let mut result = String::from("\"");
    for character in text.chars() {
        match character {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            character if character < '\u{20}' => {
                result.push_str(&format!("\\u{:04x}", character as u32))
            }
            character => result.push(character),
        }
    }
    result.push('"');
    result
}
impl Instance {
    pub fn debug_tree_json(&self) -> Result<String, String> {
        if !self.ready {
            return Err("Inspector guest unavailable".into());
        }
        self.surface.with_ui(|ui| {
            let (width, height) = ui.viewport();
            let bounds = crate::inspection_geometry::screen_bounds(ui, width, height)?;
            let mut stack = vec![spec::ROOT_ID];
            let mut seen = HashSet::new();
            let mut result = String::from("{\"format\":1,\"nodes\":[");
            while let Some(id) = stack.pop() {
                if seen.len() >= 16384 || !seen.insert(id) {
                    return Err("Inspector tree limit or cycle".into());
                }
                let kind = ui.node_type(id).ok_or("Inspector stale node")?;
                let text = ui.node_text(id).ok_or("Inspector stale text")?;
                let children = ui.node_children(id);
                if text.len() > 4096 || children.len() > 16384 {
                    return Err("Inspector record limit".into());
                }
                if seen.len() > 1 {
                    result.push(',');
                }
                result.push_str(&format!(
                    "{{\"id\":{id},\"parent\":{},\"type\":{kind},\"text\":{},\"children\":[",
                    ui.node_parent(id),
                    quoted(text)
                ));
                for (index, child) in children.iter().enumerate() {
                    if index > 0 {
                        result.push(',');
                    }
                    result.push_str(&child.to_string());
                }
                result.push_str("],\"layout\":");
                match ui.layout_of(id) {
                    Some((x, y, w, h)) if [x, y, w, h].iter().all(|value| value.is_finite()) => {
                        result.push_str(&format!("[{x},{y},{w},{h}]"))
                    }
                    Some(_) => return Err("Inspector non-finite layout".into()),
                    None => result.push_str("null"),
                }
                result.push_str(",\"bounds\":");
                match bounds.get(&id).copied().flatten() {
                    Some([x, y, right, bottom]) => {
                        result.push_str(&format!("[{x},{y},{},{}]", right - x, bottom - y))
                    }
                    None => result.push_str("null"),
                }
                result.push('}');
                if result.len() > 4 * 1024 * 1024 {
                    return Err("Inspector byte limit".into());
                }
                if stack.len() + children.len() > 16384 {
                    return Err("Inspector traversal limit".into());
                }
                stack.extend(children.iter().rev().copied());
            }
            result.push_str("]}");
            if result.len() > 4 * 1024 * 1024 {
                return Err("Inspector byte limit".into());
            }
            Ok(result)
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inspector_preserves_guest_text_and_does_not_change_rendered_pixels() {
        let mut engine = Instance::new(64, 64, 1, 24 * 1024 * 1024, "pjm-ios").unwrap();
        engine.boot("const n=ui.createNode(1);ui.insertBefore(1,n,0);ui.setText(n,'quote\\\" 😀\\n');globalThis.frame=()=>{}",&[]).unwrap();
        engine.frame(&[]).unwrap();
        let before = engine.render().unwrap().to_vec();
        let tree = engine.debug_tree_json().unwrap();
        assert!(tree.contains("quote\\\" 😀\\u000a"));
        assert!(tree.contains("\"parent\":1"));
        assert_eq!(before, engine.render().unwrap());
    }
}
