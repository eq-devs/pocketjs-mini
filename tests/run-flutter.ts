// Bound a mobile simulator launch; retry only infrastructure timeouts, never failed assertions.
const args = Bun.argv.slice(2);
const device = args[args.indexOf("-d") + 1];
const mobile = /^[0-9A-F-]{36}$/i.test(device ?? "");
const limit = Number(process.env.PJM_FLUTTER_TIMEOUT_MS ?? 480000);
let child: ReturnType<typeof Bun.spawn> | undefined;
function stop() {
  if (!child) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
}
process.on("SIGTERM", () => { stop(); process.exit(143); });
process.on("SIGINT", () => { stop(); process.exit(130); });
async function execute(command: string[], timeout: number) {
  let timedOut = false;
  child = Bun.spawn(command, { stdout: "inherit", stderr: "inherit", detached: true });
  const timer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-child!.pid, "SIGKILL"); } catch { child!.kill("SIGKILL"); }
  }, timeout);
  const status = await child.exited;
  clearTimeout(timer); child = undefined;
  return { status, timedOut };
}
const command = ["flutter", "test", ...args, "--reporter=expanded"];
let result = await execute(command, limit);
if (result.timedOut && mobile) {
  console.error("iPhone simulator launch timed out; restarting it once before retrying acceptance.");
  await execute(["xcrun", "simctl", "shutdown", device!], 30000);
  const boot = await execute(["xcrun", "simctl", "boot", device!], 30000);
  if (boot.status !== 0) process.exit(boot.status || 1);
  const ready = await execute(["xcrun", "simctl", "bootstatus", device!, "-b"], 120000);
  if (ready.status !== 0) process.exit(ready.status || 1);
  result = await execute(command, limit);
}
if (result.timedOut) console.error("Flutter acceptance exceeded its timeout.");
process.exit(result.timedOut ? 124 : result.status);
