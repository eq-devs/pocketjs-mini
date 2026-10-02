// Test fixture only: mutate a disposable app while the real Flutter host runs.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const project = resolve(Bun.argv[2]!);
const path = resolve(project, "app/main.tsx");
const original = readFileSync(path, "utf8");
const token = randomBytes(16).toString("hex");
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
  const action = new URL(request.url).pathname;
  if (request.method !== "POST" || !action.startsWith(`/${token}/`)) return new Response("Not found", { status: 404 });
  const source = {
    "saved": original.replace("Hello PocketJS Mini", "Saved in TSX"),
    "compile-error": "this is not TypeScript",
    "runtime-error": 'throw new Error("Intentional guest failure");\n' + original,
    "restore": original,
  }[action.slice(token.length + 2)];
  if (source === undefined) return new Response("Not found", { status: 404 });
  writeFileSync(path, source);
  return new Response("ok");
} });
writeFileSync(resolve(project, ".pjm/control.json"), JSON.stringify({ url: `http://127.0.0.1:${server.port}/${token}/` }));
function stop() { writeFileSync(path, original); server.stop(true); process.exit(0); }
process.on("SIGTERM", stop); process.on("SIGINT", stop);
