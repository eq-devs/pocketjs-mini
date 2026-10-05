import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import {strictJson} from './strict-json.ts';

export interface PackageMetadata {
  appId: string; version: string; minHostAbi: number; entry: "main.pocket";
  pages: string[]; permissions: string[]; domains: string[]; targets: Array<"pjm-ios" | "pjm-android">;
}
export interface SignedManifest extends PackageMetadata { format: 1; sha256: string; signature: string; }
export const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const permissions = new Set(["clipboard.read", "media", "location"]);
export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key])).join(",") + "}";
  throw new Error("Manifest must contain JSON values");
}
export function validatePackageMetadata(value: any): asserts value is PackageMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid container manifest");
  if (typeof value.appId !== "string" || value.appId.length > 128 || !/^[a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z][a-zA-Z0-9_-]*)+$/.test(value.appId)) throw new Error("Invalid appId");
  if (typeof value.version !== "string" || value.version.length > 64 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version)) throw new Error("Release version must be numeric semver (maximum 64 characters)");
  if (!Number.isSafeInteger(value.minHostAbi) || value.minHostAbi < 1 || value.entry !== "main.pocket") throw new Error("Invalid package ABI or entry");
  const strings = (list: unknown, max: number): list is string[] => Array.isArray(list) && list.length <= max && list.every(item => typeof item === "string") && new Set(list).size === list.length;
  if (!strings(value.pages, 128) || !value.pages.length || !value.pages.includes("/") || value.pages.some((page: string) => !/^\/(?:[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)?$/.test(page))) throw new Error("Invalid declared pages");
  if (!strings(value.permissions, 16) || value.permissions.some((permission: string) => !permissions.has(permission))) throw new Error("Invalid declared permissions");
  if (!strings(value.domains, 128) || value.domains.some((domain: string) => domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain) || domain.split(".").some(part => part.length > 63))) throw new Error("Domains must be exact lowercase DNS names");
  if (!strings(value.targets, 2) || !value.targets.length || value.targets.some((target: string) => !["pjm-ios", "pjm-android"].includes(target))) throw new Error("Invalid package targets");
}
function unsigned(manifest: SignedManifest) {
  const { signature, ...body } = manifest;
  return Buffer.from(canonical(body), "utf8");
}
function checkPayload(payload: Uint8Array): void { if (!payload.length || payload.length > MAX_PACKAGE_BYTES) throw new Error("Package size outside 1..64 MiB"); }
export function signPackage(payload: Uint8Array, metadata: PackageMetadata, privateKey: KeyObject | string): SignedManifest {
  validatePackageMetadata(metadata); checkPayload(payload);
  const key = typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") throw new Error("Release signing requires an Ed25519 private key");
  // Copy through JSON so caller-owned arrays cannot mutate the returned envelope.
  const manifest: SignedManifest = { ...JSON.parse(canonical(metadata)), format: 1, sha256: createHash("sha256").update(payload).digest("hex"), signature: "" };
  manifest.signature = sign(null, unsigned(manifest), key).toString("base64");
  return manifest;
}
export function verifyPackage(payload: Uint8Array, candidate: unknown, publicKey: KeyObject | string,
  host: { abi: number; target: "pjm-ios" | "pjm-android" }): SignedManifest {
  checkPayload(payload);
  // Read caller-owned metadata once; all checks and the return value use this copy.
  const encoded=Buffer.from(canonical(candidate),'utf8');
  if(encoded.length>65536)throw new Error('Signed package envelope exceeds size limit');
  const manifest=strictJson(encoded) as SignedManifest;
  validatePackageMetadata(manifest);
  const keys = Object.keys(manifest).sort().join(",");
  if (keys !== "appId,domains,entry,format,minHostAbi,pages,permissions,sha256,signature,targets,version") throw new Error("Unknown or missing container manifest fields");
  if (manifest.format !== 1 || typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256) || typeof manifest.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(manifest.signature)) throw new Error("Invalid signed package envelope");
  const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("Package verification requires a trusted Ed25519 public key");
  if (createHash("sha256").update(payload).digest("hex") !== manifest.sha256) throw new Error("Package SHA-256 mismatch");
  if (!verify(null, unsigned(manifest), key, Buffer.from(manifest.signature, "base64"))) throw new Error("Publisher signature rejected");
  if (!Number.isSafeInteger(host.abi) || host.abi < manifest.minHostAbi) throw new Error("Upgrade the host: package requires a newer ABI");
  if (!manifest.targets.includes(host.target)) throw new Error("Package does not support this host target");
  return manifest;
}
/** Call on every URL, including redirects; native transport must apply this gate. */
export function authorizeUrl(manifest: PackageMetadata, address: string): URL {
  const url = new URL(address);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !manifest.domains.includes(url.hostname)) throw new Error("Request URL denied by package domain policy");
  return url;
}
export function authorizePermission(manifest: PackageMetadata, permission: string, hostGranted: boolean): void {
  if (!manifest.permissions.includes(permission)) throw new Error("Permission not declared by app");
  if (!hostGranted) throw new Error("Permission denied by host or OS");
}
