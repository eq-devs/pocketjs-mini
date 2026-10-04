import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { androidSdk } from "../bin/android.ts";

const root = resolve(import.meta.dir, ".."), serial = Bun.argv[2];
if (!serial || !/^[a-zA-Z0-9_.:-]+$/.test(serial)) throw new Error("Usage: bun tests/android-smoke.ts <adb-serial>");
const artifacts = resolve(process.env.PJM_ANDROID_RESULTS ?? join(root, "build/android-validation", String(Date.now())));
mkdirSync(artifacts, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), "pjm-android-smoke-")), project = join(temp, "acceptance");
const upstream = resolve(process.env.PJM_TEST_UPSTREAM ?? join(root, "examples/hello/.pjm/pocketjs"));
const env = { ...process.env, PJM_NATIVE_TEST: "1", PJM_ANDROID_TEST: "1" };
const adb = (...args: string[]) => [join(androidSdk(), "platform-tools/adb"), "-s", serial, ...args];
let hostExit: number | undefined, hostLogs: Promise<[string, string]> | undefined, shuttingDown = false;
async function command(args: string[], cwd = temp, binary = false) {
  const child = Bun.spawn(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
    const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).arrayBuffer(), new Response(child.stderr).text()]);
    if (code) throw new Error(`${args[0]} failed (${code}): ${error}`);
    return binary ? Buffer.from(output) : Buffer.from(output).toString("utf8").trim();
  } finally { clearTimeout(timer); }
}
async function until<T>(read: () => Promise<T>, accepted: (value: T) => boolean, timeout = 120000): Promise<T> {
  const end = Date.now() + timeout; let last: unknown;
  while (Date.now() < end) {
    if (hostExit !== undefined && !shuttingDown) {
      const logs = hostLogs ? await hostLogs : [];
      throw new Error(`Native host exited (${hostExit}): ${logs.join("\n").slice(-4000)}`);
    }
    try { const value = await read(); if (accepted(value)) return value; last = value; } catch (error) { last = String(error); }
    await Bun.sleep(300);
  }
  throw new Error(`Android acceptance timed out: ${JSON.stringify(last)}`);
}
await command([join(root, "bin/pjm"), "create", "acceptance"]);
mkdirSync(join(project, ".pjm"));
if (existsSync(join(upstream, ".git"))) symlinkSync(upstream, join(project, ".pjm/pocketjs"), "dir");
const sourcePath = join(project, "app/main.tsx");
const fixture = readFileSync(sourcePath, "utf8").replace("onPress={() => setCount(count() + 1)}",
  'onPress={() => { setCount(count() + 1); (globalThis as any).ui.svcSend(JSON.stringify({v:1,id:1000+count(),kind:"test.report.v1",args:{value:count()}})); }}');
assert.ok(fixture.includes('kind:"test.report.v1"'));
writeFileSync(sourcePath, fixture);
const child = Bun.spawn([join(root, "bin/pjm"), "run", "--device", "android", "-d", serial], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
const streams = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
hostLogs = streams;void child.exited.then(code => {hostExit=code;});
type Receipt = { session: string; revision: number; frames: number; touches: number; width: number; height: number; density: number; top: number; left: number; actions: number; value: number; hash: number };
let expectedSession: string | undefined;
const receipt = async () => {
  const record = JSON.parse(await command(adb("shell", "run-as", "dev.pjm.android", "cat", "files/pjm-receipt.json")) as string) as Receipt;
  if (record.session !== expectedSession) throw new Error("Stale native receipt from a different session");
  return record;
};
const status = async () => await command(adb("shell", "run-as", "dev.pjm.android", "cat", "files/pjm-status.txt")) as string;
const screenshot = async (name: string) => writeFileSync(join(artifacts, name + ".png"), await command(adb("exec-out", "screencap", "-p"), temp, true));
let rotation: string | undefined, automatic: string | undefined;
const evidence: Record<string, unknown> = { serial, upstream, project };
try {
  const session = await until(async () => JSON.parse(readFileSync(join(project, "build/session.json"), "utf8")), value => !!value.url);
  expectedSession = session.url; evidence.url = session.url;
  const state = async () => await (await fetch(`${session.url}state`)).json() as { revision: number; error: string | null };
  const start = await until(receipt, value => value.revision > 0 && value.frames >= 30 && value.hash > 0 && value.actions === 0);
  console.log("Android: real GPU pixels and frames verified");
  evidence.start = start; await screenshot("portrait");
  await command(adb("shell", "input", "tap", String(Math.floor((start.left + start.width / 2) * start.density)), String(Math.floor((start.top + start.height / 2) * start.density))));
  const tapped = await until(receipt, value => value.revision === start.revision && value.actions >= 1 && value.value === 1 && value.hash !== start.hash && value.hash > 0);
  evidence.tapped = tapped; await screenshot("tap");
  console.log("Android: native tap changed guest action and pixels");
  await command(adb("shell","input","keyevent","KEYCODE_HOME"));
  await Bun.sleep(500);
  const background=await receipt();await Bun.sleep(1000);
  const frozen=await receipt();assert.equal(frozen.frames,background.frames,"Guest continued publishing frames in background");
  await command(adb("shell","am","start","-W","-f","0x00020000","-n","dev.pjm.android/.MiniActivity","--es","pjm-url",session.url,"--ez","pjm-test","true"));
  const resumed=await until(receipt,value=>value.revision===tapped.revision && value.frames>tapped.frames && value.actions===tapped.actions && value.value===1 && value.hash===tapped.hash);
  evidence.lifecycle={background,frozen,resumed};
  console.log("Android: background freeze and same-guest resume verified");
  await command(adb("shell","am","start","-W","-f","0x18000000","-n","dev.pjm.android/.MiniActivity","--es","pjm-url",session.url,"--ez","pjm-test","true"));
  const secondHost=await until(receipt,value=>value.revision===start.revision && value.frames>=30 && value.actions===0 && value.value===0 && value.hash===start.hash);
  await command(adb("shell","input","keyevent","KEYCODE_BACK"));
  const firstHostAgain=await until(receipt,value=>value.revision===tapped.revision && value.frames>resumed.frames && value.actions===tapped.actions && value.value===1 && value.hash===tapped.hash);
  evidence.hostIsolation={secondHost,firstHostAgain};
  console.log("Android: second Activity teardown preserved the first guest");

  await command(adb("shell","input","keyevent","KEYCODE_BACK"));
  await command(adb("shell","am","start","-W","-n","dev.pjm.android/.MiniActivity","--es","pjm-url",session.url,"--ez","pjm-test","true"));
  const relaunched=await until(receipt,value=>value.revision===start.revision && value.frames>=30 && value.actions===0 && value.value===0 && value.hash===start.hash);
  evidence.finishRelaunch=relaunched;
  console.log("Android: Activity finish released its engine and cold relaunch succeeded");


  const mutate = async (action: string) => { const response = await fetch(`${session.url}test/${action}`, { method: "POST" }); assert.equal(response.status, 200); };
  await mutate("saved");
  const saved = await until(receipt, value => value.revision > tapped.revision && value.frames >= 30 && value.value === 0 && value.hash !== start.hash && value.hash > 0);
  evidence.saved = saved; await screenshot("saved");
  await mutate("compile-error");
  await until(state, value => !!value.error?.includes("TS"));
  await until(status, value => value.includes("TS")); await screenshot("compile-error");
  await mutate("runtime-error");
  await until(status, value => value.includes("Intentional guest failure")); await screenshot("runtime-error");
  const failed = await state();
  await mutate("restore");
  const recovered = await until(receipt, value => value.revision > failed.revision && value.frames >= 30 && value.hash === start.hash);
  await until(status, value => value === ""); evidence.recovered = recovered;
  console.log("Android: saved source, compile/runtime errors and recovery verified");
  await mutate("native-services");
  const nativeServices = await until(receipt, value => value.revision > recovered.revision && value.frames >= 30 && value.actions >= 1 && value.value === 7);
  evidence.nativeServices = nativeServices;
  await mutate("restore");
  await until(receipt, value => value.revision > nativeServices.revision && value.frames >= 30 && value.hash === start.hash);
  console.log("Android: native device service, version rejection and protocol errors verified");
  await mutate("sdk-services");
  const sdkServices=await until(receipt,value=>value.revision>nativeServices.revision && value.frames>=30 && value.actions>=2 && value.value===31);
  evidence.sdkServices=sdkServices;
  await mutate("restore");
  await until(receipt,value=>value.revision>sdkServices.revision && value.frames>=30 && value.hash===start.hash);
  console.log("Android: bundled SDK device request, Promise errors, frame timers and navigation verified");
  await mutate("sdk-lifecycle");
  const launched=await until(receipt,value=>value.revision>sdkServices.revision && value.frames>=30 && value.value===3);
  await command(adb("shell","input","keyevent","KEYCODE_HOME"));
  await Bun.sleep(1000);
  await command(adb("shell","am","start","-W","-f","0x00020000","-n","dev.pjm.android/.MiniActivity"));
  const lifecycleShown=await until(receipt,value=>value.revision===launched.revision && value.value===7);
  await command(adb("shell","am","send-trim-memory","dev.pjm.android","RUNNING_LOW"));
  const memoryWarning=await until(receipt,value=>value.revision===launched.revision && value.value===15);
  evidence.sdkLifecycle={launched,lifecycleShown,memoryWarning};
  console.log("Android: SDK launch/show/hide ordering and OS memory warning verified");
  await mutate("restore");
  await until(receipt,value=>value.revision>memoryWarning.revision && value.frames>=30 && value.hash===start.hash);
  await mutate("unload-storage");
  const cleanupWriter=await until(receipt,value=>value.revision>memoryWarning.revision && value.value===127);
  await mutate("unload-read");
  const cleanupReader=await until(receipt,value=>value.revision>cleanupWriter.revision && value.value===127);
  evidence.unloadStorage={cleanupWriter,cleanupReader};
  console.log("Android: unload storage effect committed before guest replacement");
  await mutate("restore");
  await until(receipt,value=>value.revision>cleanupReader.revision && value.frames>=30 && value.hash===start.hash);
  let storageRevision=cleanupReader.revision;
  for(const action of ["storage-write","storage-isolation","storage-read","storage-empty"]) {
    if(action==="storage-isolation") {
      const miniPath=join(project,"mini.json"),original=readFileSync(miniPath,"utf8");
      writeFileSync(miniPath,JSON.stringify({...JSON.parse(original),appId:"dev.pjm.other"}));
      await mutate("storage-empty");
      const isolated=await until(receipt,value=>value.revision>storageRevision && value.frames>=30 && value.actions>=1 && value.value===63);
      evidence[action]=isolated;storageRevision=isolated.revision;writeFileSync(miniPath,original);
      // Commit the original identity again before reading its persisted value.
      const restoredIdentity=await until(receipt,value=>value.revision>storageRevision && value.frames>=30 && value.actions>=1 && value.value===-1);
      storageRevision=restoredIdentity.revision;continue;
    }
    await mutate(action);
    const stored=await until(receipt,value=>value.revision>storageRevision && value.frames>=30 && value.actions>=1 && value.value===63);
    evidence[action]=stored;storageRevision=stored.revision;
  }
  console.log("Android: native storage quotas, opaque keys, guest restart persistence and removal verified");
  for (const [action, error] of [["boot-loop", /interrupted/i], ["frame-loop", /interrupted/i], ["job-loop", /deadline exceeded|interrupted/i], ["heap-limit", /out of memory/i]] as const) {
    const began = Date.now();
    await mutate(action);
    const failure = await until(status, value => error.test(value), 20000);
    const elapsed = Date.now() - began;
    const rejected = await state();
    await mutate("restore");
    await until(receipt, value => value.revision > rejected.revision && value.frames >= 30 && value.hash === start.hash);
    await until(status, value => value === "");
    evidence[action] = { failure, elapsed, recovered: true };
  }
  console.log("Android: boot/frame/Promise loop interruption and guest heap limits verified with recovery");
  automatic = await command(adb("shell", "settings", "get", "system", "accelerometer_rotation")) as string;
  rotation = await command(adb("shell", "settings", "get", "system", "user_rotation")) as string;
  await command(adb("shell", "settings", "put", "system", "accelerometer_rotation", "0"));
  await command(adb("shell", "settings", "put", "system", "user_rotation", "1"));
  const landscape = await until(receipt, value => value.revision > recovered.revision && value.width > value.height && value.frames >= 30 && value.hash > 0);
  evidence.landscape = landscape; await screenshot("landscape");
  console.log("Android: landscape viewport and pixels verified");
  await command([join(root, "bin/pjm"), "create", "second"]);
  const second = join(temp, "second");mkdirSync(join(second, ".pjm"));
  if (existsSync(join(upstream, ".git"))) symlinkSync(upstream, join(second, ".pjm/pocketjs"), "dir");
  const duplicate = Bun.spawn([join(root, "bin/pjm"), "run", "--device", "android", "-d", serial], { cwd: second, env, stdout: "ignore", stderr: "pipe" });
  const [duplicateCode, duplicateError] = await Promise.all([duplicate.exited, new Response(duplicate.stderr).text()]);
  assert.notEqual(duplicateCode, 0);assert.match(duplicateError, /already has an active/);
  evidence.result = "passed";
} catch (error) { evidence.result = "failed"; evidence.error = String(error); throw error; }
finally {
  shuttingDown = true;
  for (const [key, value] of [["user_rotation", rotation], ["accelerometer_rotation", automatic]] as const) if (value !== undefined) {
    try { await command(adb("shell", "settings", value === "null" ? "delete" : "put", "system", key, ...(value === "null" ? [] : [value]))); } catch (error) { evidence.restoreError = String(error); }
  }
  child.kill("SIGINT");
  const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
  await child.exited; clearTimeout(timer);
  const [out, error] = await streams;
  writeFileSync(join(artifacts, "host.log"), out + error);
  writeFileSync(join(artifacts, "evidence.json"), JSON.stringify(evidence, null, 2));
  assert.equal(existsSync(join(project, "build/session.json")), false, "Session lock remains after shutdown");
  const remaining = await command(adb("reverse", "--list")) as string;
  if (expectedSession) assert.ok(!remaining.split(/\s+/).includes(`tcp:${new URL(expectedSession).port}`), "Session USB forward remains after shutdown");
  assert.equal(evidence.restoreError, undefined, "Could not restore rotation settings");
  console.log(`Android ${evidence.result}. Evidence: ${artifacts}`);
}
