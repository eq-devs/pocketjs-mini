import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, networkInterfaces } from "node:os";

export interface Phone { kind: "simulator" | "physical"; name: string; udid: string; id: string; state?: string; team?: string; host: string; }
async function readCommand(args: string[]) {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => child.kill(), 30000);
  try {
    const [code, out, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (code !== 0) throw new Error(`${args.join(" ")} failed: ${error}`);
    return out;
  } finally { clearTimeout(timer); }
}
export function physicalPhones(inventory: any): any[] {
  return (inventory.result?.devices ?? []).filter((d: any) => d.hardwareProperties?.deviceType === "iPhone"
    && d.connectionProperties?.tunnelState === "connected");
}
export function lanAddress(addresses: ReturnType<typeof networkInterfaces>, preferred?: string): string {
  const candidates = Object.values(addresses).flat().filter(a => a && !a.internal && a.family === "IPv4"
    && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address));
  if (preferred) {
    if (!candidates.some(a => a!.address === preferred)) throw new Error("PJM_HOST must be this Mac's private LAN IPv4 address");
    return preferred;
  }
  const unique = [...new Set(candidates.map(a => a!.address))];
  if (unique.length !== 1) throw new Error("Set PJM_HOST to this Mac's Wi-Fi/LAN IPv4 address; the phone must use the same network");
  return unique[0]!;
}
export async function selectPhone(requested: string): Promise<Phone> {
  const inventory = JSON.parse(await readCommand(["xcrun", "simctl", "list", "devices", "available", "-j"]));
  const sims: any[] = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes(".iOS-"))
    .flatMap(([, devices]) => devices as any[]).filter(d => d.name.startsWith("iPhone"));
  const matches = requested ? sims.filter(d => d.udid === requested || d.name === requested) : [];
  if (matches.length > 1) throw new Error("Multiple simulators have that name; use a simulator UUID");
  if (matches.length === 1) return { ...matches[0], id: matches[0].udid, kind: "simulator", host: "127.0.0.1" };
  const directory = mkdtempSync(join(tmpdir(), "pjm-devices-"));
  let connected: any[] = [];
  try {
    const path = join(directory, "devices.json");
    await readCommand(["xcrun", "devicectl", "list", "devices", "--json-output", path]);
    connected = physicalPhones(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) { if (requested) throw error; }
  finally { rmSync(directory, { recursive: true, force: true }); }
  const phones = requested ? connected.filter(d => [d.identifier, d.hardwareProperties.udid, d.deviceProperties.name].includes(requested)) : connected;
  if (phones.length > 1) throw new Error("Multiple connected iPhones; use pjm run -d <device identifier>");
  if (phones.length === 1) {
    const d = phones[0];
    if (d.deviceProperties.developerModeStatus !== "enabled") throw new Error("Enable Developer Mode on the iPhone first");
    const team = process.env.PJM_TEAM ?? "";
    if (!/^[A-Z0-9]{10}$/.test(team)) throw new Error("Set PJM_TEAM to your Xcode signing Team ID (10 characters) for a physical iPhone");
    return { kind: "physical", name: d.deviceProperties.name, id: d.identifier, udid: d.hardwareProperties.udid,
      team, host: lanAddress(networkInterfaces(), process.env.PJM_HOST) };
  }
  const sim = requested ? undefined : sims.find(d => d.state === "Booted") ?? sims[sims.length - 1];
  if (!sim) throw new Error("No available iPhone matches the requested device. Connect/unlock your phone or install an iOS simulator in Xcode.");
  return { ...sim, id: sim.udid, kind: "simulator", host: "127.0.0.1" };
}
