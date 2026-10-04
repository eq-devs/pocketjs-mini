// Official PocketJS compiler/package APIs + a native UIKit host.
import { defaultWindow, readWindow, type WindowInfo } from "./profile.ts";
import { compileApplication } from "./compiler.ts";
import { launchNative } from "./native.ts";
import { selectPhone } from "./devices.ts";
import { selectAndroid, launchAndroid } from "./android.ts";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { PackageMetadata } from "../container/package.ts";

const [upstream, device = "", requestedPlatform = "ios"] = Bun.argv.slice(2);
if (requestedPlatform !== "ios" && requestedPlatform !== "android") throw new Error("Platform must be ios or android");
const platform: "ios" | "android" = requestedPlatform;
const root = resolve(import.meta.dir, "..");
if (existsSync("build/session.json")) {
  let previous: { pid?: number } = {};
  try { previous = JSON.parse(readFileSync("build/session.json", "utf8")); } catch {}
  if (previous.pid && previous.pid !== process.pid) {
    let live = false;
    try { process.kill(previous.pid, 0); live = true; } catch {}
    if (live) throw new Error("This app is already running. Stop its pjm run session first.");
  }
  rmSync("build/session.json", { force: true });
}
let window: WindowInfo = { ...defaultWindow };
const originalSource = process.env.PJM_NATIVE_TEST === "1" ? readFileSync("app/main.tsx", "utf8") : "";

function fingerprint(): string {
  const hash = createHash("sha256");
  function add(path: string) {
    if (!existsSync(path)) { hash.update(`missing:${path}`); return; }
    if (lstatSync(path).isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isSymbolicLink()) add(join(path, entry.name));
      }
    } else { hash.update(path); hash.update(readFileSync(path)); }
  }
  for (const path of ["app", "assets", "pocket.json", "mini.json", "container.json", "tsconfig.json"]) add(path);
  hash.update(JSON.stringify(window));
  return hash.digest("hex");
}


let active = 0, sequence = 0, error: string | null = null;
let publishedWindow: WindowInfo = { ...defaultWindow };
let publishedMetadata: PackageMetadata | null = null;
let wanted = "", completed = "", compiling = false, stopping = false;
let compileChild: ReturnType<typeof Bun.spawn> | undefined;
let setupChild: ReturnType<typeof Bun.spawn> | undefined;
let hostCleanup: (() => Promise<void>) | undefined;
const token = randomBytes(24).toString("hex");
const phone = process.env.PJM_TEST_SERVER === "1" ? undefined : platform === "android" ? await selectAndroid(device) : await selectPhone(device);
const host = phone?.host ?? "127.0.0.1";
const server = Bun.serve({ hostname: host, port: Number(process.env.PJM_PORT ?? 0),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(`/${token}/`)) return new Response("Not found", { status: 404 });
    const route = path.slice(token.length + 2);
    if (process.env.PJM_NATIVE_TEST === "1" && route.startsWith("test/") && request.method === "POST") {
      const action = route.slice(5);
      const content = action === "saved" ? originalSource.replace("Hello PocketJS Mini", "Saved edit")
        : action === "compile-error" ? "this is not TypeScript"
        : action === "runtime-error" ? originalSource.replace("mount(() => <App />);", 'const failedOps=(globalThis as any).ui;if(failedOps.svcOpen?.("mini"))failedOps.svcSend(JSON.stringify({v:1,id:1,kind:"storage.set.v1",args:{key:"failed-boot",value:1}})+"\\n");\nthrow new Error("Intentional guest failure");\nmount(() => <App />);')
        : action === "boot-loop" ? originalSource.replace("mount(() => <App />);", 'while (true) {}\nmount(() => <App />);')
        : action === "frame-loop" ? originalSource.replace("mount(() => <App />);", 'mount(() => <App />);\n(globalThis as any).frame = () => { while (true) {} };')
        : action === "job-loop" ? originalSource.replace("mount(() => <App />);", 'mount(() => <App />);\nconst budgetJob = () => { Promise.resolve().then(budgetJob); }; budgetJob();')
        : action === "heap-limit" ? originalSource.replace("mount(() => <App />);", 'const budgetAllocation = new Uint8Array(64 * 1024 * 1024);\nmount(() => <App />);')
        : action === "native-services" ? originalSource + `
const serviceOps = (globalThis as any).ui;
if (!serviceOps.svcOpen("mini")) throw new Error("Native mailbox missing");
serviceOps.svcSend(JSON.stringify({v:1,id:1,kind:"device.info.v1",args:{unicode:"😀"}}));
serviceOps.svcSend(JSON.stringify({v:1,id:2,kind:"device.info.v2",args:{}}));
serviceOps.svcSend(JSON.stringify({v:"1",id:3,kind:"device.info.v1",args:{}}));
const normalFrame = (globalThis as any).frame;
let serviceMask = 0, reportedServices = false;
(globalThis as any).frame = (...args: any[]) => {
  normalFrame(...args);
  for (const line of (serviceOps.svcPoll() ?? "").split("\\n")) {
    if (!line) continue;
    const reply = JSON.parse(line);
    if (reply.id === 1 && reply.ok && reply.data.platform === "${platform}" && reply.data.width > 0) serviceMask |= 1;
    if (reply.id === 2 && !reply.ok && reply.error.code === "UNSUPPORTED") serviceMask |= 2;
    if (reply.id === 3 && !reply.ok && reply.error.code === "PROTOCOL") serviceMask |= 4;
  }
  if (serviceMask === 7 && !reportedServices) {
    reportedServices = true;
    if(typeof serviceOps.__reportAppAction==="function")serviceOps.__reportAppAction("native-services", serviceMask);
    else serviceOps.svcSend(JSON.stringify({v:1,id:4,kind:"test.report.v1",args:{value:serviceMask}}));
  }
};
`
        : action === "sdk-lifecycle" ? 'import { connectMiniApp } from "@pocketjs/mini";\n' + originalSource + `
const lifecycleMini=connectMiniApp();
let lifecycleMask=0,lastLifecycleMask=0;
const lifecycleEvents:string[]=[];
for(const [event,bit] of [["launch",1],["show",2],["hide",4],["memoryWarning",8]] as const){
  lifecycleMini.onLifecycle(event,()=>{lifecycleEvents.push(event);lifecycleMask|=bit;});
}
const lifecycleFrame=(globalThis as any).frame;
(globalThis as any).frame=(...args:any[])=>{
  lifecycleFrame(...args);
  if(lifecycleMask!==lastLifecycleMask){
    lastLifecycleMask=lifecycleMask;
    const valid=lifecycleEvents.slice(0,2).join(",")==="launch,show"
      && (lifecycleMask<7 || lifecycleEvents.slice(0,4).join(",")==="launch,show,hide,show");
    lifecycleMini.request("test.report.v1",{value:valid?lifecycleMask:-1}).promise.catch(()=>{});
  }
};
`
        : action === "unload-storage" ? 'import { connectMiniApp } from "@pocketjs/mini";\n' + originalSource + `
const cleanupMini=connectMiniApp();
cleanupMini.onLifecycle("unload",()=>{cleanupMini.storage.set("unload-proof",{saved:true}).promise.catch(()=>{});});
cleanupMini.after(1,()=>cleanupMini.request("test.report.v1",{value:127}).promise.catch(()=>{}));
`
        : action === "unload-read" ? 'import { connectMiniApp } from "@pocketjs/mini";\n' + originalSource + `
const cleanupReadMini=connectMiniApp();
cleanupReadMini.storage.get<{saved:boolean}>("unload-proof").promise.then(async value=>{
  const valid=value?.saved===true;
  await cleanupReadMini.storage.remove("unload-proof").promise;
  cleanupReadMini.request("test.report.v1",{value:valid?127:-1}).promise.catch(()=>{});
});
`
        : action === "sdk-services" ? 'import { connectMiniApp } from "@pocketjs/mini";\n' + originalSource + `
const nativeMini = connectMiniApp({pages:["/","/detail"]});
let sdkDevice=false,sdkTimer=false,sdkUnsupported=false,sdkNavigation=false;
nativeMini.deviceInfo().promise.then(info=>{sdkDevice=info.platform==="${platform}" && info.width===(globalThis as any).__pjmWindow.width;});
nativeMini.request("device.info.v2").promise.catch(error=>{sdkUnsupported=error.code==="UNSUPPORTED";});
nativeMini.navigation.push("/detail",{id:"fixture"});sdkNavigation=nativeMini.navigation.current.query.id==="fixture" && nativeMini.navigation.back();
nativeMini.after(3,()=>{sdkTimer=true;});
const reportSDK=(client:typeof nativeMini,value:number)=>{
  if(typeof (globalThis as any).ui.__reportAppAction==="function")(globalThis as any).ui.__reportAppAction("sdk-services",value);
  else client.request("test.report.v1",{value}).promise.catch(()=>{});
};
nativeMini.after(4,()=>{if(sdkDevice && sdkTimer && sdkUnsupported && sdkNavigation)reportSDK(nativeMini,15);});
nativeMini.after(5,()=>{
  nativeMini.deviceInfo().promise.catch(()=>{});
  nativeMini.dispose();
  const reconnected=connectMiniApp();let freshDevice=false;
  reconnected.deviceInfo().promise.then(info=>{freshDevice=info.platform==="${platform}";});
  reconnected.after(4,()=>{if(freshDevice && sdkDevice && sdkTimer && sdkUnsupported && sdkNavigation)reportSDK(reconnected,31);});
});
`
        : ["storage-write","storage-read","storage-empty"].includes(action) ? 'import { connectMiniApp } from "@pocketjs/mini";\n' + originalSource + `
const storageMini=connectMiniApp();
(async()=>{
  const key="../__proto__",expected={text:"persisted 😀",nested:[1,true,null]};
  if(await storageMini.storage.get("failed-boot").promise!==null)throw new Error("Failed guest dispatched a storage effect");
  ${action === "storage-write" ? `await storageMini.storage.set(key,expected).promise;
  let quota=false;try{await storageMini.storage.set(key,"x".repeat(2049)).promise;}catch(error:any){quota=error.code==="PROTOCOL";}if(!quota)throw new Error("Quota was not enforced");
  let keyQuota=false;try{await storageMini.storage.set("😀".repeat(33),1).promise;}catch(error:any){keyQuota=error.code==="PROTOCOL";}if(!keyQuota)throw new Error("Key quota was not enforced");` : ""}
  const value=await storageMini.storage.get(key).promise;
  if(${action === "storage-empty" ? "value!==null" : "!value || (value as any).text!==expected.text || JSON.stringify((value as any).nested)!==JSON.stringify(expected.nested)"})throw new Error("Unexpected storage snapshot");
  ${action === "storage-empty" ? `if(await storageMini.request("storage.get.v1",{key,appId:"dev.pjm.acceptance"}).promise!==null)throw new Error("Guest selected another app identity");` : ""}
  ${action === "storage-read" ? `await storageMini.storage.remove(key).promise;if(await storageMini.storage.get(key).promise!==null)throw new Error("Remove failed");` : ""}
  if(typeof (globalThis as any).ui.__reportAppAction==="function")(globalThis as any).ui.__reportAppAction("native-storage",63);
  else storageMini.request("test.report.v1",{value:63}).promise.catch(()=>{});
})().catch(error=>{
  if(typeof (globalThis as any).ui.__reportAppAction==="function")(globalThis as any).ui.__reportAppAction("native-storage-error",-1);
  else storageMini.request("test.report.v1",{value:-1}).promise.catch(()=>{});
});
`
        : action === "restore" ? originalSource : null;
      if (content === null) return new Response("Unknown fixture action", { status: 404 });
      writeFileSync("app/main.tsx", content); return new Response("ok");
    }
    if (route === "window" && request.method === "POST") {
      try { window = readWindow(await request.json()); wanted = fingerprint(); void rebuild(); return Response.json(window); }
      catch (failure) { return new Response(String(failure), { status: 400 }); }
    }
    if (route === "state") return Response.json({ revision: active, error, window: publishedWindow, metadata: publishedMetadata }, { headers: { "Cache-Control": "no-store" } });
    const match = /^(\d+)\/(app\.(?:js|pak))$/.exec(route);
    if (!match || Number(match[1]) > active) return new Response("Not found", { status: 404 });
    const file = Bun.file(resolve(`build/revisions/${match[1]}/${match[2]}`));
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});
const url = `http://${host}:${server.port}/${token}/`;
mkdirSync("build", { recursive: true });
writeFileSync("build/session.json", JSON.stringify({ url, pid: process.pid }), { flag: "wx" });
console.log(`PocketJS Mini: ${url}`);

async function rebuild() {
  if (compiling || stopping || wanted === completed) return;
  compiling = true;
  const snapshot = wanted;
  try {
    const result = await compileApplication({ upstream: upstream!, project: process.cwd(), directory: resolve(`build/revisions/${++sequence}`),
      window: { ...window }, platform, child: child => { compileChild = child; } });
    wanted = fingerprint();
    if (!stopping && snapshot === wanted) {
      const artifact = join(result.directory,"artifact.pocket");
      writeFileSync(artifact,result.packed);renameSync(artifact,`build/${result.name}.pocket`);
      active = sequence; error = null; publishedWindow = result.metrics; publishedMetadata = result.metadata;
      console.log(`Ready revision ${active}`);
    }
  } catch (failure) {
    if (!stopping && snapshot === wanted) {
      error = failure instanceof Error ? failure.message : String(failure);
      console.error(error);
    }
  } finally {
    completed = snapshot; compiling = false;
    if (!stopping && wanted !== completed) void rebuild();
  }
}
const watch = setInterval(() => {
  try { wanted = fingerprint(); void rebuild(); }
  catch (failure) { error = String(failure); }
}, 300);
function shutdown(status = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(watch); server.stop(true);
  for (const child of [compileChild, setupChild]) {
    if (!child) continue;
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
  try {
    if (JSON.parse(readFileSync("build/session.json", "utf8")).pid === process.pid)
      rmSync("build/session.json", { force: true });
  } catch {}
  const exit = () => process.exit(status);
  if (hostCleanup) { const timeout = setTimeout(exit, 5000); void hostCleanup().finally(() => { clearTimeout(timeout); exit(); }); }
  else setTimeout(exit, 100);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
wanted = fingerprint();
await rebuild();

if (process.env.PJM_TEST_SERVER !== "1") {
  try {
    const callbacks = { root, upstream: upstream!, url,
      stopping: () => stopping,
      child: (child: ReturnType<typeof Bun.spawn> | undefined) => { setupChild = child; },
      cleanup: (callback: () => Promise<void>) => { hostCleanup = callback; },
      stopped: shutdown };
    if (phone && "platform" in phone) await launchAndroid({ ...callbacks, device: phone });
    else await launchNative({ ...callbacks, device: phone! });
  } catch (failure) {
    console.error(String(failure)); shutdown(1);
  }
}
