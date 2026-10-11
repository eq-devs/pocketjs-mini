import {MAX_PACKAGE_BYTES,type SignedManifest} from './package.ts';
import {strictJson} from './strict-json.ts';
import {PackageStore} from './store.ts';

const activeRoots=new Set<string>();
export const MAX_DISTRIBUTION_OPERATIONS=2;

function httpsEndpoint(address:string):URL {
 const url=new URL(address);
 if(address.length>2048||url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Distribution URL must be HTTPS without credentials, query or fragment');
 return url;
}
async function download(url:URL,maximum:number,signal:AbortSignal,transport:typeof fetch):Promise<Buffer> {
 const response=await transport(url,{redirect:'error',cache:'no-store',signal});
 if(response.status!==200){await response.body?.cancel().catch(()=>{});throw Error('Distribution HTTP '+response.status);}
 const reader=response.body?.getReader();if(!reader)throw Error('Missing distribution body');
 // Fixed slabs also bound bookkeeping when a peer sends tiny stream chunks.
 const parts:Buffer[]=[];let size=0,used=0;
 try{
  const length=response.headers.get('content-length');
  if(length!==null&&(length.length>20||!/^\d+$/.test(length)||BigInt(length)>BigInt(maximum)))throw Error('Distribution body exceeds limit');
  for(;;){
   signal.throwIfAborted();const next=await reader.read();if(next.done)break;
   if(next.value.byteLength>maximum-size)throw Error('Distribution body exceeds limit');
   let offset=0;
   while(offset<next.value.byteLength){
    if(!parts.length||used===parts[parts.length-1].length){parts.push(Buffer.allocUnsafe(Math.min(65536,maximum-size)));used=0;}
    const part=parts[parts.length-1],count=Math.min(part.length-used,next.value.byteLength-offset);
    part.set(next.value.subarray(offset,offset+count),used);used+=count;offset+=count;size+=count;
   }
  }
  if(!size)throw Error('Empty distribution body');
  parts[parts.length-1]=parts[parts.length-1].subarray(0,used);
  return Buffer.concat(parts,size);
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** Host-owned reference downloader. Trust comes solely from the supplied store;
 * downloaded envelopes cannot introduce publisher keys. URLs are host inputs,
 * not guest commands. Native mobile downloader integration remains separate. */
export async function downloadUpdate(options:{store:PackageStore;appId:string;version:string;manifestUrl:string;packageUrl:string;signal?:AbortSignal},transport:typeof fetch=fetch):Promise<SignedManifest> {
 const manifestUrl=httpsEndpoint(options.manifestUrl),packageUrl=httpsEndpoint(options.packageUrl);
 const signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
 signal.throwIfAborted();
 if(activeRoots.has(options.store.root)||activeRoots.size>=MAX_DISTRIBUTION_OPERATIONS)throw Error('Distribution download BUSY');
 const root=options.store.root;activeRoots.add(root);
 try{
  const envelope=strictJson(await download(manifestUrl,65536,signal,transport)) as any;
  if(envelope?.appId!==options.appId||envelope?.version!==options.version)throw Error('Distribution identity/version mismatch');
  const payload=await download(packageUrl,MAX_PACKAGE_BYTES,signal,transport);
  signal.throwIfAborted();
  return options.store.stageNative(payload,envelope);
 }finally{activeRoots.delete(root);}
}
