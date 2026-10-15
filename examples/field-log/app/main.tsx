import { createSignal, Show } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";
import { connectMiniApp, ServiceError, type DeviceInfo, type NetworkState } from "@pocketjs/mini";

// Field Log: four pages in one guest, persisted entries, and every SDK service.
// Entries are stored under one key; storage values are limited to 2 KiB of JSON.

type Entry = { id: number; kind: string; at: number; lat?: number; lon?: number; acc?: number; photo?: string };
type Stored = { next: number; entries: Entry[] };
type Cancelable = { cancel(): void };

const STORAGE_KEY = "field-log.v1";
const STORAGE_BUDGET = 1900;
const KINDS = ["Coffee", "Walk", "Idea", "Meeting"];
const KIND_CLASS: Record<string, string> = {
  Coffee: "flex-1 bg-amber-600 rounded-xl p-4 items-center justify-center active:bg-amber-500",
  Walk: "flex-1 bg-emerald-600 rounded-xl p-4 items-center justify-center active:bg-emerald-500",
  Idea: "flex-1 bg-violet-600 rounded-xl p-4 items-center justify-center active:bg-violet-500",
  Meeting: "flex-1 bg-sky-600 rounded-xl p-4 items-center justify-center active:bg-sky-500",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const viewport = ((globalThis as any).__pjmWindow ?? { width: 390, height: 780 }) as { width: number; height: number };

const [route, setRoute] = createSignal("/");
const [query, setQuery] = createSignal<Readonly<Record<string, string>>>({});
const [entries, setEntries] = createSignal<Entry[]>([]);
const [loaded, setLoaded] = createSignal(false);
const [device, setDevice] = createSignal<DeviceInfo | undefined>();
const [network, setNetwork] = createSignal<NetworkState | undefined>();
const [toast, setToast] = createSignal("");
const [busy, setBusy] = createSignal("");
const [clearArmed, setClearArmed] = createSignal(false);
const [zen, setZen] = createSignal("Not fetched yet");
const [download, setDownload] = createSignal("Not downloaded yet");
const [pasted, setPasted] = createSignal("Nothing pasted yet");
let mini: ReturnType<typeof connectMiniApp>;
let nextId = 1;
let toastSerial = 0;
let inFlight: Cancelable | undefined;

// ---- helpers ---------------------------------------------------------------

function describe(error: unknown): string {
  if (error instanceof ServiceError) {
    if (error.code === "DENIED") return "permission denied";
    if (error.code === "CANCELLED") return "cancelled";
    if (error.code === "TIMEOUT") return "timed out";
    if (error.code === "UNSUPPORTED") return "not supported on this host";
    if (error.code === "BUSY") return "busy, try again";
    return `${error.code.toLowerCase()}: ${error.message}`;
  }
  return String(error);
}

function notify(text: string) {
  const serial = ++toastSerial;
  setToast(text);
  mini.after(150, () => { if (serial === toastSerial) setToast(""); });
}

/** Runs one native operation at a time and reports failures as a toast. */
async function guarded(label: string, work: () => Promise<void>) {
  if (busy()) return notify(`Wait for ${busy()} to finish`);
  setBusy(label);
  try { await work(); }
  catch (error) { notify(`${label}: ${describe(error)}`); }
  finally { setBusy(""); inFlight = undefined; }
}

// QuickJS guests have no atob/TextDecoder; decode the protocol's base64 here.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeBase64(text: string): number[] {
  const bytes: number[] = [];
  let buffer = 0, bits = 0;
  for (const character of text) {
    if (character === "=") break;
    buffer = (buffer << 6) | ALPHABET.indexOf(character);
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 0xff); }
  }
  return bytes;
}
function decodeUtf8(bytes: number[]): string {
  let text = "";
  for (let index = 0; index < bytes.length;) {
    const lead = bytes[index++];
    const extra = lead >= 0xf0 ? 3 : lead >= 0xe0 ? 2 : lead >= 0xc0 ? 1 : 0;
    let code = extra ? lead & (0x3f >> extra) : lead;
    for (let step = 0; step < extra; step++) code = (code << 6) | (bytes[index++] & 0x3f);
    text += String.fromCodePoint(code);
  }
  return text;
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => (value < 10 ? "0" : "") + value;
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatKb(bytes: number): string { return `${(bytes / 1024).toFixed(1)} KB`; }
function networkLabel(state: NetworkState | undefined): string {
  if (!state || state.connected === null) return "network ?";
  if (!state.connected) return "offline";
  return state.expensive ? `${state.type} (metered)` : state.type;
}

// ---- persistence -----------------------------------------------------------

function newestFirst(): Entry[] { return [...entries()].sort((a, b) => b.at - a.at); }
function entryById(id: number): Entry | undefined { return entries().find(entry => entry.id === id); }

async function load() {
  try {
    const stored = await mini.storage.get<Stored>(STORAGE_KEY).promise;
    if (stored && Array.isArray(stored.entries) && Number.isSafeInteger(stored.next)) {
      setEntries(stored.entries.filter(entry => entry && typeof entry.id === "number" && typeof entry.kind === "string"));
      nextId = stored.next;
    }
  } catch (error) { notify(`Load failed: ${describe(error)}`); }
  setLoaded(true);
}

/** Drops the oldest entries until the record fits the storage value limit. */
async function save(list: Entry[]) {
  let kept = [...list].sort((a, b) => b.at - a.at);
  while (kept.length && JSON.stringify({ next: nextId, entries: kept }).length > STORAGE_BUDGET) kept = kept.slice(0, -1);
  if (kept.length < list.length) notify(`Storage full: dropped ${list.length - kept.length} old entr${list.length - kept.length === 1 ? "y" : "ies"}`);
  setEntries(kept);
  try { await mini.storage.set(STORAGE_KEY, { next: nextId, entries: kept }).promise; }
  catch (error) { notify(`Save failed: ${describe(error)}`); }
}

function updateEntry(id: number, change: (entry: Entry) => Entry) {
  return save(entries().map(entry => (entry.id === id ? change(entry) : entry)));
}

// ---- actions ---------------------------------------------------------------

function addEntry(kind: string) {
  const entry: Entry = { id: nextId++, kind, at: Date.now() };
  save([entry, ...entries()]);
  notify(`Logged ${kind}`);
}

function clearAll() {
  if (!clearArmed()) {
    setClearArmed(true);
    mini.after(180, () => setClearArmed(false));
    return;
  }
  setClearArmed(false);
  save([]);
  notify("Log cleared");
}

function tagLocation(id: number) {
  return guarded("Location", async () => {
    const request = mini.location.get({ timeoutMs: 10000, maximumAgeMs: 30000 });
    inFlight = request;
    const position = await request.promise;
    await updateEntry(id, entry => ({
      ...entry,
      lat: Math.round(position.latitude * 1e5) / 1e5,
      lon: Math.round(position.longitude * 1e5) / 1e5,
      acc: Math.round(position.accuracyMeters),
    }));
    notify("Location tagged");
  });
}

function attachPhoto(id: number) {
  return guarded("Photo", async () => {
    const request = mini.media.select({ source: "library", maxDimension: 512, quality: 70 });
    inFlight = request;
    const image = await request.promise;
    try {
      // Native bytes stay outside JSON; read only the header to prove the handle works.
      const head = await mini.resources.read({ handle: image.resource.handle, offset: 0, count: 4 }).promise;
      const bytes = decodeBase64(head.bodyBase64);
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const summary = `${image.width}x${image.height}, ${formatKb(image.resource.size)}${jpeg ? "" : " (bad header)"}`;
      await updateEntry(id, entry => ({ ...entry, photo: summary }));
      notify("Photo attached");
    } finally {
      await mini.resources.release(image.resource.handle).promise.catch(() => undefined);
    }
  });
}

function copyEntry(entry: Entry) {
  return guarded("Copy", async () => {
    const where = entry.lat === undefined ? "" : ` @ ${entry.lat},${entry.lon}`;
    await mini.clipboard.write(`${entry.kind} - ${formatTime(entry.at)}${where}`).promise;
    notify("Copied to clipboard");
  });
}

function deleteEntry(id: number) {
  save(entries().filter(entry => entry.id !== id));
  mini.navigation.back();
  notify("Entry deleted");
}

function fetchZen() {
  return guarded("Zen", async () => {
    const request = mini.http({ url: "https://api.github.com/zen", headers: { "User-Agent": "pocketjs-mini-field-log", Accept: "text/plain" } });
    inFlight = request;
    const response = await request.promise;
    const body = response.bodyBase64 === undefined ? "" : decodeUtf8(decodeBase64(response.bodyBase64)).trim();
    setZen(response.status === 200 ? `"${body}"` : `HTTP ${response.status}`);
  });
}

/** Streams a page through a native resource handle in 1536-byte chunks. */
function downloadPage() {
  return guarded("Download", async () => {
    const request = mini.http({ url: "https://example.com/", responseMode: "resource" });
    inFlight = request;
    const response = await request.promise;
    if (!response.resource) throw new ServiceError("PROTOCOL", "Expected a resource response");
    const { handle, size } = response.resource;
    try {
      const kept: number[] = [];
      let offset = 0, chunks = 0;
      while (offset < size) {
        const read = mini.resources.read({ handle, offset, count: 1536 });
        inFlight = read;
        const chunk = await read.promise;
        const bytes = decodeBase64(chunk.bodyBase64);
        if (kept.length < 16384) kept.push(...bytes);
        offset = chunk.nextOffset;
        chunks++;
        setDownload(`HTTP ${response.status} - ${offset}/${size} bytes, ${chunks} chunk${chunks === 1 ? "" : "s"}`);
        if (chunk.eof) break;
      }
      const title = /<title>([^<]*)<\/title>/i.exec(decodeUtf8(kept));
      setDownload(`HTTP ${response.status} - ${formatKb(size)} in ${chunks} chunk${chunks === 1 ? "" : "s"} - title: ${title ? title[1].trim() : "none"}`);
    } finally {
      await mini.resources.release(handle).promise.catch(() => undefined);
    }
  });
}

function pasteClipboard() {
  return guarded("Paste", async () => {
    const text = await mini.clipboard.read().promise;
    setPasted(text.length ? text.slice(0, 120) : "(clipboard is empty)");
  });
}

function cancelInFlight() {
  if (!inFlight) return notify("Nothing to cancel");
  inFlight.cancel();
}

// ---- UI --------------------------------------------------------------------

function Button(props: { label: string; onPress: () => void; tone?: "primary" | "danger" | "quiet" }) {
  const tone = () => props.tone ?? "quiet";
  return <View focusable onPress={() => props.onPress()} class={
    tone() === "primary" ? "w-full bg-blue-600 rounded-xl p-4 items-center justify-center active:bg-blue-500"
      : tone() === "danger" ? "w-full bg-rose-700 rounded-xl p-4 items-center justify-center active:bg-rose-600"
        : "w-full bg-slate-700 rounded-xl p-4 items-center justify-center active:bg-slate-600"
  }>
    <Text class="text-white text-base">{props.label}</Text>
  </View>;
}

function Header(props: { title: string; back?: boolean }) {
  return <View class="w-full flex-row items-center justify-between gap-2" style={{ height: 44 }}>
    <Show when={props.back} fallback={<Text class="text-white text-2xl font-bold">{props.title}</Text>}>
      <View class="flex-row items-center gap-3">
        <View focusable onPress={() => mini.navigation.back()} class="bg-slate-800 rounded-lg px-3 py-2 active:bg-slate-700">
          <Text class="text-cyan-400 text-sm">Back</Text>
        </View>
        <Text class="text-white text-xl font-bold">{props.title}</Text>
      </View>
    </Show>
    <View class={network()?.connected === false ? "bg-rose-900 rounded-lg px-3 py-1" : "bg-slate-800 rounded-lg px-3 py-1"}>
      <Text class="text-slate-300 text-xs">{networkLabel(network())}</Text>
    </View>
  </View>;
}

function Card(props: { title: string; children: any }) {
  return <View class="w-full flex-col gap-1 bg-slate-800 rounded-xl p-4">
    <Text class="text-slate-400 text-xs">{props.title}</Text>
    {props.children}
  </View>;
}

function HomePage() {
  const located = () => entries().filter(entry => entry.lat !== undefined).length;
  const latest = () => newestFirst()[0];
  return <View class="w-full flex-col gap-3">
    <Header title="Field Log" />
    <Card title="DEVICE">
      <Text class="text-white text-base">{device() ? `${device()!.platform} - ${device()!.model}` : "Loading device info..."}</Text>
      <Show when={device()}>
        <Text class="text-slate-400 text-sm">{`${device()!.width}x${device()!.height} logical @${device()!.density}x - safe ${device()!.safeTop}/${device()!.safeBottom}`}</Text>
      </Show>
    </Card>
    <Card title="LOG">
      <Text class="text-white text-base">{loaded() ? `${entries().length} entr${entries().length === 1 ? "y" : "ies"}, ${located()} with location` : "Loading log..."}</Text>
      <Text class="text-slate-400 text-sm">{latest() ? `Latest: ${latest()!.kind} at ${formatTime(latest()!.at)}` : "Nothing logged yet"}</Text>
    </Card>
    <Text class="text-slate-400 text-xs">QUICK LOG</Text>
    <View class="w-full flex-row gap-2">
      {KINDS.slice(0, 2).map(kind => <View focusable onPress={() => addEntry(kind)} class={KIND_CLASS[kind]}>
        <Text class="text-white text-base">{kind}</Text>
      </View>)}
    </View>
    <View class="w-full flex-row gap-2">
      {KINDS.slice(2).map(kind => <View focusable onPress={() => addEntry(kind)} class={KIND_CLASS[kind]}>
        <Text class="text-white text-base">{kind}</Text>
      </View>)}
    </View>
    <Button tone="primary" label={`Open log (${entries().length})`} onPress={() => mini.navigation.push("/log")} />
    <Button label="Services lab" onPress={() => mini.navigation.push("/lab")} />
  </View>;
}

function LogPage() {
  const rows = () => newestFirst();
  const listHeight = () => Math.max(160, (device()?.height ?? viewport.height) - 210);
  return <View class="w-full flex-col gap-3">
    <Header title="Log" back />
    <Show when={rows().length} fallback={<Text class="text-slate-400 text-base">No entries. Use Quick log on the home page.</Text>}>
      <VirtualList count={rows().length} rowHeight={60} height={listHeight()} overscan={120}
        onRowPress={index => { const entry = rows()[index]; if (entry) mini.navigation.push("/entry", { id: String(entry.id) }); }}
        renderRow={index => <View class="w-full flex-row items-center justify-between px-4 bg-slate-800 active:bg-slate-700" style={{ height: 60 }}>
          <View class="flex-col">
            <Text class="text-white text-base">{rows()[index]?.kind ?? ""}</Text>
            <Text class="text-slate-400 text-xs">{rows()[index] ? formatTime(rows()[index].at) : ""}</Text>
          </View>
          <Text class="text-cyan-400 text-xs">{rows()[index] ? `${rows()[index].lat !== undefined ? "GPS " : ""}${rows()[index].photo ? "PHOTO" : ""}` : ""}</Text>
        </View>} />
    </Show>
    <Button tone="danger" label={clearArmed() ? "Tap again to clear everything" : "Clear all"} onPress={clearAll} />
  </View>;
}

function EntryPage() {
  const entry = () => entryById(Number(query().id));
  return <View class="w-full flex-col gap-3">
    <Header title="Entry" back />
    <Show when={entry()} fallback={<Text class="text-slate-400 text-base">This entry no longer exists.</Text>}>
      <Card title={`#${entry()!.id}`}>
        <Text class="text-white text-2xl font-bold">{entry()!.kind}</Text>
        <Text class="text-slate-400 text-sm">{formatTime(entry()!.at)}</Text>
      </Card>
      <Card title="LOCATION">
        <Text class="text-white text-base">{entry()!.lat === undefined ? "Not tagged" : `${entry()!.lat}, ${entry()!.lon}`}</Text>
        <Show when={entry()!.acc !== undefined}><Text class="text-slate-400 text-sm">{`accuracy ${entry()!.acc} m`}</Text></Show>
      </Card>
      <Card title="PHOTO">
        <Text class="text-white text-base">{entry()!.photo ?? "None attached"}</Text>
      </Card>
      <Button tone="primary" label={busy() === "Location" ? "Locating..." : "Tag current location"} onPress={() => tagLocation(entry()!.id)} />
      <Button label={busy() === "Photo" ? "Choosing photo..." : "Attach photo from library"} onPress={() => attachPhoto(entry()!.id)} />
      <Button label="Copy summary" onPress={() => copyEntry(entry()!)} />
      <Button tone="danger" label="Delete entry" onPress={() => deleteEntry(entry()!.id)} />
    </Show>
  </View>;
}

function LabPage() {
  return <View class="w-full flex-col gap-3">
    <Header title="Services lab" back />
    <Card title="HTTPS INLINE - api.github.com/zen">
      <Text class="text-white text-sm">{zen()}</Text>
    </Card>
    <Button tone="primary" label={busy() === "Zen" ? "Fetching..." : "Fetch zen"} onPress={fetchZen} />
    <Card title="HTTPS RESOURCE STREAM - example.com">
      <Text class="text-white text-sm">{download()}</Text>
    </Card>
    <Button tone="primary" label={busy() === "Download" ? "Downloading..." : "Stream page"} onPress={downloadPage} />
    <Card title="CLIPBOARD READ (needs consent)">
      <Text class="text-white text-sm">{pasted()}</Text>
    </Card>
    <Button label="Paste" onPress={pasteClipboard} />
    <Show when={busy()}><Button tone="danger" label={`Cancel ${busy()}`} onPress={cancelInFlight} /></Show>
  </View>;
}

function App() {
  return <View class="w-full h-full flex-col bg-slate-900 p-4 gap-3">
    <Show when={route() === "/"}><HomePage /></Show>
    <Show when={route() === "/log"}><LogPage /></Show>
    <Show when={route() === "/entry"}><EntryPage /></Show>
    <Show when={route() === "/lab"}><LabPage /></Show>
    <Show when={toast()}>
      <View class="w-full bg-cyan-700 rounded-xl p-3 items-center">
        <Text class="text-white text-sm">{toast()}</Text>
      </View>
    </Show>
  </View>;
}

mount(() => <App />);
mini = connectMiniApp({ pages: ["/", "/log", "/entry", "/lab"] });
const follow = () => { const top = mini.navigation.current; setRoute(top.path); setQuery(top.query); };
mini.navigation.subscribe(follow);
follow();

load();
mini.deviceInfo().promise.then(info => setDevice(info), error => notify(`Device info: ${describe(error)}`));
mini.network.watch(state => setNetwork(state)).promise.then(state => setNetwork(state), error => notify(`Network: ${describe(error)}`));
mini.onLifecycle("show", () => { mini.network.get().promise.then(state => setNetwork(state), () => undefined); });
mini.onLifecycle("hide", () => { if (busy()) cancelInFlight(); });
