import { createEffect, createSignal, on, Show } from "solid-js";
import { Text, View } from "@pocketjs/framework/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";
import { fetchJson, isoDaysAgo } from "./net.ts";
import { ago, describe, DOT, fmt, notify, percent, prefs, query, sdk, smart, updatePrefs } from "./state.ts";
import { BarChart, Button, ErrorCard, GAP, Header, HEADER, pageHeight, SEGMENT, Segmented, Skeleton, SmallButton, Stat } from "./ui.tsx";

// European Central Bank reference rates through Frankfurter: no API key,
// published once per business day.

type Series = { start_date: string; end_date: string; rates: Record<string, Record<string, number>> };
type Quote = { code: string; rate: number; change: number; spark: number[] };
type History = { key: string; dates: string[]; values: number[] };

const API = "https://api.frankfurter.dev/v1";
const BASES = ["USD", "EUR", "GBP", "CNY"];
const AMOUNTS = [1, 100, 1000, 10000];
const SYMBOLS = ["USD", "EUR", "GBP", "JPY", "CNY", "CHF", "CAD", "AUD", "HKD", "SGD", "INR", "KRW", "TRY", "BRL", "MXN"];
const NAMES: Record<string, string> = {
  USD: "US Dollar", EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen", CNY: "Chinese Yuan", CHF: "Swiss Franc",
  CAD: "Canadian Dollar", AUD: "Australian Dollar", HKD: "Hong Kong Dollar", SGD: "Singapore Dollar", INR: "Indian Rupee",
  KRW: "South Korean Won", TRY: "Turkish Lira", BRL: "Brazilian Real", MXN: "Mexican Peso",
};
const RANGES = [
  { id: "31", label: "1M" },
  { id: "92", label: "3M" },
  { id: "183", label: "6M" },
  { id: "365", label: "1Y" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ROW = 60, CHART = 150;

const [quotes, setQuotes] = createSignal<Quote[]>([]);
const [quotesFor, setQuotesFor] = createSignal("");
const [published, setPublished] = createSignal("");
const [fetchedAt, setFetchedAt] = createSignal(0);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal("");
const [range, setRange] = createSignal("92");
const [history, setHistory] = createSignal<History | undefined>();
const [historyError, setHistoryError] = createSignal("");
const histories = new Map<string, History>();
let latestRates = 0, latestHistory = 0;

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return month ? `${Number(day)} ${MONTHS[Number(month) - 1]}` : iso;
}
function sample(values: number[], count: number): number[] {
  if (values.length <= count) return values;
  return Array.from({ length: count }, (_, index) => values[Math.round((index * (values.length - 1)) / (count - 1))]);
}
function seriesFor(data: Series, code: string): { dates: string[]; values: number[] } {
  const dates = Object.keys(data.rates).sort().filter(date => typeof data.rates[date][code] === "number");
  return { dates, values: dates.map(date => data.rates[date][code]) };
}

export async function loadRates(force = false) {
  const base = prefs().base;
  if (!force && quotesFor() === base && Date.now() - fetchedAt() < 30 * 60_000) return;
  const request = ++latestRates;
  setLoading(true);
  setError("");
  if (quotesFor() !== base) setQuotes([]);
  try {
    const symbols = SYMBOLS.filter(code => code !== base).join(",");
    const data = await fetchJson<Series>(`${API}/${isoDaysAgo(45)}..?base=${base}&symbols=${symbols}`);
    if (request !== latestRates) return;
    const next = SYMBOLS.filter(code => code !== base).map(code => {
      const { values } = seriesFor(data, code);
      const rate = values[values.length - 1] ?? 0, first = values[0] ?? rate;
      return { code, rate, change: first ? rate / first - 1 : 0, spark: sample(values, 16) };
    }).filter(quote => quote.rate > 0);
    setQuotes(next);
    setQuotesFor(base);
    setPublished(data.end_date);
    setFetchedAt(Date.now());
  } catch (failure) {
    if (request !== latestRates) return;
    setError(describe(failure));
    if (quotes().length) notify(`Rates: ${describe(failure)}`);
  } finally {
    if (request === latestRates) setLoading(false);
  }
}

async function loadHistory(base: string, code: string, days: string) {
  const key = `${base}-${code}-${days}`, request = ++latestHistory;
  setHistoryError("");
  if (histories.has(key)) { setHistory(histories.get(key)); return; }
  setHistory(undefined);
  try {
    const data = await fetchJson<Series>(`${API}/${isoDaysAgo(Number(days))}..?base=${base}&symbols=${code}`);
    const next = { key, ...seriesFor(data, code) };
    if (!next.values.length) throw new Error("No rates for this range");
    histories.set(key, next);
    if (request === latestHistory) setHistory(next);
  } catch (failure) {
    if (request === latestHistory) setHistoryError(describe(failure));
  }
}

export function MarketsTab() {
  const listHeight = () => pageHeight() - HEADER - SEGMENT * 2 - GAP * 3;
  const amountLabel = (amount: number) => amount >= 1000 ? `${amount / 1000}K` : `${amount}`;
  return <View class="w-full flex-col gap-3">
    <Header title="Markets" subtitle={loading() ? "Loading..." : published() ? `ECB rates for ${shortDate(published())}${DOT}${ago(fetchedAt())}` : "ECB reference rates"}
      right={<SmallButton label="Refresh" disabled={loading()} onPress={() => loadRates(true)} />} />
    <Segmented options={BASES.map(code => ({ id: code, label: code }))} value={prefs().base} onChange={base => { updatePrefs({ base }); loadRates(); }} />
    <Segmented options={AMOUNTS.map(amount => ({ id: String(amount), label: `${amountLabel(amount)} ${prefs().base}` }))}
      value={String(prefs().amount)} onChange={amount => updatePrefs({ amount: Number(amount) })} />
    <Show when={quotes().length} fallback={
      <Show when={error()} fallback={<><Skeleton height={ROW - 4} /><Skeleton height={ROW - 4} /><Skeleton height={ROW - 4} /><Skeleton height={ROW - 4} /></>}>
        <ErrorCard message={error()} onRetry={() => loadRates(true)} />
      </Show>
    }>
      <VirtualList count={quotes().length} rowHeight={ROW} height={listHeight()} overscan={ROW * 2}
        onRowPress={index => { const quote = quotes()[index]; if (quote) sdk().navigation.push("/currency", { code: quote.code }); }}
        renderRow={index => {
          const quote = () => quotes()[index];
          return <View class="w-full flex-col" style={{ height: ROW }}>
            <View class="w-full flex-1 flex-row items-center gap-3 px-3 bg-slate-900 active:bg-slate-800">
              <View class="w-[92] flex-col">
                <Text class="text-white text-base">{quote()?.code ?? ""}</Text>
                <Text class="text-slate-500 text-xs">{quote() ? NAMES[quote()!.code] ?? "" : ""}</Text>
              </View>
              <View class="flex-1">
                <Show when={quote()}><BarChart values={quote()!.spark} height={26} up={quote()!.change >= 0} /></Show>
              </View>
              <View class="w-[96] flex-col items-end">
                <Text class="text-white text-base">{quote() ? smart(quote()!.rate * prefs().amount) : ""}</Text>
                <Text class={quote() && quote()!.change >= 0 ? "text-emerald-400 text-xs" : "text-rose-400 text-xs"}>{quote() ? percent(quote()!.change) : ""}</Text>
              </View>
            </View>
            <View class="w-full h-[1] bg-slate-950" />
          </View>;
        }} />
    </Show>
  </View>;
}

export function CurrencyPage() {
  const code = () => query().code ?? "EUR";
  const base = () => prefs().base;
  createEffect(on([base, code, range], ([from, to, days]) => loadHistory(from, to, days)));
  const values = () => history()?.values ?? [];
  const last = () => values()[values().length - 1] ?? 0;
  const change = () => values().length ? last() / values()[0] - 1 : 0;
  const high = () => Math.max(...values()), low = () => Math.min(...values());
  const average = () => values().reduce((sum, value) => sum + value, 0) / (values().length || 1);
  const rangeLabel = () => RANGES.find(option => option.id === range())?.label ?? "";
  const swap = () => {
    const from = base(), to = code();
    updatePrefs({ base: to });
    loadRates();
    sdk().navigation.replace("/currency", { code: from });
  };
  const copyRate = () => sdk().clipboard.write(`1 ${base()} = ${smart(last())} ${code()} (ECB, ${history()?.dates.slice(-1)[0] ?? ""})`).promise
    .then(() => notify("Rate copied"), failure => notify(`Copy failed: ${describe(failure)}`));
  return <View class="w-full flex-col gap-3">
    <Header title={`${base()} / ${code()}`} subtitle={`${NAMES[base()] ?? base()} to ${NAMES[code()] ?? code()}`} back />
    <Show when={history()} fallback={
      <Show when={historyError()} fallback={<><Skeleton height={92} /><Skeleton height={SEGMENT} /><Skeleton height={CHART + 48} /></>}>
        <ErrorCard message={historyError()} onRetry={() => loadHistory(base(), code(), range())} />
      </Show>
    }>
      <View class="w-full flex-col gap-1 bg-slate-900 rounded-xl p-4" style={{ height: 92 }}>
        <Text class="text-white text-4xl font-bold">{smart(last())}</Text>
        <Text class={change() >= 0 ? "text-emerald-400 text-sm" : "text-rose-400 text-sm"}>{`${percent(change())} in ${rangeLabel()}${DOT}${fmt(prefs().amount, 0)} ${base()} = ${smart(last() * prefs().amount)} ${code()}`}</Text>
      </View>
      <Segmented options={RANGES} value={range()} onChange={setRange} />
      <View class="w-full flex-col bg-slate-900 rounded-xl p-3 gap-2">
        <View class="w-full flex-row justify-between">
          <Text class="text-slate-400 text-xs">{`High ${smart(high())}`}</Text>
          <Text class="text-slate-400 text-xs">{`Low ${smart(low())}`}</Text>
        </View>
        <BarChart values={sample(values(), 48)} height={CHART - 40} up={change() >= 0} highlightLast />
        <View class="w-full flex-row justify-between">
          <Text class="text-slate-500 text-xs">{shortDate(history()!.dates[0] ?? "")}</Text>
          <Text class="text-slate-500 text-xs">{shortDate(history()!.dates[history()!.dates.length - 1] ?? "")}</Text>
        </View>
      </View>
      <View class="w-full flex-row gap-2" style={{ height: 56 }}>
        <Stat label="Average" value={smart(average())} />
        <Stat label="Days" value={`${values().length}`} />
        <Stat label="Spread" value={percent(high() / low() - 1)} />
      </View>
      <View class="w-full flex-row gap-2">
        <Button primary label={`Swap to ${code()} base`} onPress={swap} />
        <Button label="Copy rate" onPress={copyRate} />
      </View>
    </Show>
  </View>;
}
