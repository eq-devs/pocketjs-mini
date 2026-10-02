// Official PocketJS compiler/package APIs + a native UIKit host.
import { defaultWindow, readWindow, miniContracts, type WindowInfo } from "./profile.ts";
import { launchNative } from "./native.ts";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [upstream, device = ""] = Bun.argv.slice(2);
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
const load = (path: string) => import(resolve(upstream!, path));
const { checkAppTypes } = await load("framework/compiler/app-check.ts");
const platforms = await load("contracts/spec/platforms.ts");
const { validateAndResolveBuildPlan } = await load("framework/src/manifest/resolve.ts");
let window: WindowInfo = { ...defaultWindow };
const originalSource = process.env.PJM_NATIVE_TEST === "1" ? readFileSync("app/main.tsx", "utf8") : "";
const { makeVariant } = await load("tools/pocket-pack.ts");
const { encodePocketPackage, decodePocketPackage, POCKET_SECTION } = await load("contracts/spec/pocket-package.ts");
const { canonicalJson } = await load("framework/src/manifest/plan.ts");

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
  for (const path of ["app", "assets", "mini.json", "tsconfig.json"]) add(path);
  hash.update(JSON.stringify(window));
  return hash.digest("hex");
}

async function compile(revision: number) {
  const mini = await Bun.file("mini.json").json();
  if (!mini || typeof mini.name !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(mini.name))
    throw new Error("mini.json requires a lowercase app name (a-z, 0-9, -, maximum 48 characters)");
  const name = mini.name;
  const manifest = {
    $schema: "https://pocketjs.dev/schema/pocket-2.json", pocket: 2,
    id: `dev.pjm.${name}`, name, title: name, version: "0.3.0",
    engine: { capabilities: { requires: ["text.glyphs.baked", "input.touch"] } },
    app: { entry: "app/main.tsx", output: name, framework: "solid",
      viewport: { fixed: { logical: [window.width, window.height], presentation: "native" } } },
  };
  const checked = checkAppTypes({ entry: resolve("app/main.tsx"),
    tsconfigPath: resolve("tsconfig.json"), declarationFiles: [resolve(upstream!, "framework/src/jsx.d.ts")] });
  if (!checked.ok) throw new Error(checked.diagnostics.filter((d: any) => d.category === "error")
    .map((d: any) => `${d.file ?? "TypeScript"}:${d.line ?? 0} TS${d.code}: ${d.message}`).join("\n"));
  const resolved = validateAndResolveBuildPlan(manifest, { target: "pjm-ios" }, miniContracts(platforms, window));
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
  const plan = resolved.plan;
  const metrics = { ...window };
  const directory = resolve(`build/revisions/${revision}`);
  mkdirSync(directory, { recursive: true });
  const planPath = join(directory, "plan.json");
  writeFileSync(planPath, JSON.stringify(plan));
  const child = Bun.spawn([process.execPath, resolve(upstream!, "tools/build.ts"),
    `--plan=${planPath}`, `--project-root=${process.cwd()}`, `--outdir=${directory}`],
    { stdout: "pipe", stderr: "pipe", detached: true });
  compileChild = child;
  const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  compileChild = undefined;
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (status !== 0) throw new Error(stderr || `PocketJS compiler exited ${status}`);
  const variant = makeVariant({ target: plan.target.id, hostAbi: plan.target.hostAbi,
    planJson: canonicalJson(plan), identity: { output: name, id: manifest.id, title: name },
    js: new Uint8Array(readFileSync(join(directory, `${name}.js`))),
    pak: new Uint8Array(readFileSync(join(directory, `${name}.pak`))) });
  const packed = encodePocketPackage({ manifest: new TextEncoder().encode(JSON.stringify(manifest)), variants: [variant] });
  const decoded = decodePocketPackage(packed);
  const section = (kind: number) => decoded.variants[0].sections.find((s: any) => s.kind === kind)!.bytes as Uint8Array;
  const js = section(POCKET_SECTION.js);
  const environment = `globalThis.__pjmWindow=${JSON.stringify(metrics)};\n`;
  writeFileSync(join(directory, "app.js"), Buffer.concat([Buffer.from(environment), js.subarray(0, js.length - 1)]));
  writeFileSync(join(directory, "app.pak"), section(POCKET_SECTION.pak));
  return { directory, packed, name, metrics };
}

let active = 0, sequence = 0, error: string | null = null;
let publishedWindow: WindowInfo = { ...defaultWindow };
let wanted = "", completed = "", compiling = false, stopping = false;
let compileChild: ReturnType<typeof Bun.spawn> | undefined;
let setupChild: ReturnType<typeof Bun.spawn> | undefined;
let hostCleanup: (() => Promise<void>) | undefined;
const token = randomBytes(24).toString("hex");
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PJM_PORT ?? 0),
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(`/${token}/`)) return new Response("Not found", { status: 404 });
    const route = path.slice(token.length + 2);
    if (process.env.PJM_NATIVE_TEST === "1" && route.startsWith("test/") && request.method === "POST") {
      const action = route.slice(5);
      const content = action === "saved" ? originalSource.replace("Hello PocketJS Mini", "Saved edit")
        : action === "compile-error" ? "this is not TypeScript"
        : action === "runtime-error" ? originalSource.replace("mount(() => <App />);", 'throw new Error("Intentional guest failure");\nmount(() => <App />);')
        : action === "restore" ? originalSource : null;
      if (content === null) return new Response("Unknown fixture action", { status: 404 });
      writeFileSync("app/main.tsx", content); return new Response("ok");
    }
    if (route === "window" && request.method === "POST") {
      try { window = readWindow(await request.json()); wanted = fingerprint(); void rebuild(); return Response.json(window); }
      catch (failure) { return new Response(String(failure), { status: 400 }); }
    }
    if (route === "state") return Response.json({ revision: active, error, window: publishedWindow }, { headers: { "Cache-Control": "no-store" } });
    const match = /^(\d+)\/(app\.(?:js|pak))$/.exec(route);
    if (!match || Number(match[1]) > active) return new Response("Not found", { status: 404 });
    const file = Bun.file(resolve(`build/revisions/${match[1]}/${match[2]}`));
    return new Response(file, { headers: { "Cache-Control": "no-store" } });
  },
});
const url = `http://127.0.0.1:${server.port}/${token}/`;
mkdirSync("build", { recursive: true });
writeFileSync("build/session.json", JSON.stringify({ url, pid: process.pid }), { flag: "wx" });
console.log(`PocketJS Mini: ${url}`);

async function rebuild() {
  if (compiling || stopping || wanted === completed) return;
  compiling = true;
  const snapshot = wanted;
  try {
    const result = await compile(++sequence);
    wanted = fingerprint();
    if (!stopping && snapshot === wanted) {
      active = sequence; error = null; publishedWindow = result.metrics;
      writeFileSync(`build/${result.name}.pocket`, result.packed);
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
    await launchNative({ root, upstream: upstream!, device, url,
      stopping: () => stopping,
      child: child => { setupChild = child; },
      cleanup: callback => { hostCleanup = callback; },
      stopped: shutdown });
  } catch (failure) {
    console.error(String(failure)); shutdown(1);
  }
}
