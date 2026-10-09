import { ServiceError, utf8Bytes } from "./runtime.ts";
import { strictJsonEncode } from "./json.ts";

export interface PageEntry { path: string; query: Readonly<Record<string, string>>; }
export function checkedPageQuery(path: string, query: Record<string, string>): void {
  if (!query || Array.isArray(query) || typeof query !== "object" || Object.values(query).some(value => typeof value !== "string")) throw new ServiceError("PROTOCOL", "Page query must contain string values");
  const fields = Object.entries(query);
  if (fields.length > 32 || fields.some(([key, value]) => key.length > 128 || value.length > 1024)) throw new ServiceError("PROTOCOL", "Page query exceeds field limits");
  let encoded: string;
  try { encoded = strictJsonEncode({ path, query }); } catch { throw new ServiceError("PROTOCOL", "Invalid page query"); }
  if (utf8Bytes(encoded) > 4096) throw new ServiceError("PROTOCOL", "Page query exceeds byte limit");
}
/** One guest owns the entire page stack. Returning false delegates back to the host. */
export class Navigation {
  private entries: PageEntry[];
  private listeners = new Set<(stack: readonly PageEntry[]) => void>();
  private pages: Set<string>;
  constructor(pages: readonly string[], entry = "/", privateLimit = 32, private readonly maxListeners = 256) {
    if (!pages.length || !Number.isSafeInteger(privateLimit) || privateLimit < 1 || !Number.isSafeInteger(maxListeners) || maxListeners < 1 || maxListeners > 256) throw new RangeError("Invalid page configuration");
    for (const page of pages) if (!/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(page)) throw new Error(`Invalid page: ${page}`);
    this.pages = new Set(pages);
    this.limit = privateLimit;
    this.entries = [this.page(entry, {})];
  }
  private limit: number;
  private page(path: string, query: Record<string, string>): PageEntry {
    if (!this.pages.has(path)) throw new Error(`Undeclared page: ${path}`);
    checkedPageQuery(path, query);
    return Object.freeze({ path, query: Object.freeze({ ...query }) });
  }
  get stack(): readonly PageEntry[] { return Object.freeze([...this.entries]); }
  get current(): PageEntry { return this.entries[this.entries.length - 1]; }
  subscribe(listener: (stack: readonly PageEntry[]) => void): () => void {
    if (typeof listener !== "function") throw new ServiceError("PROTOCOL", "Invalid navigation listener");
    if (!this.listeners.has(listener) && this.listeners.size >= this.maxListeners) throw new ServiceError("BUSY", "Too many navigation listeners");
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private changed(): void { const stack = this.stack; for (const listener of [...this.listeners]) listener(stack); }
  push(path: string, query: Record<string, string> = {}): void {
    if (this.entries.length >= this.limit) throw new Error("Page stack limit reached");
    this.entries.push(this.page(path, query)); this.changed();
  }
  replace(path: string, query: Record<string, string> = {}): void { this.entries[this.entries.length - 1] = this.page(path, query); this.changed(); }
  /** A cold launch starts at the requested declared page with an empty back stack. */
  reset(path: string, query: Record<string,string> = {}): void { const page=this.page(path,query);this.entries=[page];this.changed(); }
  back(): boolean {
    if (this.entries.length <= 1) return false;
    this.entries.pop(); this.changed(); return true;
  }
}
