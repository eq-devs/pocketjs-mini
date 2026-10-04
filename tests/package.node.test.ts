import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { signPackage, verifyPackage, authorizeUrl, authorizePermission, canonical, type PackageMetadata } from "../container/package.ts";
const keys = generateKeyPairSync("ed25519");
const metadata: PackageMetadata = { appId: "com.example.todo", version: "1.0.0", minHostAbi: 7, entry: "main.pocket", pages: ["/", "/detail"], permissions: ["media"], domains: ["api.example.com"], targets: ["pjm-ios", "pjm-android"] };
const payload = Buffer.from("package fixture"), host = { abi: 7, target: "pjm-android" as const };
test("Ed25519 authenticates both package bytes and all capability metadata", () => {
  const manifest = signPackage(payload, metadata, keys.privateKey);
  assert.deepEqual(verifyPackage(payload, manifest, keys.publicKey, host), manifest);
  assert.throws(() => verifyPackage(Buffer.from("tampered"), manifest, keys.publicKey, host), /SHA-256/);
  for (const patch of [{ appId: "com.attacker.app" }, { version: "2.0.0" }, { domains: ["attacker.example.com"] }, { permissions: ["media", "location"] }, { pages: ["/", "/evil"] }, { targets: ["pjm-android"] }, { minHostAbi: 1 }])
    assert.throws(() => verifyPackage(payload, { ...manifest, ...patch }, keys.publicKey, host), /signature/);
  assert.throws(() => verifyPackage(payload, manifest, generateKeyPairSync("ed25519").publicKey, host), /signature/);
  assert.throws(() => verifyPackage(payload, manifest, keys.publicKey, { ...host, abi: 6 }), /Upgrade/);
  const ios = signPackage(payload, { ...metadata, targets: ["pjm-ios"] }, keys.privateKey);
  assert.throws(() => verifyPackage(payload, ios, keys.publicKey, host), /target/);
});
test("manifest rejects traversal, wildcard domains, unknown fields and unsupported permissions", () => {
  for (const patch of [{ appId: "../escape" }, { version: "1".repeat(65) + ".0.0" }, { entry: "../main.pocket" }, { pages: ["/", "/../"] }, { domains: ["*.example.com"] }, { permissions: ["root"] }])
    assert.throws(() => signPackage(payload, { ...metadata, ...patch } as PackageMetadata, keys.privateKey));
  const signed = signPackage(payload, metadata, keys.privateKey);
  assert.throws(() => verifyPackage(payload, { ...signed, extra: true }, keys.publicKey, host), /fields/);
  assert.equal(canonical({ b: 1, a: [2, 3] }), '{"a":[2,3],"b":1}');
});
test("network and permission gates distinguish app declarations from host approval", () => {
  assert.equal(authorizeUrl(metadata, "https://api.example.com/items").hostname, "api.example.com");
  for (const address of ["http://api.example.com/", "https://api.example.com.evil.com/", "https://sub.api.example.com/", "https://user@api.example.com/", "https://api.example.com:8080/"])
    assert.throws(() => authorizeUrl(metadata, address), /denied/);
  assert.throws(() => authorizePermission(metadata, "location", true), /not declared/);
  assert.throws(() => authorizePermission(metadata, "media", false), /denied/);
  authorizePermission(metadata, "media", true);
});
