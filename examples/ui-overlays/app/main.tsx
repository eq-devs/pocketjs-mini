import {createSignal,Show} from 'solid-js';
import {mount} from '@pocketjs/framework/solid';
import {Text,View} from '@pocketjs/framework/components';
import {connectMiniApp,type MiniUI,type UIWork} from '@pocketjs/mini';
import {MiniOverlays} from '@pocketjs/mini/overlays';
const [ui,setUI]=createSignal<MiniUI>();
const [result,setResult]=createSignal('Ready');
const [count,setCount]=createSignal(0);
let mini:ReturnType<typeof connectMiniApp>;
function report<T>(work:UIWork<T>,format:(value:T)=>string){work.promise.then(value=>setResult(format(value))).catch(error=>setResult(error.code));}
function App(){return <View class="w-full h-full bg-slate-900 flex-col justify-center p-4 gap-3">
 <Text class="text-white text-lg">Mini UI</Text>
 <Text class="text-cyan-400 text-base">{result()}</Text>
 <View focusable onPress={()=>setCount(count()+1)} class="bg-slate-700 rounded-lg p-2"><Text class="text-white text-base">Background count: {count()}</Text></View>
 <View focusable onPress={()=>report(mini.ui.toast({text:'Saved toast',durationFrames:120}),()=>'Toast finished')} class="bg-blue-600 rounded-lg p-2"><Text class="text-white text-base">Show toast</Text></View>
 <View focusable onPress={()=>report(mini.ui.dialog({title:'Save changes?',message:'This dialog is drawn by PocketJS.',confirmLabel:'Save'}),value=>value.confirmed?'Dialog saved':'Dialog cancelled')} class="bg-blue-600 rounded-lg p-2"><Text class="text-white text-base">Show dialog</Text></View>
 <View focusable onPress={()=>report(mini.ui.actionSheet({title:'Choose color',items:['Blue','Green','Orange']}),value=>'Selected '+value.index)} class="bg-blue-600 rounded-lg p-2"><Text class="text-white text-base">Show actions</Text></View>
 <Show when={ui()}>{value=><MiniOverlays ui={value()}/>}</Show>
 </View>;}
mount(()=><App/>);
mini=connectMiniApp();setUI(mini.ui);
