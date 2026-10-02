import { createSignal } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/components";

function App() {
  const [count, setCount] = createSignal(0);
  return (
    <View class="w-full h-full flex-col bg-slate-900 items-center justify-center gap-4" focusable onPress={() => setCount(count() + 1)}>
      <Text class="text-white text-xl">Hello PocketJS Mini</Text>
      <Text class="text-cyan-400 text-xl">Count: {count()}</Text>
      <Text class="text-slate-400 text-sm">Tap to increment · 0123456789</Text>
    </View>
  );
}
mount(() => <App />);
