import { createSignal } from "solid-js";
import { connectMiniApp, ServiceError, type NetworkState } from "@pocketjs/mini";

// Shared app state: SDK connection, routing, network, toasts and saved preferences.

export type Mini = ReturnType<typeof connectMiniApp>;
export type Tab = "weather" | "news" | "markets";
export type City = { name: string; country: string; lat: number; lon: number };
export type Prefs = { tab: Tab; city: City; base: string; amount: number; feed: string };

export const PAGES = ["/", "/cities", "/story", "/comment", "/currency"];
export const viewport = ((globalThis as any).__pjmWindow ?? { width: 390, height: 780 }) as { width: number; height: number };
export const DEG = "°";
export const DOT = " · ";
export const ELLIPSIS = "…";

let current: Mini | undefined;
export function sdk(): Mini {
  if (!current) throw new Error("SDK is not connected yet");
  return current;
}
/** Call once, after mount(). */
export function connect(): Mini {
  current = connectMiniApp({ pages: PAGES });
  return current;
}

export const [route, setRoute] = createSignal("/");
export const [query, setQuery] = createSignal<Readonly<Record<string, string>>>({});
export const [tab, setTab] = createSignal<Tab>("weather");
export const [network, setNetwork] = createSignal<NetworkState | undefined>();
export const [now, setNow] = createSignal(Date.now());
export const [toast, setToast] = createSignal("");
export const online = () => network()?.connected !== false;

let toastSerial = 0;
export function notify(text: string) {
  const serial = ++toastSerial;
  setToast(text);
  sdk().after(180, () => { if (serial === toastSerial) setToast(""); });
}

export function describe(error: unknown): string {
  if (error instanceof ServiceError) {
    if (error.code === "DENIED") return "Not allowed (permission or domain policy)";
    if (error.code === "CANCELLED") return "Cancelled";
    if (error.code === "TIMEOUT") return "Timed out";
    if (error.code === "BUSY") return "Too many requests, try again shortly";
    if (error.code === "UNSUPPORTED") return "Not supported on this host";
    if (error.code === "FAILED") return online() ? "Network request failed" : "You are offline";
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function ago(ms: number): string {
  const seconds = Math.max(0, Math.round((now() - ms) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function fmt(value: number, digits: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split(".");
  let grouped = "";
  for (let index = 0; index < whole.length; index++) {
    if (index && (whole.length - index) % 3 === 0) grouped += ",";
    grouped += whole[index];
  }
  return (value < 0 ? "-" : "") + grouped + (fraction ? `.${fraction}` : "");
}
/** Fewer decimals for larger numbers, like a finance app. */
export function smart(value: number): string {
  const size = Math.abs(value);
  return fmt(value, size >= 1000 ? 0 : size >= 100 ? 1 : size >= 10 ? 2 : size >= 1 ? 3 : 4);
}
export function percent(ratio: number): string {
  return `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(2)}%`;
}

// ---- preferences: one storage key, well under the 2 KiB value limit ---------

const PREFS_KEY = "pulse.prefs";
export const DEFAULT_CITY: City = { name: "London", country: "United Kingdom", lat: 51.51, lon: -0.13 };
const DEFAULT_PREFS: Prefs = { tab: "weather", city: DEFAULT_CITY, base: "USD", amount: 1, feed: "top" };
export const [prefs, setPrefs] = createSignal<Prefs>(DEFAULT_PREFS);

function validCity(value: unknown): value is City {
  const city = value as City;
  return !!city && typeof city.name === "string" && typeof city.country === "string"
    && Number.isFinite(city.lat) && Number.isFinite(city.lon);
}

export async function loadPrefs() {
  try {
    const stored = await sdk().storage.get<Partial<Prefs>>(PREFS_KEY).promise;
    if (!stored || typeof stored !== "object") return;
    setPrefs({
      tab: stored.tab === "news" || stored.tab === "markets" ? stored.tab : "weather",
      city: validCity(stored.city) ? stored.city : DEFAULT_CITY,
      base: typeof stored.base === "string" && /^[A-Z]{3}$/.test(stored.base) ? stored.base : "USD",
      amount: typeof stored.amount === "number" && stored.amount > 0 ? stored.amount : 1,
      feed: typeof stored.feed === "string" ? stored.feed : "top",
    });
  } catch (error) { notify(`Could not load settings: ${describe(error)}`); }
}

export function updatePrefs(patch: Partial<Prefs>) {
  const next = { ...prefs(), ...patch };
  setPrefs(next);
  sdk().storage.set(PREFS_KEY, next).promise.catch(error => notify(`Could not save settings: ${describe(error)}`));
}
