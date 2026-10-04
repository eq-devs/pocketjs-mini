import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { signPackage } from "../container/package.ts";
const keys = generateKeyPairSync("ed25519"), payload = Buffer.from("native verification fixture");
const manifest = signPackage(payload, { appId: "dev.pjm.fixture", version: "1.0.0", minHostAbi: 7, entry: "main.pocket", pages: ["/", "/detail"], permissions: ["media"], domains: ["example.com"], targets: ["pjm-ios"] }, keys.privateKey);
const key = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
const base = { payload: payload.toString("base64"), manifest, key, abi: 7, target: "pjm-ios", valid: false };
const cases = [
  { ...base, valid: true },
  { ...base, payload: Buffer.from("tampered").toString("base64") },
  { ...base, abi: 6 }, { ...base, target: "pjm-android" },
  { ...base, key: Buffer.alloc(32).toString("base64") },
  ...[{ appId: "dev.other.app" }, { pages: ["/", "/other"] }, { extra: true }, { minHostAbi: true }, { domains: ["*.example.com"] }, { signature: "invalid" }].map(patch => ({ ...base, manifest: { ...manifest, ...patch } })),
];
writeFileSync(process.argv[2], JSON.stringify(cases));
