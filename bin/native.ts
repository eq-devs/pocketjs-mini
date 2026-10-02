import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, lstatSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { writeNativeProject } from "./native-project.ts";

type Child = ReturnType<typeof Bun.spawn>;
interface Options { root: string; upstream: string; device: string; url: string;
  cleanup: (callback: () => Promise<void>) => void;
  stopping: () => boolean; child: (child: Child | undefined) => void; stopped: (status?: number) => void; }
export async function launchNative(options: Options) {
  async function run(args: string[], capture = false, timeout = 600000) {
    if (options.stopping()) throw new Error("Session stopped");
    const child = Bun.spawn(args, { stdout: capture ? "pipe" : "inherit", stderr: capture ? "pipe" : "inherit", detached: true, env: { ...process.env, IPHONEOS_DEPLOYMENT_TARGET: "16.0" } });
    options.child(child);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }, timeout);
    const [code, stdout, stderr] = await Promise.all([child.exited,
      capture ? new Response(child.stdout).text() : Promise.resolve(""),
      capture ? new Response(child.stderr).text() : Promise.resolve("")]);
    clearTimeout(timer); options.child(undefined);
    if (code !== 0 || timedOut) throw new Error(`${args[0]} failed${timedOut ? " (timeout)" : ` (${code})`}: ${stderr}`);
    return stdout;
  }
  const inventory = JSON.parse(await run(["xcrun", "simctl", "list", "devices", "available", "-j"], true));
  const phones: any[] = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes(".iOS-")).flatMap(([, devices]) => devices as any[]).filter(d => d.name.startsWith("iPhone"));
  const device = options.device ? phones.find(d => d.udid === options.device || d.name === options.device)
    : phones.find(d => d.state === "Booted") ?? phones[phones.length - 1];
  if (!device) throw new Error("No available iPhone simulator matches the requested device. Install an iOS runtime in Xcode.");
  const lock = join(tmpdir(), `pjm-simulator-${device.udid}.json`);
  if (existsSync(lock)) {
    if (lstatSync(lock).isSymbolicLink()) throw new Error("Simulator session lock must not be a symlink");
    const previous = JSON.parse(readFileSync(lock, "utf8"));
    let live = false; try { process.kill(previous.pid, 0); live = true; } catch {}
    if (live) throw new Error(`${device.name} already has an active pjm run session`);
    rmSync(lock);
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  let launched = false;
  options.cleanup(async () => {
    if (launched) {
      const child = Bun.spawn(["xcrun", "simctl", "terminate", device.udid, "dev.pjm.host"], { stdout: "ignore", stderr: "ignore" });
      await child.exited;
    }
    if (existsSync(lock) && JSON.parse(readFileSync(lock, "utf8")).pid === process.pid) rmSync(lock);
  });
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const target = arch === "aarch64" ? "aarch64-apple-ios-sim" : "x86_64-apple-ios";
  const installed = await run(["rustup", "target", "list", "--installed", "--toolchain", "stable"], true);
  if (!installed.split("\n").includes(target)) await run(["rustup", "target", "add", "--toolchain", "stable", target]);
  await run(["cargo", "+stable", "build", "--release", "--locked", "--manifest-path", join(options.upstream, "engine/Cargo.toml"), "-p", "pocket-apple", "--target", target]);
  const directory = resolve(".pjm/native");
  mkdirSync(directory, { recursive: true });
  cpSync(join(options.root, "host/ios"), directory, { recursive: true });
  const library = join(options.upstream, "engine/target", target, "release/libpocket_apple.a");
  writeNativeProject(directory, options.upstream, library, options.url, process.env.PJM_NATIVE_TEST === "1");
  if (device.state !== "Booted") await run(["xcrun", "simctl", "boot", device.udid], true, 30000);
  await run(["xcrun", "simctl", "bootstatus", device.udid, "-b"], false, 180000);
  const derived = join(directory, "DerivedData");
  const action = process.env.PJM_NATIVE_TEST === "1" ? "test" : "build";
  const result = action === "test" ? resolve(process.env.PJM_TEST_RESULTS ?? join(directory, `TestResults-${Date.now()}.xcresult`)) : undefined;
  const resultArgs = result ? ["-resultBundlePath", result] : [];
  if (action === "test") launched = true;
  await run(["xcodebuild", "-quiet", "-project", join(directory, "Mini.xcodeproj"), "-scheme", "Mini", "-configuration", "Debug",
    "-destination", `platform=iOS Simulator,id=${device.udid}`, "-derivedDataPath", derived,
    "-parallel-testing-enabled", "NO", "CODE_SIGNING_ALLOWED=NO", ...resultArgs, action], false, action === "test" ? 900000 : 600000);
  if (action === "test") { options.stopped(); return; }
  await run(["open", "-a", "Simulator", "--args", "-CurrentDeviceUDID", device.udid], true, 30000);
  await run(["xcrun", "simctl", "install", device.udid, join(derived, "Build/Products/Debug-iphonesimulator/Mini.app")]);
  launched = true;
  const child = Bun.spawn(["xcrun", "simctl", "launch", "--terminate-running-process", "--console-pty", device.udid, "dev.pjm.host", "--pjm-url", options.url], { stdout: "inherit", stderr: "inherit", detached: true });
  options.child(child);
  console.log(`Running native PocketJS on ${device.name}. Save TSX to reload; Ctrl+C stops the session.`);
  const status = await child.exited; options.child(undefined); options.stopped(status);
}
