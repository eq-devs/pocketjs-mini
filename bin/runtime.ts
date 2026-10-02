// Internal adapter only: upstream owns compilation, packaging and rendering.
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [command, upstream] = Bun.argv.slice(2);
const load = (path: string) => import(resolve(upstream!, path));
const mini = await Bun.file("mini.json").json();
if (!mini || typeof mini.name !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(mini.name)) {
  throw new Error("mini.json requires a name (lowercase a-z, 0-9, -, maximum 48 characters)");
}
const name = mini.name;
mkdirSync("build", { recursive: true });
const manifest = {
  $schema: "https://pocketjs.dev/schema/pocket-2.json",
  pocket: 2, id: `dev.pjm.${name}`, name, title: name, version: "0.1.0",
  engine: { capabilities: { requires: ["text.glyphs.baked"] } },
  app: { entry: "app/main.tsx", output: name, framework: "solid",
    viewport: { fixed: { logical: [480, 272], presentation: "integer-fit" } } },
};
await Bun.write("build/pocket.json", JSON.stringify(manifest, null, 2) + "\n");
const compile = Bun.spawn([process.execPath, resolve(upstream!, "tools/pocket.ts"),
  "compile", "--target", "psp", "--manifest", resolve("build/pocket.json"),
  "--project-root", process.cwd(), "--outdir", "build", "--plan-dir", "build/plans"],
  { stdout: "inherit", stderr: "inherit" });
if (await compile.exited !== 0) process.exit(1);
const { makeVariant } = await load("tools/pocket-pack.ts");
const { encodePocketPackage, decodePocketPackage, POCKET_SECTION } = await load("contracts/spec/pocket-package.ts");
const { canonicalJson } = await load("framework/src/manifest/plan.ts");
const plan = await Bun.file("build/plans/psp/plan.json").json();
const variant = makeVariant({ target: "psp", hostAbi: plan.target.hostAbi,
  planJson: canonicalJson(plan), identity: { output: name, id: manifest.id, title: name },
  js: new Uint8Array(readFileSync(`build/${name}.js`)),
  pak: new Uint8Array(readFileSync(`build/${name}.pak`)) });
const output = `build/${name}.pocket`;
await Bun.write(output, encodePocketPackage({ manifest: new TextEncoder().encode(JSON.stringify(manifest)), variants: [variant] }));
// Decode with upstream validation; the run below consumes these package sections.
const decoded = decodePocketPackage(new Uint8Array(readFileSync(output)));
console.log(`Built ${output}`);
if (command === "build") process.exit(0);

const wasmFile = resolve(upstream!, "hosts/web/pocketjs.wasm");
if (!await Bun.file(wasmFile).exists()) {
  const wasmBuild = Bun.spawn([process.execPath, "tools/wasm.ts"],
    { cwd: upstream, stdout: "inherit", stderr: "inherit" });
  if (await wasmBuild.exited !== 0) process.exit(1);
}
const { createWasmUi } = await load("hosts/web/wasm-ops.js");
const wasm = await createWasmUi(await Bun.file(wasmFile).arrayBuffer());
const sections = decoded.variants[0].sections;
const section = (kind: number) => {
  const found = sections.find((s: { kind: number }) => s.kind === kind);
  if (!found) throw new Error(`Missing package section ${kind}`);
  return found.bytes as Uint8Array;
};
const g = globalThis as any;
const inbox: string[] = [];
const outbox: string[] = [];
g.ui = wasm.ops;
g.__pak = section(POCKET_SECTION.pak).slice().buffer;
g.__simHz = 60;
g.__pocketApp = name;
g.__pocketDevtoolsTransport = { send: (line: string) => outbox.push(line), recv: () => inbox.shift() ?? null };
const js = section(POCKET_SECTION.js);
if (js[js.length - 1] !== 0) throw new Error("Package JS terminator missing");
(0, eval)(new TextDecoder().decode(js.subarray(0, js.length - 1)));
if (typeof g.frame !== "function") throw new Error("App did not mount a frame function");
for (let frame = 0; frame < 60; frame++) { g.frame(0); wasm.tick(); }
const pixels = wasm.render();
if (pixels.length !== 480 * 272 * 4) throw new Error("Host framebuffer has incorrect size");
let varied = false;
for (let i = 4; i < pixels.length; i += 4) {
  if (pixels[i] !== pixels[0] || pixels[i + 1] !== pixels[1] || pixels[i + 2] !== pixels[2]) { varied = true; break; }
}
inbox.push(JSON.stringify({ t: "getTree" }));
g.frame(0); wasm.tick();
const tree = outbox.map(line => JSON.parse(line)).find(msg => msg.t === "tree")?.root;
if (!tree || !varied) throw new Error("App booted without a component tree or visible content");
if (process.env.PJM_EXPECT_TEXT && !JSON.stringify(tree).includes(process.env.PJM_EXPECT_TEXT)) {
  throw new Error("Expected text missing from rendered tree");
}
console.log(`Booted ${name}: 60 frames, 480x272 framebuffer, visible content and component tree`);
