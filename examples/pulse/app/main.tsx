import { Show } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/components";
import { connect, loadPrefs, notify, online, prefs, route, setNetwork, setNow, setQuery, setRoute, setTab, tab, toast, updatePrefs, type Tab } from "./state.ts";
import { OfflineBanner, TABBAR } from "./ui.tsx";
import { CitiesPage, loadWeather, restoreWeather, WeatherTab } from "./weather.tsx";
import { CommentPage, loadNews, NewsTab, StoryPage } from "./news.tsx";
import { CurrencyPage, loadRates, MarketsTab } from "./markets.tsx";

// Pulse: live weather, Hacker News and exchange rates from free public APIs.

function refresh(force = false) {
  if (tab() === "weather") loadWeather(force);
  else if (tab() === "news") loadNews(force);
  else loadRates(force);
}

function selectTab(next: Tab) {
  setTab(next);
  if (prefs().tab !== next) updatePrefs({ tab: next });
  refresh();
}

function TabIcon(props: { id: Tab; active: boolean }) {
  return <View class="w-[22] h-[18] items-center justify-center">
    <Show when={props.id === "weather"}>
      <View class={props.active ? "w-[16] h-[16] rounded-full bg-cyan-400" : "w-[16] h-[16] rounded-full bg-slate-500"} />
    </Show>
    <Show when={props.id === "news"}>
      <View class="flex-col gap-[3]">
        <View class={props.active ? "w-[18] h-[3] rounded-sm bg-cyan-400" : "w-[18] h-[3] rounded-sm bg-slate-500"} />
        <View class={props.active ? "w-[18] h-[3] rounded-sm bg-cyan-400" : "w-[18] h-[3] rounded-sm bg-slate-500"} />
        <View class={props.active ? "w-[12] h-[3] rounded-sm bg-cyan-400" : "w-[12] h-[3] rounded-sm bg-slate-500"} />
      </View>
    </Show>
    <Show when={props.id === "markets"}>
      <View class="flex-row items-end gap-[2]" style={{ height: 16 }}>
        <View class={props.active ? "w-[4] h-[7] rounded-sm bg-cyan-400" : "w-[4] h-[7] rounded-sm bg-slate-500"} />
        <View class={props.active ? "w-[4] h-[11] rounded-sm bg-cyan-400" : "w-[4] h-[11] rounded-sm bg-slate-500"} />
        <View class={props.active ? "w-[4] h-[16] rounded-sm bg-cyan-400" : "w-[4] h-[16] rounded-sm bg-slate-500"} />
      </View>
    </Show>
  </View>;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "weather", label: "Weather" },
  { id: "news", label: "News" },
  { id: "markets", label: "Markets" },
];

function TabBar() {
  return <View class="w-full flex-col bg-slate-900" style={{ height: TABBAR }}>
    <View class="w-full h-[1] bg-slate-800" />
    <View class="w-full flex-1 flex-row">
      {TABS.map(item => <View focusable onPress={() => selectTab(item.id)} class="flex-1 flex-col items-center justify-center gap-1 active:bg-slate-800">
        <TabIcon id={item.id} active={tab() === item.id} />
        <Text class={tab() === item.id ? "text-cyan-400 text-xs" : "text-slate-500 text-xs"}>{item.label}</Text>
      </View>)}
    </View>
  </View>;
}

function App() {
  return <View class="relative w-full h-full flex-col bg-slate-950">
    <Show when={!online()}><OfflineBanner /></Show>
    <View class="w-full flex-1 flex-col p-4 gap-3 overflow-hidden">
      <Show when={route() === "/" && tab() === "weather"}><WeatherTab /></Show>
      <Show when={route() === "/" && tab() === "news"}><NewsTab /></Show>
      <Show when={route() === "/" && tab() === "markets"}><MarketsTab /></Show>
      <Show when={route() === "/cities"}><CitiesPage /></Show>
      <Show when={route() === "/story"}><StoryPage /></Show>
      <Show when={route() === "/comment"}><CommentPage /></Show>
      <Show when={route() === "/currency"}><CurrencyPage /></Show>
    </View>
    <Show when={route() === "/"}><TabBar /></Show>
    <Show when={toast()}>
      <View class="absolute left-4 right-4 bottom-[80] z-50 bg-slate-700 rounded-xl p-3 items-center justify-center shadow-lg">
        <Text class="text-white text-sm">{toast()}</Text>
      </View>
    </Show>
  </View>;
}

mount(() => <App />);
const mini = connect();
const follow = () => { const top = mini.navigation.current; setRoute(top.path); setQuery(top.query); };
mini.navigation.subscribe(follow);
follow();

let wasOnline = true;
mini.network.watch(state => {
  setNetwork(state);
  const isOnline = state.connected !== false;
  if (isOnline && !wasOnline) { notify("Back online"); refresh(); }
  wasOnline = isOnline;
}).promise.then(state => { setNetwork(state); wasOnline = state.connected !== false; }, () => undefined);
mini.onLifecycle("show", () => refresh());

const tick = () => { setNow(Date.now()); mini.after(1800, tick); };
mini.after(1800, tick);

(async () => {
  await loadPrefs();
  setTab(prefs().tab);
  await restoreWeather();
  refresh();
})();
