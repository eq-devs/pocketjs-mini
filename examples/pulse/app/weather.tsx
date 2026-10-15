import { createSignal, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";
import { fetchJson } from "./net.ts";
import { ago, DEG, describe, DOT, notify, prefs, sdk, updatePrefs, type City } from "./state.ts";
import { Button, contentWidth, ErrorCard, GAP, Header, HEADER, pageHeight, Skeleton, SmallButton, Stat } from "./ui.tsx";

// Open-Meteo forecast: no API key. The latest result is saved for offline launches.

type Hour = { h: string; t: number; c: number; r: number };
type Day = { d: string; c: number; x: number; n: number; r: number };
type Weather = { city: string; at: number; day: boolean; t: number; f: number; hu: number; w: number; c: number; uv: number; hours: Hour[]; days: Day[] };
type Raw = {
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: (number | null)[]; weather_code: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[]; uv_index_max: (number | null)[] };
};

export const CITIES: City[] = [
  { name: "Almaty", country: "Kazakhstan", lat: 43.24, lon: 76.89 },
  { name: "Astana", country: "Kazakhstan", lat: 51.17, lon: 71.45 },
  { name: "Beijing", country: "China", lat: 39.9, lon: 116.4 },
  { name: "Berlin", country: "Germany", lat: 52.52, lon: 13.4 },
  { name: "Dubai", country: "United Arab Emirates", lat: 25.2, lon: 55.27 },
  { name: "Istanbul", country: "Turkey", lat: 41.01, lon: 28.98 },
  { name: "London", country: "United Kingdom", lat: 51.51, lon: -0.13 },
  { name: "New York", country: "United States", lat: 40.71, lon: -74.01 },
  { name: "Paris", country: "France", lat: 48.86, lon: 2.35 },
  { name: "Reykjavik", country: "Iceland", lat: 64.15, lon: -21.94 },
  { name: "San Francisco", country: "United States", lat: 37.77, lon: -122.42 },
  { name: "Seoul", country: "South Korea", lat: 37.57, lon: 126.98 },
  { name: "Singapore", country: "Singapore", lat: 1.29, lon: 103.85 },
  { name: "Sydney", country: "Australia", lat: -33.87, lon: 151.21 },
  { name: "Tokyo", country: "Japan", lat: 35.68, lon: 139.69 },
];

const STORAGE_KEY = "pulse.weather";
const HERO = 124, STATS = 56, HOURLY = 136, DAY_ROW = 40;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const [weather, setWeather] = createSignal<Weather | undefined>();
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal("");
const [locating, setLocating] = createSignal(false);

function condition(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return code >= 65 ? "Heavy rain" : "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown";
}
type Kind = "sun" | "moon" | "partly" | "partly-night" | "cloud" | "fog" | "rain" | "snow" | "storm";
function kind(code: number, day: boolean): Kind {
  if (code <= 1) return day ? "sun" : "moon";
  if (code === 2) return day ? "partly" : "partly-night";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return code >= 51 ? "rain" : "cloud";
}

function shape(raw: Raw, city: City): Weather {
  const hours = raw.hourly.time.slice(0, 24).map((time, index) => ({
    h: index === 0 ? "Now" : time.slice(11, 13),
    t: Math.round(raw.hourly.temperature_2m[index]),
    c: raw.hourly.weather_code[index],
    r: raw.hourly.precipitation_probability[index] ?? 0,
  }));
  const days = raw.daily.time.slice(0, 7).map((date, index) => ({
    d: index === 0 ? "Today" : WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()],
    c: raw.daily.weather_code[index],
    x: Math.round(raw.daily.temperature_2m_max[index]),
    n: Math.round(raw.daily.temperature_2m_min[index]),
    r: raw.daily.precipitation_probability_max[index] ?? 0,
  }));
  const now = raw.current;
  return {
    city: city.name, at: Date.now(), day: now.is_day === 1, t: Math.round(now.temperature_2m), f: Math.round(now.apparent_temperature),
    hu: Math.round(now.relative_humidity_2m), w: Math.round(now.wind_speed_10m), c: now.weather_code,
    uv: Math.round(raw.daily.uv_index_max[0] ?? 0), hours, days,
  };
}

export async function restoreWeather() {
  try {
    const saved = await sdk().storage.get<Weather>(STORAGE_KEY).promise;
    if (saved && Array.isArray(saved.hours) && Array.isArray(saved.days) && saved.city === prefs().city.name && !weather()) setWeather(saved);
  } catch { /* no saved forecast */ }
}

export async function loadWeather(force = false) {
  const city = prefs().city, current = weather();
  if (loading() || (!force && current && current.city === city.name && Date.now() - current.at < 10 * 60_000)) return;
  setLoading(true);
  setError("");
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat.toFixed(2)}&longitude=${city.lon.toFixed(2)}`
      + "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day"
      + "&hourly=temperature_2m,precipitation_probability,weather_code"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max"
      + "&timezone=auto&forecast_days=7&forecast_hours=24";
    const next = shape(await fetchJson<Raw>(url), city);
    if (prefs().city.name !== city.name) return; // the user picked another city meanwhile
    setWeather(next);
    sdk().storage.set(STORAGE_KEY, next).promise.catch(() => undefined);
  } catch (failure) {
    setError(describe(failure));
    if (weather()) notify(`Weather: ${describe(failure)}`);
  } finally {
    setLoading(false);
  }
}

// ---- drawn icons: a 72x72 scene, scaled down for list rows ------------------

function Cloud(props: { dark?: boolean }) {
  return <>
    <View class={props.dark ? "absolute left-[16] top-[22] w-[24] h-[24] rounded-full bg-slate-500" : "absolute left-[16] top-[22] w-[24] h-[24] rounded-full bg-slate-200"} />
    <View class={props.dark ? "absolute left-[30] top-[14] w-[30] h-[30] rounded-full bg-slate-500" : "absolute left-[30] top-[14] w-[30] h-[30] rounded-full bg-slate-200"} />
    <View class={props.dark ? "absolute left-[8] top-[32] w-[58] h-[24] rounded-full bg-slate-500" : "absolute left-[8] top-[32] w-[58] h-[24] rounded-full bg-slate-200"} />
  </>;
}
function Scene(props: { kind: Kind }) {
  const k = () => props.kind;
  return <>
    <Show when={k() === "sun"}><View class="absolute left-[14] top-[14] w-[44] h-[44] rounded-full bg-amber-400" /></Show>
    <Show when={k() === "moon"}><View class="absolute left-[16] top-[16] w-[40] h-[40] rounded-full bg-slate-200" /></Show>
    <Show when={k() === "partly"}><View class="absolute left-[34] top-[6] w-[30] h-[30] rounded-full bg-amber-400" /></Show>
    <Show when={k() === "partly-night"}><View class="absolute left-[36] top-[6] w-[26] h-[26] rounded-full bg-slate-300" /></Show>
    <Show when={k() === "partly" || k() === "partly-night" || k() === "cloud"}><Cloud /></Show>
    <Show when={k() === "rain" || k() === "snow" || k() === "storm"}><Cloud dark /></Show>
    <Show when={k() === "rain"}>
      <View class="absolute left-[20] top-[58] w-[4] h-[11] rounded-sm bg-sky-400 rotate-12" />
      <View class="absolute left-[34] top-[58] w-[4] h-[11] rounded-sm bg-sky-400 rotate-12" />
      <View class="absolute left-[48] top-[58] w-[4] h-[11] rounded-sm bg-sky-400 rotate-12" />
    </Show>
    <Show when={k() === "snow"}>
      <View class="absolute left-[19] top-[60] w-[8] h-[8] rounded-full bg-white" />
      <View class="absolute left-[33] top-[60] w-[8] h-[8] rounded-full bg-white" />
      <View class="absolute left-[47] top-[60] w-[8] h-[8] rounded-full bg-white" />
    </Show>
    <Show when={k() === "storm"}><View class="absolute left-[34] top-[50] w-[7] h-[18] bg-amber-400 rotate-12" /></Show>
    <Show when={k() === "fog"}>
      <View class="absolute left-[10] top-[22] w-[52] h-[6] rounded-sm bg-slate-400" />
      <View class="absolute left-[16] top-[34] w-[44] h-[6] rounded-sm bg-slate-400" />
      <View class="absolute left-[10] top-[46] w-[52] h-[6] rounded-sm bg-slate-400" />
    </Show>
  </>;
}
function WeatherIcon(props: { code: number; day: boolean; small?: boolean }) {
  return <View class={props.small ? "relative w-[24] h-[24]" : "relative w-[72] h-[72]"}>
    <View class={props.small ? "absolute left-0 top-0 w-[72] h-[72] origin-top-left scale-33" : "absolute left-0 top-0 w-[72] h-[72]"}>
      <Scene kind={kind(props.code, props.day)} />
    </View>
  </View>;
}

function barClass(temperature: number): string {
  if (temperature < 5) return "flex-1 rounded-sm bg-sky-400";
  if (temperature < 18) return "flex-1 rounded-sm bg-emerald-400";
  if (temperature < 27) return "flex-1 rounded-sm bg-amber-400";
  return "flex-1 rounded-sm bg-rose-500";
}

// ---- screens ----------------------------------------------------------------

function Hero(props: { data: Weather }) {
  const today = () => props.data.days[0];
  return <View style={{ height: HERO }} class={props.data.day
    ? "w-full flex-row items-center justify-between rounded-xl px-5 bg-gradient-to-b from-sky-600 to-indigo-800"
    : "w-full flex-row items-center justify-between rounded-xl px-5 bg-gradient-to-b from-indigo-900 to-slate-900"}>
    <View class="flex-col gap-1">
      <Text class="text-white text-4xl font-bold">{`${props.data.t}${DEG}`}</Text>
      <Text class="text-white text-base">{condition(props.data.c)}</Text>
      <Text class="text-sky-100 text-sm">{today() ? `H ${today().x}${DEG}  L ${today().n}${DEG}` : ""}</Text>
    </View>
    <WeatherIcon code={props.data.c} day={props.data.day} />
  </View>;
}

function Hourly(props: { data: Weather }) {
  const hours = () => props.data.hours;
  const low = () => Math.min(...hours().map(hour => hour.t)), high = () => Math.max(...hours().map(hour => hour.t));
  const height = (temperature: number) => Math.round(8 + ((temperature - low()) / (high() - low() || 1)) * 36);
  const marks = () => hours().filter((_, index) => index % 4 === 0);
  return <View class="w-full flex-col bg-slate-900 rounded-xl p-3 gap-2" style={{ height: HOURLY }}>
    <Text class="text-slate-400 text-xs">NEXT 24 HOURS</Text>
    <View class="w-full flex-row">{marks().map(hour => <View class="flex-1"><Text class="text-white text-xs">{`${hour.t}${DEG}`}</Text></View>)}</View>
    <View class="w-full flex-row items-end gap-[2]" style={{ height: 44 }}>
      {hours().map(hour => <View class={barClass(hour.t)} style={{ height: height(hour.t) }} />)}
    </View>
    <View class="w-full flex-row">{marks().map(hour => <View class="flex-1"><Text class="text-slate-400 text-xs">{hour.h}</Text></View>)}</View>
  </View>;
}

function Daily(props: { data: Weather }) {
  const days = () => props.data.days;
  const low = () => Math.min(...days().map(day => day.n)), high = () => Math.max(...days().map(day => day.x));
  const track = Math.max(48, contentWidth - 48 - 24 - 36 - 32 - 32 - 5 * 8 - 8);
  const listHeight = () => Math.max(DAY_ROW * 2, pageHeight() - HEADER - HERO - STATS - HOURLY - GAP * 4);
  return <VirtualList count={days().length} rowHeight={DAY_ROW} height={listHeight()} overscan={DAY_ROW * 2} focusRows={false}
    renderRow={index => {
      const day = () => days()[index];
      const left = () => day() ? Math.round(((day().n - low()) / (high() - low() || 1)) * track) : 0;
      const width = () => day() ? Math.max(6, Math.round(((day().x - day().n) / (high() - low() || 1)) * track)) : 0;
      return <View class="w-full flex-row items-center gap-2 px-1" style={{ height: DAY_ROW }}>
        <View class="w-[48]"><Text class="text-white text-sm">{day()?.d ?? ""}</Text></View>
        <Show when={day()}><WeatherIcon code={day()!.c} day small /></Show>
        <View class="w-[36]"><Text class="text-sky-400 text-xs">{day() && day()!.r >= 20 ? `${day()!.r}%` : ""}</Text></View>
        <View class="w-[32] flex-row justify-end"><Text class="text-slate-400 text-sm">{day() ? `${day()!.n}${DEG}` : ""}</Text></View>
        <View class="relative h-[6] rounded-sm bg-slate-800" style={{ width: track }}>
          <View class="absolute top-0 h-[6] rounded-sm bg-gradient-to-r from-sky-400 to-amber-400" style={{ insetL: left(), width: width() }} />
        </View>
        <View class="w-[32] flex-row justify-end"><Text class="text-white text-sm">{day() ? `${day()!.x}${DEG}` : ""}</Text></View>
      </View>;
    }} />;
}

export function WeatherTab() {
  const subtitle = () => {
    const data = weather();
    if (loading()) return "Updating...";
    return data ? `${prefs().city.country}${DOT}updated ${ago(data.at)}` : prefs().city.country;
  };
  return <View class="w-full flex-col gap-3">
    <Header title={prefs().city.name} subtitle={subtitle()} right={<>
      <SmallButton label="City" onPress={() => sdk().navigation.push("/cities")} />
      <SmallButton label="Refresh" disabled={loading()} onPress={() => loadWeather(true)} />
    </>} />
    <Show when={weather()} fallback={
      <Show when={error()} fallback={<>
        <Skeleton height={HERO} /><Skeleton height={STATS} /><Skeleton height={HOURLY} /><Skeleton height={DAY_ROW * 3} />
      </>}>
        <ErrorCard message={error()} onRetry={() => loadWeather(true)} />
      </Show>
    }>
      <Hero data={weather()!} />
      <View class="w-full flex-row gap-2" style={{ height: STATS }}>
        <Stat label="Feels like" value={`${weather()!.f}${DEG}`} />
        <Stat label="Humidity" value={`${weather()!.hu}%`} />
        <Stat label="Wind km/h" value={`${weather()!.w}`} />
        <Stat label="UV index" value={`${weather()!.uv}`} />
      </View>
      <Hourly data={weather()!} />
      <Daily data={weather()!} />
    </Show>
  </View>;
}

function chooseCity(city: City) {
  if (city.name !== prefs().city.name) {
    updatePrefs({ city });
    setWeather(undefined);
    loadWeather(true);
  }
  sdk().navigation.back();
}

async function useMyLocation() {
  if (locating()) return;
  setLocating(true);
  try {
    const position = await sdk().location.get({ timeoutMs: 12000, maximumAgeMs: 300000 }).promise;
    chooseCity({ name: "My location", country: `${position.latitude.toFixed(2)}, ${position.longitude.toFixed(2)}`, lat: position.latitude, lon: position.longitude });
  } catch (failure) {
    notify(`Location: ${describe(failure)}`);
  } finally {
    setLocating(false);
  }
}

export function CitiesPage() {
  const ROW = 52;
  return <View class="w-full flex-col gap-3">
    <Header title="Choose a city" subtitle="Forecasts by Open-Meteo" back />
    <View class="w-full flex-row"><Button primary label={locating() ? "Finding you..." : "Use my location"} onPress={useMyLocation} /></View>
    <VirtualList count={CITIES.length} rowHeight={ROW} height={pageHeight() - HEADER - 44 - GAP * 2} overscan={ROW * 2}
      onRowPress={index => chooseCity(CITIES[index])}
      renderRow={index => <View class="w-full flex-col" style={{ height: ROW }}>
        <View class="w-full flex-1 flex-row items-center justify-between px-4 bg-slate-900 active:bg-slate-800">
          <View class="flex-col">
            <Text class="text-white text-base">{CITIES[index].name}</Text>
            <Text class="text-slate-400 text-xs">{CITIES[index].country}</Text>
          </View>
          <Text class="text-cyan-400 text-xs">{CITIES[index].name === prefs().city.name ? "Current" : ""}</Text>
        </View>
        <View class="w-full h-[1] bg-slate-800" />
      </View>} />
  </View>;
}
