import {developmentNetworkSource} from './development-network-fixture.ts';

/** Actual HTTPS and Camera2 producers share the four-slot guest registry. */
export function developmentHttpMediaSource(source:string,fixture:'initial'|'reloaded'='initial'){
 return developmentNetworkSource(source,fixture)
 .replace('function App() {','const pjmMixedRun=Math.random().toString(36).slice(2);\nconst [pjmHttp,setPjmHttp]=createSignal("pending");\nconst [pjmMedia,setPjmMedia]=createSignal("pending");\nconst [pjmMixed,setPjmMixed]=createSignal("pending");\nfunction App() {')
 .replace('</Show>','</Show>\n<Text class="text-cyan-400 text-sm">HTTP: {pjmHttp()}</Text>\n<Text class="text-cyan-400 text-sm">Media: {pjmMedia()}</Text>\n<Text class="text-cyan-400 text-sm">Mixed: {pjmMixed()}</Text>\n<Text class="text-cyan-400 text-sm">Mixed run: {pjmMixedRun}</Text>')+`
function pjmMixedDecode(value:string){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";let bits=0,buffer=0,text="";for(const character of value){if(character==="=")break;buffer=(buffer<<6)|alphabet.indexOf(character);bits+=6;if(bits>=8){bits-=8;text+=String.fromCharCode((buffer>>bits)&255);}}return text;}
async function pjmMixedCheck(){
 const owned=new Set<string>();let bytes=0;
 async function http(){const response=await mini.http({url:"https://example.com/",responseMode:"resource"}).promise;if(response.status!==200||!response.resource||response.resource.size<1||owned.has(response.resource.handle))throw new Error("BAD_HTTP_RESOURCE");owned.add(response.resource.handle);return response.resource;}
 async function body(resource:any){let offset=0,text="";while(offset<resource.size){const chunk=await mini.resources.read({handle:resource.handle,offset,count:1536}).promise;text+=pjmMixedDecode(chunk.bodyBase64);if(chunk.nextOffset<=offset||chunk.size!==resource.size)throw new Error("RESOURCE_PROGRESS");offset=chunk.nextOffset;}if(!text.includes("Example Domain"))throw new Error("WRONG_HTTP_BODY");bytes+=offset;}
 async function release(handle:string){await mini.resources.release(handle).promise;owned.delete(handle);try{await mini.resources.read({handle,offset:0,count:1}).promise;throw new Error("RELEASED_READ");}catch(error:any){if(error.code!=="DENIED")throw error;}}
 function busy(){return mini.http({url:"https://example.com/",responseMode:"resource"}).promise.then(()=>{throw new Error("QUOTA_ACCEPTED");},error=>{if(error.code!=="BUSY")throw error;});}
 try{
  try{await mini.http({url:"https://denied.example/"}).promise;throw new Error("DOMAIN_ACCEPTED");}catch(error:any){if(error.code!=="DENIED")throw error;}
  const held=await Promise.all([http(),http(),http()]);
  setPjmMixed("HTTP held=3 camera pending");
  const selection=mini.media.select({source:"camera",maxDimension:64,quality:75}).promise.then(image=>{owned.add(image.resource.handle);return image;});
  const blocked=busy();
  const [image]=await Promise.all([selection,blocked]);
  if(image.mime!=="image/jpeg"||image.width<1||image.height<1||Math.max(image.width,image.height)!==64)throw new Error("IMAGE_DIMENSIONS");
  const head=await mini.resources.read({handle:image.resource.handle,offset:0,count:3}).promise;
  if(head.bodyBase64!=="/9j/"||head.size!==image.resource.size)throw new Error("JPEG_RESOURCE");
  await release(image.resource.handle);setPjmMedia("SUCCESS JPEG "+image.width+"x"+image.height+" released=DENIED");
  const replacement=await http();
  for(const resource of [...held,replacement]){await body(resource);await release(resource.handle);}
  const refilled=await Promise.all([http(),http(),http(),http()]);await busy();
  for(const resource of refilled){await body(resource);await release(resource.handle);}
  setPjmHttp("SUCCESS bytes="+bytes+" domain=DENIED released=DENIED");
  setPjmMixed("SUCCESS held=3+1 quota=BUSY reused=1 refilled=4 released=DENIED");
 }catch(error:any){setPjmMixed("FAILED "+(error.code||error.message));setPjmHttp("FAILED "+(error.code||error.message));}
 finally{for(const handle of owned){try{await mini.resources.release(handle).promise;}catch{}}}
}
pjmMixedCheck();
`;
}
