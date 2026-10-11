import {developmentNetworkSource} from './development-network-fixture.ts';
/** Live HTTPS via the real SDK and host; no native transport injection. */
export function developmentHttpSource(source:string,fixture:'initial'|'reloaded'='initial'){
 return developmentNetworkSource(source,fixture).replace('function App() {','const [pjmHttp,setPjmHttp]=createSignal("pending");\nfunction App() {').replace('</Show>','</Show>\n<Text class="text-cyan-400 text-sm">HTTP: {pjmHttp()}</Text>')+`
function pjmDecodeHttp(value:string){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let bits=0,buffer=0,text="";for(const character of value){if(character==="=")break;buffer=(buffer<<6)|alphabet.indexOf(character);bits+=6;if(bits>=8){bits-=8;text+=String.fromCharCode((buffer>>bits)&255);}}return text;}
async function pjmHttpCheck(){
 try{
  try{await mini.http({url:"https://denied.example/"}).promise;throw new Error("DOMAIN_ACCEPTED");}catch(error:any){if(error.code!=="DENIED")throw error;}
  const response=await mini.http({url:"https://example.com/",responseMode:"resource"}).promise;
  if(response.status!==200||!response.resource||response.resource.size<1)throw new Error("BAD_RESPONSE");
  const handle=response.resource.handle;let offset=0,text="";
  while(offset<response.resource.size){const chunk=await mini.resources.read({handle,offset,count:1536}).promise;text+=pjmDecodeHttp(chunk.bodyBase64);if(chunk.nextOffset<=offset)throw new Error("NO_PROGRESS");offset=chunk.nextOffset;}
  if(!text.includes("Example Domain"))throw new Error("WRONG_BODY");
  await mini.resources.release(handle).promise;
  try{await mini.resources.read({handle,offset:0,count:1}).promise;throw new Error("RELEASED_READ");}catch(error:any){if(error.code!=="DENIED")throw error;}
  setPjmHttp("SUCCESS bytes="+offset+" domain=DENIED released=DENIED");
 }catch(error:any){setPjmHttp("FAILED "+(error.code||error.message));}
}
pjmHttpCheck();
`;
}
