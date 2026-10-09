import { createSignal, Show } from "solid-js";
import { mount } from "@pocketjs/framework/solid";
import { Text, View } from "@pocketjs/framework/components";
import { connectMiniApp } from "@pocketjs/mini";

const [route, setRoute] = createSignal("/");
const [count, setCount] = createSignal(0);
let mini: ReturnType<typeof connectMiniApp>;
const selectedItem = () => { route(); return mini?.navigation.current.query.item ?? ""; };

function App() {
  return <View class="w-full h-full flex-col bg-slate-900 p-6 gap-4 justify-center">
    <Text class="text-cyan-400 text-sm">PocketJS Mini</Text>
    <Show when={route() === "/"} fallback={
      <View class="w-full flex-col gap-4">
        <Text class="text-white text-xl">Detail page</Text>
        <Text class="text-slate-400 text-base">Selected item: {selectedItem()}</Text>
        <Text class="text-cyan-400 text-base">Saved counter: {count()}</Text>
        <View focusable onPress={() => mini.navigation.back()} class="w-full bg-blue-600 rounded-xl p-4 items-center">
          <Text class="text-white text-base">Back to home</Text>
        </View>
        <Text class="text-slate-400 text-sm">Android Back returns to home too.</Text>
      </View>
    }>
      <View class="w-full flex-col gap-4">
        <Text class="text-white text-xl">Home page</Text>
        <Text class="text-cyan-400 text-base">Home counter: {count()}</Text>
        <View focusable onPress={() => setCount(count() + 1)} class="w-full bg-slate-700 rounded-xl p-4 items-center">
          <Text class="text-white text-base">Increment counter</Text>
        </View>
        <View focusable onPress={() => mini.navigation.push("/detail", { item: "42" })} class="w-full bg-blue-600 rounded-xl p-4 items-center">
          <Text class="text-white text-base">Open detail</Text>
        </View>
        <Text class="text-slate-400 text-sm">The counter stays when you return.</Text>
      </View>
    </Show>
  </View>;
}

mount(() => <App />);
mini = connectMiniApp({ pages: ["/", "/detail"] });
mini.navigation.subscribe(stack => setRoute(stack[stack.length - 1].path));
