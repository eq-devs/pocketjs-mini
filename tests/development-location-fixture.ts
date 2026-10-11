import {developmentNetworkSource} from './development-network-fixture.ts';
export function developmentLocationSource(source:string,fixture:'initial'|'reloaded'='initial',highAccuracy=false){
 return developmentNetworkSource(source,fixture).replace('function App() {','const [pjmLocation,setPjmLocation]=createSignal("pending");\nfunction App() {').replace('</Show>','</Show>\n<Text class="text-cyan-400 text-sm">Location: {pjmLocation()}</Text>')+`
mini.location.get({timeoutMs:15000,maximumAgeMs:60000,highAccuracy:${highAccuracy}}).promise.then(position=>setPjmLocation("SUCCESS "+position.latitude+","+position.longitude),error=>setPjmLocation(error.code+" ["+error.message+"]"));
`;
}
