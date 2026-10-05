import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PackageMetadata } from "../container/package";
import type { WindowInfo } from "../bin/profile";

const pjm = resolve(import.meta.dir, "../bin/pjm");
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => Promise<T>, good: (value: T) => boolean, timeout = 120000): Promise<T> {
  const end = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < end) {
    try { const value = await read(); if (good(value)) return value; last = value; } catch (error) { last = error; }
    await sleep(150);
  }
  throw new Error(`Timed out: ${JSON.stringify(last)}`);
}

test("public run auto-compiles, watches, rejects stale revisions, recovers and stops", async () => {
  const temp = mkdtempSync(join(tmpdir(), "pjm-check-"));
  const project = join(temp, "hello");
  let child: ReturnType<typeof Bun.spawn> | undefined;
  const command = async (args: string[], cwd = temp) => {
    const command = Bun.spawn([pjm, ...args], { cwd, env: { ...process.env, PJM_TEST_SERVER: "1" }, stdout: "pipe", stderr: "pipe" });
    const [status, stdout, stderr] = await Promise.all([command.exited, new Response(command.stdout).text(), new Response(command.stderr).text()]);
    return { status, stdout, stderr };
  };
  try {
    for (const args of [[], ["build"], ["dev"], ["create", "../escape"], ["create", "-hello"], ["create", "hello", "extra"], ["clean"]])
      expect((await command(args)).status).not.toBe(0);
    expect((await command(["create", "hello"])).status).toBe(0);
    expect((await command(["create", "hello"])).status).not.toBe(0);
    expect(existsSync(join(project, "assets"))).toBe(true);
    expect(existsSync(join(project, "app/main.tsx"))).toBe(true);
    expect((await command(["run", "extra"], project)).status).not.toBe(0);
    if (process.env.PJM_TEST_UPSTREAM) {
      mkdirSync(join(project, ".pjm"));
      symlinkSync(resolve(process.env.PJM_TEST_UPSTREAM), join(project, ".pjm/pocketjs"), "dir");
    }
    child = Bun.spawn([pjm, "run"], { cwd: project, env: { ...process.env, PJM_TEST_SERVER: "1" }, stdout: "inherit", stderr: "inherit" });
    const session = await until(async () => JSON.parse(readFileSync(join(project, "build/session.json"), "utf8")), value => !!value.url);
    const state = () => fetch(`${session.url}state`).then(r => r.json()) as Promise<{ revision: number; error: string | null; window: WindowInfo; metadata: PackageMetadata | null }>;
    let ready = await until(state, value => value.revision > 0 && !value.error);
    const panel=await fetch(`${session.url}devtools`);expect(panel.status).toBe(200);expect(panel.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");expect(await panel.text()).toContain("PocketJS Mini DevTools");
    expect((await fetch(session.url.replace(/\/[a-f0-9]{48}\//,"/wrong/")+"devtools")).status).toBe(404);
    const panelCommand=await command(["devtools","--no-open"],project);expect(panelCommand.status).toBe(0);expect(panelCommand.stdout.trim()).toBe(`${session.url}devtools`);
    expect((ready as any).builds.at(-1).outcome).toBe("published");expect((ready as any).builds.at(-1).durationMs).toBeGreaterThanOrEqual(0);
    console.log("Compiler stage sample:",JSON.stringify((ready as any).builds.at(-1)));
    expect((ready as any).builds.at(-1).stages.compilerMs).toBeGreaterThan(0);expect((ready as any).builds.at(-1).stages.resolveMs).toBeGreaterThanOrEqual(0);expect((ready as any).builds.at(-1).stages.typeCheckMs).toBeGreaterThan(0);
    expect(ready.metadata?.appId).toBe("dev.pjm.hello");
    const deviceEvent=(body:string)=>fetch(`${session.url}device-event`,{method:"POST",body});
    expect((await deviceEvent(JSON.stringify({revision:ready.revision,platform:"android",kind:"frame-ready"}))).status).toBe(200);
    expect((await deviceEvent(JSON.stringify({revision:ready.revision,platform:"ios",kind:"log",level:"warn",message:"diagnostic 😀"}))).status).toBe(200);
    const observed=await state();expect((observed as any).deviceEvents.at(-1).revision).toBe(ready.revision);expect((observed as any).deviceEvents.at(-1).message).toBe("diagnostic 😀");
    expect((await deviceEvent(JSON.stringify({revision:ready.revision+1,platform:"android",kind:"frame-ready"}))).status).toBe(400);
    expect((await deviceEvent("x".repeat(4097))).status).toBe(400);
    expect((await deviceEvent(JSON.stringify({revision:ready.revision,platform:"web",kind:"frame-ready"}))).status).toBe(400);

    expect(existsSync(join(project, "build/hello.pocket"))).toBe(true);
    const manifestPath = join(project, "pocket.json");
    const manifest = {
      $schema: "https://pocketjs.dev/schema/pocket-2.json", pocket: 2,
      id: "dev.example.hello", name: "hello", title: "Official manifest", version: "1.0.0",
      engine: { capabilities: { requires: ["text.glyphs.baked", "input.touch", "net.http"] } },
      app: { entry: "app/main.tsx", output: "hello", framework: "solid",
        viewport: { fixed: { logical: [390, 844], presentation: "native" } } },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const rejected = await until(state, value => !!value.error);
    expect(rejected.revision).toBe(ready.revision);
    expect(rejected.metadata).toEqual(ready.metadata);
    manifest.engine.capabilities.requires.pop();
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const canonical = await until(state, value => value.revision > ready.revision && !value.error);
    expect(canonical.metadata?.appId).toBe("dev.example.hello");
    const canonicalPlan = JSON.parse(readFileSync(join(project, `build/revisions/${canonical.revision}/plan.json`), "utf8"));
    expect(canonicalPlan.app.id).toBe(manifest.id);
    expect(canonicalPlan.app.title).toBe(manifest.title);
    rmSync(manifestPath);
    ready = await until(state, value => value.revision > canonical.revision && !value.error);

    expect((await fetch(`${session.url}test/compile-error`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${session.url}window`, { method: "POST", body: JSON.stringify({ width: 9999 }) })).status).toBe(400);
    const window = { width: 402, height: 778, density: 3, safeTop: 62, safeBottom: 34, safeLeft: 0, safeRight: 0 };
    expect((await fetch(`${session.url}window`, { method: "POST", body: JSON.stringify(window) })).status).toBe(200);
    let adaptive = await until(state, value => value.revision > ready.revision && !value.error);
    const fullState = await (await fetch(`${session.url}state`)).json();
    expect(fullState.window).toEqual(window);
    const plan = JSON.parse(readFileSync(join(project, `build/revisions/${adaptive.revision}/plan.json`), "utf8"));
    expect(plan.target.id).toBe("pjm-ios");
    expect(plan.viewport.logical).toEqual([402, 778]);
    expect(plan.viewport.physical).toEqual([1206, 2334]);
    const adaptiveJs = await (await fetch(`${session.url}${adaptive.revision}/app.js`)).text();
    expect(adaptiveJs).toContain('globalThis.__pjmWindow=');
    expect((await fetch(`${session.url}${ready.revision}/app.js`)).status).toBe(200);
    expect((await fetch(`${session.url}../state`)).status).toBe(404);
    expect((await fetch(`${session.url}99999/app.js`)).status).toBe(404);
    const containerPath=join(project,"container.json");
    writeFileSync(containerPath,JSON.stringify({permissions:["root"]}));
    const invalidContainer=await until(state,value=>!!value.error);
    expect(invalidContainer.revision).toBe(adaptive.revision);
    expect(invalidContainer.metadata).toEqual(adaptive.metadata);
    const artifactPath=join(project,"build/hello.pocket"),previousArtifact=readFileSync(artifactPath);
    rmSync(artifactPath);mkdirSync(artifactPath);
    writeFileSync(containerPath,JSON.stringify({pages:["/","/detail"]}));
    const failedCommit=await until(state,value=>!!value.error?.includes("rename"));
    expect(failedCommit.revision).toBe(adaptive.revision);
    expect(failedCommit.metadata).toEqual(adaptive.metadata);
    expect(failedCommit.window).toEqual(adaptive.window);
    rmSync(artifactPath,{recursive:true});writeFileSync(artifactPath,previousArtifact);
    writeFileSync(containerPath,JSON.stringify({pages:["/","/detail","/settings"]}));
    adaptive=await until(state,value=>value.revision>adaptive.revision && !value.error);
    expect(adaptive.metadata?.pages).toEqual(["/","/detail","/settings"]);
    const duplicate = await command(["run"], project);
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.stderr).toContain("already running");
    expect((await command(["clean"], project)).status).not.toBe(0);
    const sourcePath = join(project, "app/main.tsx");
    const original = readFileSync(sourcePath, "utf8");
    writeFileSync(sourcePath, 'this is not TypeScript');
    const broken = await until(state, value => !!value.error);
    expect(broken.revision).toBe(adaptive.revision);
    expect(broken.error).toContain("TS");
    writeFileSync(sourcePath, original.replace("Hello PocketJS Mini", "Saved edit"));
    const fixed = await until(state, value => value.revision > adaptive.revision && !value.error);
    expect((await (await fetch(`${session.url}${fixed.revision}/app.js`)).text()).includes("Saved edit")).toBe(true);
    writeFileSync(join(project, "assets/new.txt"), "asset change");
    const assets = await until(state, value => value.revision > fixed.revision && !value.error);
    const dependency=join(project,"app/check-dependency.ts");writeFileSync(dependency,'export const label: string = "dependency";');
    writeFileSync(sourcePath,'import {label} from "./check-dependency.ts"; const checkedLabel: string = label;\n'+original);
    const imported=await until(state,value=>value.revision>assets.revision && !value.error);
    writeFileSync(dependency,'export const label: number = 123;');
    const dependencyError=await until(state,value=>!!value.error);expect(dependencyError.revision).toBe(imported.revision);expect(dependencyError.error).toContain("TS2322");
    writeFileSync(dependency,'export const label: string = "repaired";');
    const recoveredImport=await until(state,value=>value.revision>imported.revision && !value.error);
    console.log("Warm compiler stage sample:",JSON.stringify((recoveredImport as any).builds.at(-1)));
    // Rapid saves must eventually publish the latest source, even if an earlier build finished.
    writeFileSync(sourcePath, original.replace("Hello PocketJS Mini", "Obsolete edit"));
    await sleep(50);
    writeFileSync(sourcePath, original.replace("Hello PocketJS Mini", "Latest edit"));
    await until(async () => {
      const value = await state();
      if (value.revision <= assets.revision || value.error) return false;
      return (await (await fetch(`${session.url}${value.revision}/app.js`)).text()).includes("Latest edit");
    }, value => value);
    child.kill("SIGTERM");
    expect(await child.exited).toBe(0);
    child = undefined;
    expect(existsSync(join(project, "build/session.json"))).toBe(false);
    await expect(fetch(`${session.url}state`)).rejects.toThrow();
    // A host startup failure must never be reported as successful command completion.
    const tools = join(temp, "tools"); mkdirSync(tools);
    const xcrun = join(tools, "xcrun");
    writeFileSync(xcrun, "#!/bin/sh\nprintf '%s\\n' '{\"devices\":{}}'\n"); chmodSync(xcrun, 0o755);
    const failedLaunch = Bun.spawn([process.execPath, resolve(import.meta.dir, "../bin/runtime.ts"), join(project, ".pjm/pocketjs")],
      { cwd: project, env: { ...process.env, PJM_TEST_SERVER: "0", PATH: `${tools}:${process.env.PATH}` }, stdout: "pipe", stderr: "pipe" });
    const [failedStatus, failedOut, failedError] = await Promise.all([failedLaunch.exited, new Response(failedLaunch.stdout).text(), new Response(failedLaunch.stderr).text()]);
    expect(failedStatus).not.toBe(0);
    expect(failedError).toContain("No available iPhone");
    expect(existsSync(join(project, "build/session.json"))).toBe(false);
    expect((await command(["clean"], project)).status).toBe(0);
    expect(existsSync(join(project, "build"))).toBe(false);
    expect(existsSync(sourcePath)).toBe(true);
    expect(existsSync(join(project, "mini.json"))).toBe(true);
    expect((await command(["clean"], project)).status).toBe(0);
    mkdirSync(join(temp, "keep"));
    symlinkSync(join(temp, "keep"), join(project, "build"), "dir");
    expect((await command(["clean"], project)).status).not.toBe(0);
    expect(existsSync(join(temp, "keep"))).toBe(true);
  } finally {
    child?.kill("SIGTERM");
    if (child) await child.exited;
    rmSync(temp, { recursive: true, force: true });
  }
}, 240000);
