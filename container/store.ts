import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync } from "node:fs";
import { join, resolve, parse } from "node:path";
import { randomBytes, type KeyObject } from "node:crypto";
import { verifyPackage, canonical, MAX_PACKAGE_BYTES, type SignedManifest } from "./package.ts";

type Host = { abi: number; target: "pjm-ios" | "pjm-android" };
type State = { current?: string; previous?: string; pending?: string };
export interface InstalledPackage { manifest: SignedManifest; payload: Uint8Array; }
const slotPattern = /^\d+\.\d+\.\d+-[a-f0-9]{64}$/;
function appIdentity(appId: string): void {
  if (appId.length > 128 || !/^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+$/.test(appId)) throw new Error("Invalid appId");
}
/** Host-owned directory: guest code never receives or chooses filesystem paths.
 * This implementation is the desktop reference store; native hosts must use
 * equivalent atomic operations in their private application sandbox.
 */
export class PackageStore {
  readonly root: string;
  private readonly trustedKey: KeyObject | string;
  private readonly host: Host;
  constructor(root: string, trustedKey: KeyObject | string, host: Host) {
    this.trustedKey = trustedKey; this.host = { ...host };
    this.root = resolve(root);
    this.directory(this.root);
  }
  private directory(path: string): void {
    // Reject symlinks in every existing ancestor, including the configured root.
    let cursor = parse(path).root;
    for (const segment of path.slice(cursor.length).split(/[\\/]/).filter(Boolean)) {
      cursor = join(cursor, segment);
      try {
        const stat = lstatSync(cursor);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Package store path must be a real directory");
      } catch (error: any) {
        if (error.code !== "ENOENT") throw error;
        mkdirSync(cursor, { mode: 0o700 });
      }
    }
  }
  private app(appId: string): string {
    appIdentity(appId);
    const path = join(this.root, appId); this.directory(path); return path;
  }
  private regular(path: string, maximum: number): Buffer {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Package store file must be regular");
    if (stat.size > maximum) throw new Error("Package store file exceeds size limit");
    return readFileSync(path);
  }
  private state(path: string): State {
    let state: State;
    try { state = JSON.parse(this.regular(join(path, "state.json"), 2048).toString("utf8")); }
    catch (error: any) { if (error.code === "ENOENT") return {}; throw error; }
    if (!state || typeof state !== "object" || Array.isArray(state)
      || Object.keys(state).some(key => !["current", "previous", "pending"].includes(key))
      || Object.values(state).some(value => typeof value !== "string" || !slotPattern.test(value))) throw new Error("Invalid package store state");
    return state;
  }
  private commit(path: string, state: State): void {
    const temporary = join(path, `.state-${randomBytes(12).toString("hex")}`);
    try { writeFileSync(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 }); renameSync(temporary, join(path, "state.json")); }
    finally { rmSync(temporary, { force: true }); }
  }
  private locked<T>(path: string, operation: () => T): T {
    const lock = join(path, ".lock");
    try { mkdirSync(lock, { mode: 0o700 }); }
    catch (error: any) { if (error.code === "EEXIST") throw new Error("Package store is busy; interrupted locks require host recovery"); throw error; }
    try { return operation(); } finally { rmSync(lock, { recursive: true }); }
  }
  private load(path: string, slot: string, appId: string): InstalledPackage {
    if (!slotPattern.test(slot)) throw new Error("Invalid package slot");
    const folder = join(path, slot);
    const stat = lstatSync(folder);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Invalid package directory");
    const payload = this.regular(join(folder, "main.pocket"), MAX_PACKAGE_BYTES);
    const manifest = verifyPackage(payload, JSON.parse(this.regular(join(folder, "manifest.json"), 65536).toString("utf8")), this.trustedKey, this.host);
    if (manifest.appId !== appId || slot !== `${manifest.version}-${manifest.sha256}`) throw new Error("Package store identity mismatch");
    return { payload, manifest };
  }
  stage(payload: Uint8Array, candidate: unknown): SignedManifest {
    // Authenticate before creating any application directory or changing state.
    const manifest = verifyPackage(payload, candidate, this.trustedKey, this.host);
    const path = this.app(manifest.appId), slot = `${manifest.version}-${manifest.sha256}`;
    return this.locked(path, () => {
      const state = this.state(path), destination = join(path, slot);
      let exists = false;
      try { lstatSync(destination); exists = true; } catch (error: any) { if (error.code !== "ENOENT") throw error; }
      if (exists) {
        const installed = this.load(path, slot, manifest.appId);
        if (canonical(installed.manifest) !== canonical(manifest)) throw new Error("Package slot already has different signed metadata");
      }
      else {
        const temporary = join(path, `.install-${randomBytes(12).toString("hex")}`);
        mkdirSync(temporary, { mode: 0o700 });
        try {
          writeFileSync(join(temporary, "main.pocket"), payload, { flag: "wx", mode: 0o600 });
          writeFileSync(join(temporary, "manifest.json"), JSON.stringify(manifest), { flag: "wx", mode: 0o600 });
          renameSync(temporary, destination);
        } finally { rmSync(temporary, { force: true, recursive: true }); }
      }
      this.commit(path, { ...state, pending: slot });
      this.prune(path, { ...state, pending: slot });
      return manifest;
    });
  }
  /** Returned bytes are a snapshot: later staging never replaces a running guest. */
  coldStart(appId: string): InstalledPackage {
    const path = this.app(appId);
    return this.locked(path, () => {
      const state = this.state(path), slot = state.pending ?? state.current;
      if (!slot) throw new Error("Application is not installed");
      const installed = this.load(path, slot, appId);
      const next: State = slot === state.current ? { current: slot, previous: state.previous }
        : { current: slot, previous: state.current };
      this.commit(path, next); this.prune(path, next);
      return installed;
    });
  }
  rollback(appId: string): void {
    const path = this.app(appId);
    this.locked(path, () => {
      const state = this.state(path);
      if (!state.previous) throw new Error("No previous package available");
      this.load(path, state.previous, appId);
      // Rollback is also deferred until a cold start.
      this.commit(path, { ...state, pending: state.previous });
    });
  }
  discardUpdate(appId: string): void {
    const path = this.app(appId);
    this.locked(path, () => {
      const state = this.state(path);
      const next: State = { current: state.current, previous: state.previous };
      this.commit(path, next); this.prune(path, next);
    });
  }
  private prune(path: string, state: State): void {
    const retained = new Set(Object.values(state));
    for (const name of readdirSync(path)) if (slotPattern.test(name) && !retained.has(name)) rmSync(join(path, name), { recursive: true, force: true });
  }
  /** Host services map opaque keys inside this app-owned data directory. */
  dataRoot(appId: string): string {
    const path = join(this.app(appId), "data"); this.directory(path); return path;
  }
}
