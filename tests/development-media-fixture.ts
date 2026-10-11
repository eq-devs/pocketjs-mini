import {developmentNetworkSource} from './development-network-fixture.ts';
export function developmentMediaSource(source:string,fixture:'initial'|'reloaded'='initial',selection:'library'|'camera'='library'){
 return developmentNetworkSource(source,fixture).replace('function App() {','const [pjmMedia,setPjmMedia]=createSignal("pending");\nfunction App() {').replace('</Show>','</Show>\n<Text class="text-cyan-400 text-sm">Media: {pjmMedia()}</Text>')+`
mini.media.select({source:${JSON.stringify(selection)},maxDimension:64,quality:75}).promise.then(async image=>{
 if(image.mime!=="image/jpeg"||${selection==='camera'?'!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||Math.max(image.width,image.height)!==64':'image.width!==64||image.height!==32'})throw new Error("IMAGE_DIMENSIONS");
 const chunk=await mini.resources.read({handle:image.resource.handle,offset:0,count:3}).promise;
 if(chunk.bodyBase64!=="/9j/"||chunk.size!==image.resource.size)throw new Error("JPEG_RESOURCE");
 await mini.resources.release(image.resource.handle).promise;
 try{await mini.resources.read({handle:image.resource.handle,offset:0,count:1}).promise;throw new Error("RELEASED_READ");}catch(error:any){if(error.code!=="DENIED")throw error;}
 setPjmMedia("SUCCESS JPEG "+image.width+"x"+image.height+" released=DENIED");
}).catch(error=>setPjmMedia(error.code??"FAILED"));
`;
}
