import { existsSync } from "node:fs";
import { join } from "node:path";
import { androidSdk, parseAndroidDevices } from "./android.ts";

const platform = Bun.argv[2] ?? "ios";
if (platform !== "ios" && platform !== "android") throw new Error("Choose ios or android");
type Check = { name: string; ok: boolean; detail: string; fix?: string };
async function probe(name: string, args: string[], fix: string): Promise<Check> {
  try {
    const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill(), 15000);
    try {
      const [code, out, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      return { name, ok: code === 0, detail: (code === 0 ? out : error).trim(), fix };
    } finally { clearTimeout(timer); }
  } catch (error) { return { name, ok: false, detail: String(error), fix }; }
}
const checks: Promise<Check>[] = [
  Promise.resolve({ name: "Bun 1.3.11", ok: Bun.version === "1.3.11", detail: Bun.version, fix: "Install Bun 1.3.11 to match the tested compiler runtime" }),
  probe("Git", ["git", "--version"], "Install Git and put it on PATH"),
];
if (platform === "ios") {
  checks.push(Promise.resolve({ name: "macOS", ok: process.platform === "darwin", detail: process.platform, fix: "iOS builds require macOS; select --device android on Linux" }));
  checks.push(probe("Xcode", ["xcodebuild", "-version"], "Install Xcode and select it with xcode-select"));
  checks.push(probe("Stable Rust", ["rustup", "run", "stable", "rustc", "--version"], "Install Rust with the stable toolchain"));
  checks.push(probe("Available iOS simulators", ["xcrun", "simctl", "list", "devices", "available"], "Install an iOS simulator runtime in Xcode"));
  checks.push(probe("Connected Apple devices", ["xcrun", "devicectl", "list", "devices"], "Connect and unlock an iPhone; enable Developer Mode and trust this computer"));
} else {
  const sdk = androidSdk(), java = process.env.JAVA_HOME ?? (process.platform === "darwin" ? "/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home" : "");
  checks.push(probe("Android Rust compiler", ["rustup", "run", "stable", "rustc", "--version"], "rustup toolchain install stable --profile minimal --target aarch64-linux-android"));
  checks.push(probe("JDK", [join(java, "bin/javac"), "-version"], "Install JDK 17 and set JAVA_HOME"));
  const files: Array<[string, string, string]> = [
    ["Android API 34", "platforms/android-34/android.jar", "platforms;android-34"],
    ["Android build-tools 35.0.0", "build-tools/35.0.0/aapt2", "build-tools;35.0.0"],
    ["Android NDK 28.2", `ndk/28.2.13676358/toolchains/llvm/prebuilt/${process.platform === "darwin" ? "darwin-x86_64" : "linux-x86_64"}/bin/aarch64-linux-android23-clang`, "ndk;28.2.13676358"],
  ];
  for (const [name, file, packageName] of files) {
    const path = join(sdk, file);
    checks.push(Promise.resolve({ name, ok: existsSync(path), detail: path, fix: `Install ${packageName} with Android SDK Manager and set ANDROID_HOME` }));
  }
  checks.push(probe("Android devices", [join(sdk, "platform-tools/adb"), "devices", "-l"], "Install platform-tools, enable USB debugging and authorize this computer").then(result => {
    if (result.ok && !parseAndroidDevices(result.detail).some(device => device.state === "device")) return { ...result, ok: false, detail: result.detail || "No connected device" };
    return result;
  }));
}
const results = await Promise.all(checks);
for (const check of results) {
  console.log(`${check.ok ? "OK" : "MISSING"} ${check.name}: ${check.detail}`);
  if (!check.ok && check.fix) console.log(`  ${check.fix}`);
}
if (results.some(check => !check.ok)) process.exitCode = 1;
