import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes, createPrivateKey, createPublicKey } from "node:crypto";
import { compileApplication } from "./compiler.ts";
import { defaultWindow, readWindow } from "./profile.ts";
import { signPackage, verifyPackage } from "../container/package.ts";

const [upstream, command, platform, ...args] = Bun.argv.slice(2);
if (!upstream || !["build", "check"].includes(command) || !["ios", "android"].includes(platform)) throw new Error("Invalid build invocation");
let release = false, explicitKey = false, keyPath = command === "build" ? process.env.PJM_SIGNING_KEY : undefined, window = { ...defaultWindow };
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--release") release = true;
  else if (["--key", "--width", "--height", "--density"].includes(arg) && args[index + 1]) {
    const value = args[++index];
    if (arg === "--key") {keyPath = resolve(value);explicitKey=true;}
    else window = { ...window, [arg.slice(2)]: Number(value) };
  } else throw new Error(`Unknown or incomplete build option: ${arg}`);
}
window = readWindow(window);
if (command === "check" && (release || keyPath)) throw new Error("Signing options belong to build --release");
if (explicitKey && !release) throw new Error("Use --release when providing a signing key");
if (release && !keyPath) throw new Error("Release signing requires --key <Ed25519-private-key.pem> or PJM_SIGNING_KEY");
if (existsSync("build/session.json")) {
  const session = JSON.parse(readFileSync("build/session.json", "utf8"));
  let live = false;try {process.kill(session.pid, 0);live=true;} catch {}
  if (live) throw new Error("Stop the active run before building/checking this project");
}
const staging = resolve(`build/.${command}-${randomBytes(12).toString("hex")}`);
let compilerChild: ReturnType<typeof Bun.spawn> | undefined;
let cancelled = false;
const stop = () => {cancelled=true;if (compilerChild) {try {process.kill(-compilerChild.pid, "SIGTERM");} catch {compilerChild.kill();}} };
process.on("SIGINT", stop);process.on("SIGTERM", stop);
try {
  // Read and validate signing before any compilation or output replacement.
  const key = release ? createPrivateKey(readFileSync(keyPath!, "utf8")) : undefined;
  if (key && key.asymmetricKeyType !== "ed25519") throw new Error("Release signing requires an Ed25519 private key");
  const result = await compileApplication({ upstream, project: process.cwd(), directory: staging, window,
    platform: platform as "ios" | "android", child: child => {compilerChild=child;if(child && cancelled)stop();} });
  if (cancelled) throw new Error("Build cancelled");
  const metadata = result.metadata;
  if (command === "check") { console.log(`Checked ${result.name}: types, manifest, styles, assets and container declarations (${platform})`); }
  else if (key) {
    const signed = signPackage(result.packed, metadata, key);
    const publicKey = createPublicKey(key.export({ format: "pem", type: "pkcs8" }));
    verifyPackage(result.packed, signed, publicKey, { abi: result.plan.target.hostAbi, target: result.plan.target.id });
    const destination = resolve(`build/${result.name}-${platform}.release`);
    if (existsSync(destination)) throw new Error(`Release output already exists: ${destination}. Move it aside before creating a new release`);
    writeFileSync(join(staging, "main.pocket"), result.packed);
    writeFileSync(join(staging, "manifest.json"), JSON.stringify(signed, null, 2));
    for (const file of readdirSync(staging)) if (!["main.pocket", "manifest.json"].includes(file)) rmSync(join(staging, file), {recursive:true,force:true});
    renameSync(staging, destination);
    console.log(`Signed release: ${destination}`);
  } else {
    mkdirSync("build", { recursive: true });
    const temp = join(staging, `${result.name}.pocket`);writeFileSync(temp, result.packed);
    renameSync(temp, resolve(`build/${result.name}.pocket`));
    console.log(`Built build/${result.name}.pocket (${platform}, development artifact)`);
  }
} finally {
  process.off("SIGINT", stop);process.off("SIGTERM", stop);
  rmSync(staging, { recursive: true, force: true });
}
