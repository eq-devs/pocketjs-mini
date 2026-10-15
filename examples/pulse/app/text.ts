import { getOps } from "@pocketjs/framework/solid";
import { ELLIPSIS } from "./state.ts";

// Text helpers. The engine bakes glyphs at build time (ASCII plus characters in
// source literals) and breaks lines only on "\n", so remote text is reduced to
// ASCII and wrapped here with the engine's own text measurement.

const PUNCTUATION: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "′": "'", "“": "\"", "”": "\"", "„": "\"",
  "″": "\"", "«": "\"", "»": "\"", "–": "-", "—": " - ", "−": "-", "•": "*",
  "·": "*", "×": "x", " ": " ", "→": "->", "←": "<-", "ß": "ss", "æ": "ae",
  "Æ": "AE", "ø": "o", "Ø": "O", "ł": "l", "Ł": "L",
};

export function clean(text: string): string {
  let value = text;
  try { value = value.normalize("NFKD"); } catch { /* keep the original */ }
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code < 0x7f) || character === "\n") out += character;
    else if (PUNCTUATION[character]) out += PUNCTUATION[character];
    // Combining accents (from NFKD), emoji and other scripts are dropped.
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
function character(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}
export function htmlToText(html: string): string {
  return clean(html
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\s[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => character(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => character(parseInt(decimal, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function domainOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/:?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : "news.ycombinator.com";
}

// Font slots are build-assigned: regular = index of [12,14,16,18,20,24,36] px, bold = +7.
export const SLOT = { xs: 0, sm: 1, base: 2, lgBold: 10 } as const;
const PX: Record<number, number> = { 0: 12, 1: 14, 2: 16, 10: 18 };

type TextOps = { measureText?(text: string, slot: number): number; wrapText?(text: string, slot: number, maxW: number): number[] };
function textOps(): TextOps {
  try { return getOps() as unknown as TextOps; } catch { return {}; }
}

function breakLine(line: string, slot: number, maxWidth: number): string[] {
  const ops = textOps();
  if (typeof ops.wrapText === "function") {
    try {
      const columns = ops.wrapText(line, slot, maxWidth);
      if (Array.isArray(columns)) {
        const lines: string[] = [];
        let start = 0;
        for (const column of columns) {
          lines.push(line.slice(start, column).trimEnd());
          start = column;
          while (line[start] === " ") start++;
        }
        lines.push(line.slice(start));
        return lines;
      }
    } catch { /* fall back to greedy wrapping */ }
  }
  const measure = typeof ops.measureText === "function"
    ? (text: string) => ops.measureText!(text, slot)
    : (text: string) => text.length * (PX[slot] ?? 14) * 0.56;
  const lines: string[] = [];
  let current = "";
  for (const word of line.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) { current = candidate; continue; }
    if (current) lines.push(current);
    current = word;
    while (current.length > 1 && measure(current) > maxWidth) {
      let cut = current.length - 1;
      while (cut > 1 && measure(current.slice(0, cut)) > maxWidth) cut--;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  lines.push(current);
  return lines;
}

export type Wrapped = { text: string; lines: number; truncated: boolean };
const memo = new Map<string, Wrapped>();

/** Word-wraps to a pixel width and clips to maxLines with an ellipsis. */
export function wrap(text: string, slot: number, maxWidth: number, maxLines: number): Wrapped {
  const key = `${slot}|${maxWidth}|${maxLines}|${text}`;
  const cached = memo.get(key);
  if (cached) return cached;
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (lines.length > maxLines) break;
    if (!paragraph.trim()) { if (lines.length && lines[lines.length - 1] !== "") lines.push(""); continue; }
    lines.push(...breakLine(paragraph.trim(), slot, maxWidth));
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const truncated = lines.length > maxLines;
  const kept = lines.slice(0, maxLines);
  if (truncated && kept.length) {
    const last = kept.length - 1;
    kept[last] = `${kept[last].slice(0, Math.max(0, kept[last].length - 2)).trimEnd()}${ELLIPSIS}`;
  }
  const result = { text: kept.join("\n"), lines: Math.max(1, kept.length), truncated };
  if (memo.size > 400) memo.clear();
  memo.set(key, result);
  return result;
}
