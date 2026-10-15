import { sdk } from "./state.ts";

// JSON over HTTPS for a QuickJS guest. Responses arrive as native resource
// handles and are read back in 1536-byte base64 chunks. The host allows each
// app 4 concurrent requests and 32 per minute, so requests queue here first.

const CHUNK = 1536;
const READS_PER_RESPONSE = 4;
const MAX_PARALLEL = 3;
const RATE_LIMIT = 28;
const RATE_WINDOW_MS = 60_000;
const MAX_BYTES = 512 * 1024;

let active = 0;
const waiting: Array<() => void> = [];
const recent: number[] = [];

function acquire(): Promise<void> {
  if (active < MAX_PARALLEL) { active++; return Promise.resolve(); }
  return new Promise(resolve => waiting.push(() => { active++; resolve(); }));
}
function releaseSlot() {
  active--;
  waiting.shift()?.();
}
function admit() {
  const time = Date.now();
  while (recent.length && recent[0] <= time - RATE_WINDOW_MS) recent.shift();
  if (recent.length >= RATE_LIMIT) {
    const seconds = Math.ceil((recent[0] + RATE_WINDOW_MS - time) / 1000);
    throw new Error(`Request limit reached, try again in ${seconds}s`);
  }
  recent.push(time);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Int16Array(128).fill(-1);
for (let index = 0; index < 64; index++) LOOKUP[ALPHABET.charCodeAt(index)] = index;

function decodeInto(text: string, target: Uint8Array, offset: number) {
  let buffer = 0, bits = 0, out = offset;
  for (let index = 0; index < text.length; index++) {
    const value = LOOKUP[text.charCodeAt(index)];
    if (value < 0) break; // "=" padding
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) { bits -= 8; target[out++] = (buffer >> bits) & 0xff; }
  }
}

export function decodeUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let units: number[] = [];
  for (let index = 0; index < bytes.length;) {
    let code = bytes[index++];
    if (code >= 0xf0) code = ((code & 7) << 18) | ((bytes[index++] & 63) << 12) | ((bytes[index++] & 63) << 6) | (bytes[index++] & 63);
    else if (code >= 0xe0) code = ((code & 15) << 12) | ((bytes[index++] & 63) << 6) | (bytes[index++] & 63);
    else if (code >= 0xc0) code = ((code & 31) << 6) | (bytes[index++] & 63);
    if (code > 0xffff) { code -= 0x10000; units.push(0xd800 + (code >> 10), 0xdc00 + (code & 1023)); }
    else units.push(code);
    if (units.length >= 4096) { parts.push(String.fromCharCode.apply(null, units)); units = []; }
  }
  parts.push(String.fromCharCode.apply(null, units));
  return parts.join("");
}

/** Reads a resource with a few chunk requests in flight, so each frame stays cheap. */
async function readAll(handle: string, size: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  const total = Math.ceil(size / CHUNK);
  let next = 0;
  const worker = async () => {
    while (next < total) {
      const offset = next++ * CHUNK;
      const chunk = await sdk().resources.read({ handle, offset, count: Math.min(CHUNK, size - offset) }).promise;
      decodeInto(chunk.bodyBase64, bytes, offset);
    }
  };
  await Promise.all(Array.from({ length: Math.min(READS_PER_RESPONSE, total) }, worker));
  return bytes;
}

export async function fetchJson<T>(url: string): Promise<T> {
  await acquire();
  try {
    admit();
    const mini = sdk();
    const response = await mini.http({ url, responseMode: "resource", headers: { Accept: "application/json" } }).promise;
    const resource = response.resource;
    if (!resource) throw new Error("Expected a streamed response");
    try {
      if (response.status < 200 || response.status > 299) throw new Error(`Server returned HTTP ${response.status}`);
      if (resource.size > MAX_BYTES) throw new Error("Response is too large");
      return JSON.parse(decodeUtf8(await readAll(resource.handle, resource.size))) as T;
    } finally {
      await mini.resources.release(resource.handle).promise.catch(() => undefined);
    }
  } finally {
    releaseSlot();
  }
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
