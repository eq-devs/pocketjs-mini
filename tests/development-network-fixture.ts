import assert from 'node:assert/strict';

/** Actual SDK observer rendered in the navigation example; no native source replacement. */
export function developmentNetworkSource(source:string,fixture:'initial'|'reloaded'='initial'){
 assert.ok(source.includes('function App() {')&&source.includes('</Show>'),'Expected navigation example');
 return source.replace('function App() {',`const [pjmNetworkType,setPjmNetworkType]=createSignal("pending");
const [pjmNetworkEvents,setPjmNetworkEvents]=createSignal(0);
const [pjmNetworkProtocol,setPjmNetworkProtocol]=createSignal("pending");
const [pjmClipboardWrite,setPjmClipboardWrite]=createSignal("pending");
const [pjmClipboardProtocol,setPjmClipboardProtocol]=createSignal("pending");
function App() {`).replace('</Show>',`</Show>
    <Text class="text-cyan-400 text-sm">Network: {pjmNetworkType()} events: {pjmNetworkEvents()} fixture: ${fixture}</Text>
    <Text class="text-slate-400 text-sm">Network protocol: {pjmNetworkProtocol()}</Text>
    <Text class="text-cyan-400 text-sm">Clipboard write: {pjmClipboardWrite()} protocol: {pjmClipboardProtocol()}</Text>`)+`
mini.clipboard.write("PocketJS development 😀").promise.then(()=>setPjmClipboardWrite("SUCCESS"),error=>setPjmClipboardWrite(error.code));
mini.request("clipboard.write.v1",{text:"bad",extra:true}).promise.then(()=>setPjmClipboardProtocol("UNEXPECTED_SUCCESS"),error=>setPjmClipboardProtocol(error.code));
const pjmNetworkWatch=mini.network.watch(state=>{setPjmNetworkEvents(pjmNetworkEvents()+1);setPjmNetworkType(state.type);});
pjmNetworkWatch.promise.then(state=>setPjmNetworkType(state.type),error=>setPjmNetworkType("FAILED "+error.code));
mini.request("device.network.v1",{unexpected:true}).promise.then(()=>setPjmNetworkProtocol("UNEXPECTED_SUCCESS"),error=>setPjmNetworkProtocol(error.code));
`;
}

export function developmentNetworkProof(text:string){
 const match=text.match(/Network: (unknown|none|wifi|cellular|ethernet|other) events: (\d+) fixture: (initial|reloaded)/);
 if(!match||!text.includes('Network protocol: PROTOCOL')||!text.includes('Clipboard write: SUCCESS protocol: PROTOCOL'))return undefined;
 return {type:match[1],events:Number(match[2]),fixture:match[3]};
}
