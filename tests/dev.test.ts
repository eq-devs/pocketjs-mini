import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
    const command = Bun.spawn([pjm, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
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
    const state = () => fetch(`${session.url}state`).then(r => r.json()) as Promise<{ revision: number; error: string | null }>;
    const ready = await until(state, value => value.revision > 0 && !value.error);
    expect(existsSync(join(project, "build/hello.pocket"))).toBe(true);
    expect((await fetch(`${session.url}${ready.revision}/app.js`)).status).toBe(200);
    expect((await fetch(`${session.url}../state`)).status).toBe(404);
    expect((await fetch(`${session.url}99999/app.js`)).status).toBe(404);
    expect((await command(["run"], project)).status).not.toBe(0); // duplicate session refused
    expect((await command(["clean"], project)).status).not.toBe(0);
    const sourcePath = join(project, "app/main.tsx");
    const original = readFileSync(sourcePath, "utf8");
    writeFileSync(sourcePath, 'this is not TypeScript');
    const broken = await until(state, value => !!value.error);
    expect(broken.revision).toBe(ready.revision);
    expect(broken.error).toContain("TS");
    writeFileSync(sourcePath, original.replace("Hello PocketJS Mini", "Saved edit"));
    const fixed = await until(state, value => value.revision > ready.revision && !value.error);
    expect((await (await fetch(`${session.url}${fixed.revision}/app.js`)).text()).includes("Saved edit")).toBe(true);
    writeFileSync(join(project, "assets/new.txt"), "asset change");
    const assets = await until(state, value => value.revision > fixed.revision && !value.error);
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
