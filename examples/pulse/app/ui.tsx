import { Show, type JSX } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { online, route, sdk, viewport } from "./state.ts";

// Layout is computed from the measured viewport: lists need explicit heights.
export const PAD = 16;
export const GAP = 12;
export const HEADER = 48;
export const TABBAR = 64;
export const BANNER = 32;
export const SEGMENT = 40;
export const contentWidth = viewport.width - PAD * 2;
/** Height available to the current page, below the banner and above the tab bar. */
export const pageHeight = () => viewport.height - PAD * 2 - (route() === "/" ? TABBAR : 0) - (online() ? 0 : BANNER);

export function Header(props: { title: string; subtitle?: string; back?: boolean; right?: JSX.Element }) {
  return <View class="w-full flex-row items-center justify-between gap-2" style={{ height: HEADER }}>
    <View class="flex-row items-center gap-3">
      <Show when={props.back}>
        <View focusable onPress={() => sdk().navigation.back()} class="bg-slate-800 rounded-lg px-3 py-2 active:bg-slate-700">
          <Text class="text-cyan-400 text-sm">Back</Text>
        </View>
      </Show>
      <View class="flex-col">
        <Text class="text-white text-xl font-bold">{props.title}</Text>
        <Show when={props.subtitle}><Text class="text-slate-400 text-xs">{props.subtitle}</Text></Show>
      </View>
    </View>
    <View class="flex-row items-center gap-2">{props.right}</View>
  </View>;
}

export function SmallButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return <View focusable onPress={() => { if (!props.disabled) props.onPress(); }}
    class={props.disabled ? "bg-slate-800 rounded-lg px-3 py-2 opacity-50" : "bg-slate-800 rounded-lg px-3 py-2 active:bg-slate-700"}>
    <Text class="text-cyan-400 text-sm">{props.label}</Text>
  </View>;
}

export function Button(props: { label: string; onPress: () => void; primary?: boolean }) {
  return <View focusable onPress={() => props.onPress()} style={{ height: 44 }} class={props.primary
    ? "flex-1 bg-blue-600 rounded-xl items-center justify-center active:bg-blue-500"
    : "flex-1 bg-slate-800 rounded-xl items-center justify-center active:bg-slate-700"}>
    <Text class="text-white text-sm">{props.label}</Text>
  </View>;
}

export function Segmented(props: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return <View class="w-full flex-row bg-slate-900 rounded-xl p-1 gap-1" style={{ height: SEGMENT }}>
    {props.options.map(option => <View focusable onPress={() => props.onChange(option.id)} class={option.id === props.value
      ? "flex-1 bg-slate-700 rounded-lg items-center justify-center"
      : "flex-1 rounded-lg items-center justify-center active:bg-slate-800"}>
      <Text class={option.id === props.value ? "text-white text-sm" : "text-slate-400 text-sm"}>{option.label}</Text>
    </View>)}
  </View>;
}

export function Skeleton(props: { height: number }) {
  return <View class="w-full bg-slate-800 rounded-xl animate-pulse" style={{ height: props.height }} />;
}

export function ErrorCard(props: { message: string; onRetry: () => void }) {
  return <View class="w-full flex-col gap-3 bg-slate-900 rounded-xl p-4">
    <Text class="text-rose-400 text-base">Could not load data</Text>
    <Text class="text-slate-400 text-sm">{props.message}</Text>
    <View class="w-full flex-row"><Button primary label="Try again" onPress={props.onRetry} /></View>
  </View>;
}

export function Stat(props: { label: string; value: string }) {
  return <View class="flex-1 flex-col items-center justify-center bg-slate-900 rounded-xl gap-1">
    <Text class="text-white text-base font-bold">{props.value}</Text>
    <Text class="text-slate-400 text-xs">{props.label}</Text>
  </View>;
}

/** Bars scaled between the series' min and max; the newest value is highlighted. */
export function BarChart(props: { values: number[]; height: number; up: boolean; highlightLast?: boolean }) {
  const scaled = () => {
    const values = props.values;
    const low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
    return values.map(value => Math.round(3 + ((value - low) / span) * (props.height - 3)));
  };
  return <View class="w-full flex-row items-end gap-[1]" style={{ height: props.height }}>
    {scaled().map((height, index) => <View style={{ height }} class={props.highlightLast && index === props.values.length - 1
      ? "flex-1 rounded-sm bg-white"
      : props.up ? "flex-1 rounded-sm bg-emerald-500" : "flex-1 rounded-sm bg-rose-500"} />)}
  </View>;
}

export function OfflineBanner() {
  return <View class="w-full bg-rose-900 items-center justify-center" style={{ height: BANNER }}>
    <Text class="text-white text-xs">Offline - showing saved data</Text>
  </View>;
}
