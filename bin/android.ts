import {requireAndroidLaunch} from "./android-launch.ts";
import {androidHttpFiles} from "./android-http.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, lstatSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createHash } from "node:crypto";

export interface AndroidDevice { platform: "android"; id: string; name: string; host: string; }
export function parseAndroidDevices(text: string): Array<{ id: string; state: string; name: string }> {
  return text.split("\n").filter(line => line.trim() && !line.startsWith("List ") && !line.startsWith("*"))
    .map(line => { const [id, state, ...details] = line.trim().split(/\s+/); return {
      id, state, name: details.find(value => value.startsWith("model:"))?.slice(6).replaceAll("_", " ") ?? id,
    }; });
}
export function androidSdk(): string {
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(homedir(), process.platform === "darwin" ? "Library/Android/sdk" : "Android/Sdk");
}
export async function selectAndroid(requested = ""): Promise<AndroidDevice> {
  const adb = join(androidSdk(), "platform-tools/adb");
  if (!existsSync(adb)) throw new Error("Install Android SDK platform-tools and set ANDROID_HOME");
  const child = Bun.spawn([adb, "devices", "-l"], { stdout: "pipe", stderr: "pipe" });
  const [code, out, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (code) throw new Error(`Android device discovery failed: ${error}`);
  const all = parseAndroidDevices(out), matches = requested ? all.filter(device => device.id === requested || device.name === requested) : all.filter(device => device.state === "device");
  if (matches.length > 1) throw new Error("Multiple Android devices; select pjm run --device android -d <serial>");
  if (!matches.length) throw new Error("No connected Android device. Start an emulator or connect a phone with USB debugging enabled");
  const device = matches[0];
  if (device.state !== "device") throw new Error(`${device.name} is ${device.state}; unlock it and authorize USB debugging, then reconnect`);
  return { platform: "android", id: device.id, name: device.name, host: "127.0.0.1" };
}

type Child = ReturnType<typeof Bun.spawn>;
export async function launchAndroid(options: { root: string; upstream: string; device: AndroidDevice; url: string;
  stopping(): boolean; child(child: Child | undefined): void; cleanup(callback: () => Promise<void>): void; stopped(status?: number): void; }) {
  const sdk = androidSdk(), build = resolve(".pjm/android"), tools = join(sdk, "build-tools/36.0.0");
  const ndk = join(sdk, "ndk/28.2.13676358/toolchains/llvm/prebuilt", process.platform === "darwin" ? "darwin-x86_64" : "linux-x86_64", "bin");
  const clang = join(ndk, "aarch64-linux-android23-clang"), androidJar = join(sdk, "platforms/android-34/android.jar");
  const java = process.env.JAVA_HOME ?? (process.platform === "darwin" ? "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home" : "");
  for (const path of [clang, androidJar, join(tools, "aapt2"), join(tools, "d8"), join(java, "bin/javac")])
    if (!existsSync(path)) throw new Error(`Android toolchain missing: ${path}. Install API 34, build-tools 36.0.0, NDK 28.2.13676358 and JDK 17; set ANDROID_HOME/JAVA_HOME`);
  const env: NodeJS.ProcessEnv = { ...process.env, JAVA_HOME: java, CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER: clang };
  async function run(args: string[], cwd = process.cwd(), capture = false): Promise<string> {
    if (options.stopping()) throw new Error("Session stopped");
    const child = Bun.spawn(args, { cwd, env, detached: true, stdout: capture ? "pipe" : "inherit", stderr: "pipe" });
    options.child(child);
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill(); } }, 600000);
    try {
      const [code, out, error] = await Promise.all([child.exited, capture ? new Response(child.stdout).text() : Promise.resolve(""), new Response(child.stderr).text()]);
      if (code) throw new Error(`${args[0]} failed (${code}): ${error}`);
      return out;
    } finally { clearTimeout(timer); options.child(undefined); }
  }
  const adb = (...args: string[]) => [join(sdk, "platform-tools/adb"), "-s", options.device.id, ...args];
  const lock = join(tmpdir(), `pjm-android-${createHash("sha256").update(options.device.id).digest("hex").slice(0, 24)}.json`);
  if (existsSync(lock)) {
    if (lstatSync(lock).isSymbolicLink()) throw new Error("Device lock must not be a symlink");
    const previous = JSON.parse(readFileSync(lock, "utf8"));
    let live = false; try { process.kill(previous.pid, 0); live = true; } catch {}
    if (live) throw new Error(`${options.device.name} already has an active pjm run session`);
    rmSync(lock);
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: "wx" });
  const port = new URL(options.url).port;
  let forwarded = false, launched = false;
  options.cleanup(async () => {
    for (const args of [...(launched ? [adb("shell", "am", "force-stop", "dev.pjm.android")] : []), ...(forwarded ? [adb("reverse", "--remove", `tcp:${port}`)] : [])]) {
      const child = Bun.spawn(args, { stdout: "ignore", stderr: "ignore" }); await child.exited;
    }
    if (existsSync(lock) && JSON.parse(readFileSync(lock, "utf8")).pid === process.pid) rmSync(lock);
  });
  const abi = await run(adb("shell", "getprop", "ro.product.cpu.abilist"), undefined, true);
  if (!abi.includes("arm64-v8a")) throw new Error("This Android host currently requires an arm64 phone or emulator");
  mkdirSync(build, { recursive: true });
  const rustBuild = join(build, "rust");
  env.RUSTC = (await run(["rustup", "which", "--toolchain", "stable", "rustc"], undefined, true)).trim();
  env.CC_aarch64_linux_android=clang;env.AR_aarch64_linux_android=join(ndk,"llvm-ar");
  env.BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android=`--target=aarch64-linux-android23 --sysroot=${join(ndk,"../sysroot")}`;
  if(process.platform==="darwin")env.LIBCLANG_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib";
  env.RUSTFLAGS=[process.env.RUSTFLAGS,"-C link-arg=-Wl,-z,max-page-size=16384"].filter(Boolean).join(" ");
  await run(["rustup","run","stable","cargo","build","--release","--locked","--manifest-path",join(options.root,"core-ffi/Cargo.toml"),"--target","aarch64-linux-android","--target-dir",rustBuild]);
  const objects = join(build, "objects"), staging = join(build, "staging"), classes = join(build, "classes"), dex = join(build, "dex");
  for (const path of [objects, join(staging, "lib/arm64-v8a"), classes, dex]) mkdirSync(path, { recursive: true });
  const includes = ["engine/quickjs-c", "engine/ui-cabi/include", "contracts/generated", "hosts/shared", "hosts/blackberry-classic"].map(path => `-I${join(options.upstream, path)}`);
  const flags = ["-std=gnu11", "-O2", "-fPIC", "-fno-strict-aliasing", "-ffunction-sections", "-fdata-sections", `-I${join(options.root, "host/android")}`, ...includes, `-I${join(options.root,"core-ffi/include")}`];
  const compiled: string[] = [];
  async function compile(path: string, name: string, extra: string[] = []) {
    const output = join(objects, name + ".o");
    await run([clang, ...flags, ...extra, "-c", path, "-o", output]); compiled.push(output);
  }
  await compile(join(options.root,"host/android/runtime.c"),"mini_runtime",["-Wall","-Wextra","-Werror"]);
  await compile(join(options.root,"host/android/package_bridge.c"),"mini_package",["-Wall","-Wextra","-Werror"]);
  await compile(join(options.root,"host/android/pool_bridge.c"),"mini_pool",["-Wall","-Wextra","-Werror"]);
  await compile(join(options.root,"host/android/store_bridge.c"),"mini_store",["-Wall","-Wextra","-Werror"]);
  await run([clang, "-shared", "-Wl,--gc-sections", "-Wl,--exclude-libs,ALL", "-Wl,--no-undefined", "-Wl,-z,max-page-size=16384", ...compiled,
    join(rustBuild, "aarch64-linux-android/release/libmini_core_ffi.a"), "-o", join(staging, "lib/arm64-v8a/libpocketjs.so"), "-lEGL", "-lGLESv2", "-llog", "-ldl", "-lm"]);
  await run([join(java, "bin/javac"), "-encoding", "UTF-8", "-source", "8", "-target", "8", "-classpath", [androidJar,...Array.from(androidHttpFiles().files.keys()).filter(name=>name.endsWith(".jar")).map(name=>join(options.root,"vendor/android-http",name))].join(":"), "-d", classes, join(options.root, "host/android/MiniActivity.java"), join(options.root, "host/android/AppStorage.java"), join(options.root, "host/android/PackageVerifier.java"), join(options.root,"host/android/VerifiedPackage.java"),join(options.root,"host/android/VerifiedContainer.java"),join(options.root,"host/android/VerifiedPresenter.java"),join(options.root,"host/android/PackageStore.java"),join(options.root,"host/android/PackageFiles.java"),join(options.root,"host/android/BoundedJson.java"),join(options.root,"host/android/VerifiedHttp.java"),join(options.root,"host/android/ManagedResources.java")]);
  await run([join(java, "bin/jar"), "cf", join(build, "classes.jar"), "-C", classes, "."]);
  await run([join(tools, "d8"), "--min-api", "23", "--lib", androidJar, "--output", dex, join(build, "classes.jar"),...Array.from(androidHttpFiles().files.keys()).filter(name=>name.endsWith(".jar")).map(name=>join(options.root,"vendor/android-http",name))]);
  for(const name of readdirSync(dex))if(/^classes[0-9]*\.dex$/.test(name))cpSync(join(dex,name),join(staging,name));
  mkdirSync(join(staging,"assets"),{recursive:true});cpSync(join(options.root,"vendor/android-http/PublicSuffixDatabase.list"),join(staging,"assets/PublicSuffixDatabase.list"));
  const unsigned = join(build, "unsigned.apk"), aligned = join(build, "aligned.apk"), apk = join(build, "Mini.apk");
  await run([join(tools, "aapt2"), "link", "-o", unsigned, "--manifest", join(options.root, "host/android/AndroidManifest.xml"), "-I", androidJar]);
  await run(["zip", "-q", "-r", unsigned, ...readdirSync(dex).filter(name=>/^classes[0-9]*\.dex$/.test(name)), "lib", "assets"], staging);
  await run([join(tools, "zipalign"), "-f", "-P", "16", "4", unsigned, aligned]);
  // One SDK-owned key keeps the shared development container installable
  // when switching projects. Never uninstall an existing app to bypass signing.
  const key = resolve(process.env.PJM_ANDROID_KEYSTORE ?? join(options.root, ".pjm/android-signing/debug.jks"));
  mkdirSync(join(key, ".."), { recursive: true });
  if (!existsSync(key) && existsSync(join(build, "debug.jks"))) cpSync(join(build, "debug.jks"), key);
  if (!existsSync(key)) await run([join(java, "bin/keytool"), "-genkeypair", "-keystore", key, "-storepass", "android", "-keypass", "android", "-alias", "androiddebugkey", "-dname", "CN=PocketJS Mini Development", "-keyalg", "RSA", "-validity", "10000"]);
  await run([join(tools, "apksigner"), "sign", "--ks", key, "--ks-pass", "pass:android", "--out", apk, aligned]);
  await run([join(tools, "apksigner"), "verify", apk]);
  await run(adb("reverse", `tcp:${port}`, `tcp:${port}`)); forwarded = true;
  await run(adb("install", "-r", apk));
  const launchOutput=await run(adb("shell", "am", "start", "-W", "-S", "-n", "dev.pjm.android/.MiniActivity", "--es", "pjm-url", options.url,
    ...(process.env.PJM_ANDROID_TEST === "1" ? ["--ez", "pjm-test", "true"] : [])));requireAndroidLaunch(launchOutput); launched = true;
  console.log(`Running PocketJS on ${options.device.name}. Save TSX to restart; Ctrl+C stops the session.`);
  const child = Bun.spawn(adb("logcat", "-v", "brief", "PocketJS:V", "AndroidRuntime:E", "*:S"), { stdout: "inherit", stderr: "inherit", detached: true });
  options.child(child); const status = await child.exited; options.child(undefined); options.stopped(status);
}
