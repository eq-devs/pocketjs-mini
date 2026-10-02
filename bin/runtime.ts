// Internal orchestration: official PocketJS compiler/package APIs + Flutter host.
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [upstream, device = process.platform === "darwin" ? "macos" : "linux"] = Bun.argv.slice(2);
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
const { resolveIOSDevBuildPlan } = await load("tools/ios-profile.ts");
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
  return hash.digest("hex");
}

async function compile(revision: number) {
  const mini = await Bun.file("mini.json").json();
  if (!mini || typeof mini.name !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(mini.name))
    throw new Error("mini.json requires a lowercase app name (a-z, 0-9, -, maximum 48 characters)");
  const name = mini.name;
  const manifest = {
    $schema: "https://pocketjs.dev/schema/pocket-2.json", pocket: 2,
    id: `dev.pjm.${name}`, name, title: name, version: "0.2.0",
    engine: { capabilities: { requires: ["text.glyphs.baked", "input.touch"] } },
    app: { entry: "app/main.tsx", output: name, framework: "solid",
      viewport: { fixed: { logical: [480, 272], presentation: "integer-fit" } } },
  };
  const checked = checkAppTypes({ entry: resolve("app/main.tsx"),
    tsconfigPath: resolve("tsconfig.json"), declarationFiles: [resolve(upstream!, "framework/src/jsx.d.ts")] });
  if (!checked.ok) throw new Error(checked.diagnostics.filter((d: any) => d.category === "error")
    .map((d: any) => `${d.file ?? "TypeScript"}:${d.line ?? 0} TS${d.code}: ${d.message}`).join("\n"));
  const plan = resolveIOSDevBuildPlan(manifest, 1);
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
  writeFileSync(join(directory, "app.js"), js.subarray(0, js.length - 1));
  writeFileSync(join(directory, "app.pak"), section(POCKET_SECTION.pak));
  return { directory, packed, name };
}

let active = 0, sequence = 0, error: string | null = null;
let wanted = "", completed = "", compiling = false, stopping = false;
let compileChild: ReturnType<typeof Bun.spawn> | undefined;
let flutter: ReturnType<typeof Bun.spawn> | undefined;
let setupChild: ReturnType<typeof Bun.spawn> | undefined;
const token = randomBytes(24).toString("hex");
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PJM_PORT ?? 0),
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(`/${token}/`)) return new Response("Not found", { status: 404 });
    const route = path.slice(token.length + 2);
    if (route === "state") return Response.json({ revision: active, error }, { headers: { "Cache-Control": "no-store" } });
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
      active = sequence; error = null;
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
  for (const child of [compileChild, setupChild, flutter]) {
    if (!child) continue;
    try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
  }
  try {
    if (JSON.parse(readFileSync("build/session.json", "utf8")).pid === process.pid)
      rmSync("build/session.json", { force: true });
  } catch {}
  setTimeout(() => process.exit(status), 100).unref();
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
wanted = fingerprint();
await rebuild();

if (process.env.PJM_TEST_SERVER !== "1") {
  const host = resolve(".pjm/flutter");
  if (!existsSync(join(host, "pubspec.yaml"))) {
    const create = Bun.spawn(["flutter", "create", "--empty", "--no-pub", "--platforms=macos,ios,linux", "--project-name=pjm_host", host], { stdout: "inherit", stderr: "inherit", detached: true });
    setupChild = create;
    if (await create.exited !== 0) { shutdown(1); } else cpSync(join(root, "host"), host, { recursive: true });
    setupChild = undefined;
  } else cpSync(join(root, "host"), host, { recursive: true });
  writeFileSync(join(host, "upstream.txt"), upstream!);
  writeFileSync(join(host, "toolchain.json"), JSON.stringify({ cargo: Bun.which("cargo"),
    environment: Object.fromEntries(["PATH", "CARGO_HOME", "RUSTUP_HOME", "LIBCLANG_PATH"].flatMap(key =>
      process.env[key] ? [[key, process.env[key]]] : [])) }));
  if (!stopping) {
    flutter = Bun.spawn(["flutter", "run", "-d", device, `--dart-define=PJM_URL=${url}`],
      { cwd: host, stdin: "inherit", stdout: "inherit", stderr: "inherit", detached: true });
    const status = await flutter.exited;
    shutdown(status);
  }
}
