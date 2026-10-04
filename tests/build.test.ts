import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, symlinkSync, existsSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync } from "node:crypto";
import { verifyPackage } from "../container/package.ts";

test("public check/build use actual compiler artifacts and authenticated release metadata", async () => {
  const temp = mkdtempSync(join(tmpdir(), "pjm-release-")), project = join(temp, "release-app");
  const cli = resolve(import.meta.dir, "../bin/mp");
  async function run(args: string[], cwd = project) {
    const child = Bun.spawn([cli, ...args], { cwd, env: { ...process.env, PJM_TEST_SERVER: "1" }, stdout: "pipe", stderr: "pipe" });
    const [status, out, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    return { status, out, error };
  }
  try {
    expect((await run(["create", "release-app"], temp)).status).toBe(0);
    const cached = process.env.PJM_TEST_UPSTREAM ?? resolve(import.meta.dir, "../examples/hello/.pjm/pocketjs");
    if (existsSync(join(cached, ".git"))) {mkdirSync(join(project, ".pjm"));symlinkSync(resolve(cached), join(project, ".pjm/pocketjs"), "dir");}
    const check = await run(["check", "--device", "android"]);
    expect(check.status).toBe(0);expect(check.out).toContain("container declarations");
    const sourcePath=join(project,"app/main.tsx"), originalSource=readFileSync(sourcePath,"utf8");
    const originalConfig=readFileSync(join(project,"tsconfig.json"),"utf8");
    writeFileSync(sourcePath,'import { connectMiniApp } from "@pocketjs/mini";\n'+originalSource+'\nconst mini = connectMiniApp(); mini.after(1, () => {});\n');
    expect(readdirSync(join(project, "build"))).toEqual([]);
    const build = await run(["build", "--device", "android", "--width", "360", "--height", "598", "--density", "3"]);
    expect(build.status).toBe(0);
    const upstream = join(project, ".pjm/pocketjs");
    const { decodePocketPackage, POCKET_SECTION } = await import(join(upstream, "contracts/spec/pocket-package.ts"));
    const decoded = decodePocketPackage(readFileSync(join(project, "build/release-app.pocket")));
    expect(decoded.variants[0].target).toBe("pjm-android");
    const js = new TextDecoder().decode(decoded.variants[0].sections.find((section: any) => section.kind === POCKET_SECTION.js).bytes);
    expect(js).toContain('globalThis.__pjmWindow={"width":360,"height":598,"density":3');
    expect(js.match(/globalThis\.__pjmWindow=/g)?.length).toBe(1);
    expect(js).toContain("device.info.v1");
    expect(readFileSync(join(project,"tsconfig.json"),"utf8")).toBe(originalConfig);
    expect((await run(["build", "--release"])).status).not.toBe(0);
    const keys = generateKeyPairSync("ed25519"), path = join(temp, "key.pem");
    writeFileSync(path, keys.privateKey.export({ format: "pem", type: "pkcs8" }), {mode:0o600});
    writeFileSync(join(project, "container.json"), JSON.stringify({ pages: ["/", "/detail"], permissions: ["media"], domains: ["api.example.com"] }));
    const release = await run(["build", "--release", "--device", "android", "--key", path]);
    expect(release.status).toBe(0);
    const directory = join(project, "build/release-app-android.release");
    expect(readdirSync(directory).sort()).toEqual(["main.pocket", "manifest.json"]);
    const payload = readFileSync(join(directory, "main.pocket")), manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    expect(verifyPackage(payload, manifest, keys.publicKey, {abi:7,target:"pjm-android"}).permissions).toEqual(["media"]);
    expect(manifest.appId).toBe("dev.pjm.release-app");
    expect((await run(["build", "--release", "--device", "android", "--key", path])).status).not.toBe(0);
    expect(readFileSync(join(directory, "main.pocket"))).toEqual(payload);
    writeFileSync(join(project, "container.json"), '{"permissions":["root"]}');
    expect((await run(["check"])).status).not.toBe(0);
    expect((await run(["check", "--density", "0"])).status).not.toBe(0);
    const source = join(project, "app/main.tsx");writeFileSync(source, "invalid TSX here");
    expect((await run(["check"])).status).not.toBe(0);
  } finally {rmSync(temp, {recursive:true,force:true});}
}, 180000);
