import {developmentNetworkSource} from './development-network-fixture.ts';
export function developmentClipboardReadSource(source:string,fixture:'initial'|'reloaded'='initial'){
 return developmentNetworkSource(source,fixture).replace('function App() {','const [pjmClipboardRead,setPjmClipboardRead]=createSignal("pending");\nfunction App() {').replace('</Show>','</Show>\n<Text class="text-cyan-400 text-sm">Clipboard read: {pjmClipboardRead()}</Text>')+`
mini.clipboard.write("PocketJS read consent 😀").promise.then(()=>mini.clipboard.read().promise).then(text=>setPjmClipboardRead(text==="PocketJS read consent 😀"?"SUCCESS":"WRONG_TEXT"),error=>setPjmClipboardRead(error.code));
`;
}
