import { createSignal, Show } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { View, Text } from "@pocketjs/framework/components";
import { VirtualList } from "@pocketjs/framework/virtual-list";

function Benchmark() {
  const [form, setForm] = createSignal(false);
  const [selected, setSelected] = createSignal(-1);
  const [newsletter, setNewsletter] = createSignal(false);
  const [plan, setPlan] = createSignal("Basic");
  const [submitted, setSubmitted] = createSignal(false);
  const window = (globalThis as any).__pjmWindow as { width: number; height: number };
  return <View class="w-full h-full flex-col bg-slate-900">
    <View style={{ height: 64 }} class="w-full flex-row items-center justify-between p-4">
      <Text class="text-white text-base">{form() ? "Latin form fixture" : "1,000-row scroll fixture"}</Text>
      <View focusable onPress={() => setForm(!form())} class="bg-blue-600 rounded-xl px-4 py-2">
        <Text class="text-white text-sm">{form() ? "List" : "Form"}</Text>
      </View>
    </View>
    <Show when={!form()} fallback={
      <View class="w-full flex-col gap-4 p-4">
        <Text class="text-white text-base">Choose a plan and newsletter preference.</Text>
        <View focusable onPress={() => { setPlan(plan() === "Basic" ? "Pro" : "Basic"); setSubmitted(false); }} class="bg-slate-700 p-4 rounded-xl">
          <Text class="text-white text-base">Plan: {plan()}</Text>
        </View>
        <View focusable onPress={() => { setNewsletter(!newsletter()); setSubmitted(false); }} class="bg-slate-700 p-4 rounded-xl">
          <Text class="text-white text-base">Newsletter: {newsletter() ? "Yes" : "No"}</Text>
        </View>
        <View focusable onPress={() => setSubmitted(true)} class="bg-blue-600 p-4 rounded-xl">
          <Text class="text-white text-base">Submit</Text>
        </View>
        <Show when={submitted()}><Text class="text-cyan-400 text-base">Saved: {plan()}, newsletter {newsletter() ? "enabled" : "disabled"}</Text></Show>
      </View>
    }>
      <VirtualList count={1000} rowHeight={52} height={Math.max(100, window.height - 108)} overscan={104}
        onRowPress={index => setSelected(index)} renderRow={index =>
          <View class="w-full flex-row items-center justify-between px-4 bg-slate-800 active:bg-blue-600" style={{ height: 52 }}>
            <Text class="text-white text-base">Item {index + 1}</Text>
            <Text class="text-slate-400 text-sm">PocketJS</Text>
          </View>
        } />
      <View style={{ height: 44 }} class="w-full items-center justify-center">
        <Text class="text-cyan-400 text-sm">Selected: {selected() < 0 ? "none" : selected() + 1}</Text>
      </View>
    </Show>
  </View>;
}
mount(() => <Benchmark />);
