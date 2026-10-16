import { createSignal, Show, onCleanup } from 'solid-js';
import { getOps } from '@pocketjs/framework/solid';
import { Modal, Portal, Text, View } from '@pocketjs/framework/components';
import { VirtualList } from '@pocketjs/framework/virtual-list';
import { wrapUI } from './ui-layout.ts';
import type { MiniUI, ModalState, UISnapshot } from './ui.ts';

function viewport(){
  const window=(globalThis as unknown as {__pjmWindow:{width:number;height:number;safeTop:number;safeBottom:number;safeLeft:number;safeRight:number}}).__pjmWindow;
  return {left:window.safeLeft??0,right:window.safeRight??0,top:window.safeTop??0,bottom:window.safeBottom??0,width:window.width-(window.safeLeft??0)-(window.safeRight??0),height:window.height-(window.safeTop??0)-(window.safeBottom??0)};
}
const measure=(value:string)=>getOps().measureText(value,2);
type Row={text:string;action?:()=>void;title?:boolean};
function ModalContent(props: {ui: MiniUI; state: ModalState}) {
  const state=props.state,window=viewport(),width=Math.max(20,Math.min(320,window.width-48));
  const rows:Row[]=[];
  const append=(value:string,action?:()=>void,title=false)=>{for(const text of wrapUI(value,width-16,measure))rows.push({text,action,title});};
  if(state.title)append(state.title,undefined,true);
  if(state.kind==='dialog'){
    if(state.message)append(state.message);
    append(state.confirmLabel,()=>props.ui.respond(state,1));
    if(state.showCancel)append(state.cancelLabel,()=>props.ui.respond(state,0));
  }else{
    state.items.forEach((label,index)=>append(label,()=>props.ui.respond(state,index)));
    append(state.cancelLabel,()=>props.ui.dismiss(state));
  }
  // The whole body scrolls, including multi-line actions. No action can be
  // pushed outside a fixed panel by a long title/message or eight long items.
  return <Modal open={true} panelClass="flex-col rounded-xl bg-slate-800">
    <View style={{paddingT:window.top+12,paddingB:window.bottom+12,paddingL:window.left+12,paddingR:window.right+12}}>
    <VirtualList count={rows.length} rowHeight={32} height={Math.max(32,Math.min(rows.length*32,window.height-48))} style={{width}} focusRows={true}
      onRowPress={index=>rows[index]?.action?.()}
      renderRow={index=><View class={rows[index].action ? 'w-full h-full bg-blue-600 px-2 justify-center' : 'w-full h-full px-2 justify-center'}>
        <Text class={rows[index].title ? 'text-cyan-400 text-base' : 'text-white text-base'}>{rows[index].text}</Text>
      </View>}/>
    </View>
  </Modal>;
}
function ToastContent(props:{text:string}){
  const window=viewport(),width=Math.max(20,Math.min(420,window.width-48));
  const lines=wrapUI(props.text,width,measure),limit=Math.max(1,Math.min(4,Math.floor((window.height-48)/24)));
  const visible=lines.slice(0,limit);
  if(lines.length>limit){let last=visible[limit-1];while(last&&measure(last+'...')>width)last=Array.from(last).slice(0,-1).join('');visible[limit-1]=last+'...';}
  return <Portal><View class="absolute bottom-4 left-4 right-4 bg-slate-800 rounded-xl p-2 items-center" style={{insetL:window.left+16,insetR:window.right+16,insetB:window.bottom+16}}><Text class="text-white text-base" style={{width}}>{visible.join('\n')}</Text></View></Portal>;
}
/** Mount once inside the application; connectMiniApp itself is called after mount(). */
export function MiniOverlays(props: { ui: MiniUI }) {
  const [snapshot,setSnapshot]=createSignal<UISnapshot>({});
  const detach=props.ui.attach(state=>setSnapshot(state));
  onCleanup(detach);
  return <>
    <Show when={snapshot().modal} keyed>{state=><ModalContent ui={props.ui} state={state}/>}</Show>
    <Show when={snapshot().toast} keyed>{toast=><ToastContent text={toast.text}/>}</Show>
  </>;
}
