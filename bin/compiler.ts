import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { miniContracts, type WindowInfo } from "./profile.ts";
import { installSdk } from "./sdk.ts";
import { validatePackageMetadata, type PackageMetadata } from "../container/package.ts";

export interface CompileOptions {
  upstream: string; project: string; directory: string;
  window: WindowInfo; platform: "ios" | "android";
  child?(child: ReturnType<typeof Bun.spawn> | undefined): void;
}
export async function resolveApplication(options: CompileOptions) {
  const { project, upstream, window, platform } = options;
  installSdk(project);
  const load = (path: string) => import(resolve(upstream, path));
  const [{ checkAppTypes }, platforms, { validateAndResolveBuildPlan }] = await Promise.all([
    load("framework/compiler/app-check.ts"), load("contracts/spec/platforms.ts"), load("framework/src/manifest/resolve.ts"),
  ]);
  const canonicalPath = join(project, "pocket.json");
  const manifest = existsSync(canonicalPath) ? await Bun.file(canonicalPath).json() : await (async () => {
    const mini = await Bun.file(join(project, "mini.json")).json();
    if (!mini || typeof mini.name !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(mini.name))
      throw new Error("mini.json requires a lowercase app name (a-z, 0-9, -, maximum 48 characters)");
    return {
      $schema: "https://pocketjs.dev/schema/pocket-2.json", pocket: 2,
      id: mini.appId ?? `dev.pjm.${mini.name}`, name: mini.name, title: mini.title ?? mini.name, version: mini.version ?? "0.3.0",
      engine: { capabilities: { requires: ["text.glyphs.baked", "input.touch"] } },
      app: { entry: "app/main.tsx", output: mini.name, framework: "solid",
        viewport: { fixed: { logical: [window.width, window.height], presentation: "native" } } },
    };
  })();
  const resolved = validateAndResolveBuildPlan(manifest, { target: `pjm-${platform}` }, miniContracts(platforms, window, platform));
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.diagnostics));
  const plan = resolved.plan;
  const configPath = existsSync(join(project,"container.json")) ? join(project,"container.json") : join(project,"mini.json");
  const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath,"utf8")) : {};
  if (!config || typeof config!=="object" || Array.isArray(config)) throw new Error("Container configuration must be an object");
  if ((config.appId && config.appId!==plan.app.id) || (config.version && config.version!==plan.app.version)) throw new Error("Container identity/version must match the compiled application");
  const metadata: PackageMetadata = {appId:plan.app.id,version:plan.app.version,minHostAbi:plan.target.hostAbi,entry:"main.pocket",
    pages:config.pages??["/"],permissions:config.permissions??[],domains:config.domains??[],targets:[plan.target.id]};
  validatePackageMetadata(metadata);
  const checked = checkAppTypes({ entry: resolve(project, plan.app.entry),
    tsconfigPath: join(project, "tsconfig.json"), declarationFiles: [join(upstream, "framework/src/jsx.d.ts")] });
  if (!checked.ok) throw new Error(checked.diagnostics.filter((d: any) => d.category === "error")
    .map((d: any) => `${d.file ?? "TypeScript"}:${d.line ?? 0} TS${d.code}: ${d.message}`).join("\n"));
  return { plan, manifest, metadata };
}

/** One compiler path for interactive runs, checks, and signed release builds. */
export async function compileApplication(options: CompileOptions) {
  const { upstream, project, directory, window } = options;
  const { plan, manifest, metadata } = await resolveApplication(options);
  const name = plan.app.output;
  const load = (path: string) => import(resolve(upstream, path));
  const [{ makeVariant }, { encodePocketPackage, decodePocketPackage, POCKET_SECTION }, { canonicalJson }] = await Promise.all([
    load("tools/pocket-pack.ts"), load("contracts/spec/pocket-package.ts"), load("framework/src/manifest/plan.ts"),
  ]);
  const metrics = { ...window };
  mkdirSync(directory, { recursive: true });
  const planPath = join(directory, "plan.json");
  writeFileSync(planPath, JSON.stringify(plan));
  const child = Bun.spawn([process.execPath, join(upstream, "tools/build.ts"),
    `--plan=${planPath}`, `--project-root=${project}`, `--outdir=${directory}`],
    { cwd: project, stdout: "pipe", stderr: "pipe", detached: true });
  options.child?.(child);
  let stdout: string, stderr: string, status: number;
  try { [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]); }
  finally { options.child?.(undefined); }
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (status !== 0) throw new Error(stderr || `PocketJS compiler exited ${status}`);
  const environment = `globalThis.__pjmWindow=${JSON.stringify(metrics)};\n`;
  const variant = makeVariant({ target: plan.target.id, hostAbi: plan.target.hostAbi,
    planJson: canonicalJson(plan), identity: { output: name, id: plan.app.id, title: plan.app.title },
    js: new Uint8Array(Buffer.concat([Buffer.from(environment), readFileSync(join(directory, `${name}.js`))])),
    pak: new Uint8Array(readFileSync(join(directory, `${name}.pak`))) });
  const packed = encodePocketPackage({ manifest: new TextEncoder().encode(JSON.stringify(manifest)), variants: [variant] });
  const decoded = decodePocketPackage(packed);
  const section = (kind: number) => decoded.variants[0].sections.find((s: any) => s.kind === kind)!.bytes as Uint8Array;
  const js = section(POCKET_SECTION.js);
  writeFileSync(join(directory, "app.js"), js.subarray(0, js.length - 1));
  writeFileSync(join(directory, "app.pak"), section(POCKET_SECTION.pak));
  return { directory, packed, name, metrics, plan, manifest, metadata };
}
