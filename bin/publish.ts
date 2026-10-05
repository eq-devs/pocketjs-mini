import {join,resolve} from 'node:path';
import {canonical} from '../container/package.ts';
import {verifyInstalledInputs} from './installed-project.ts';
import {strictJson} from '../container/strict-json.ts';
import {selectPocketInputs} from '../container/pocket-inputs.ts';
import {admitReplayPlan} from '../devtools/plan.ts';
import type {SignedManifest} from '../container/package.ts';
const admittedPublications=new WeakMap<object,{payload:Buffer;manifest:SignedManifest}>();
export function preparePublication(directory:string,publicKey:string,target:'ios'|'android') {
  const {payload,manifest}=verifyInstalledInputs({payload:join(resolve(directory),'main.pocket'),envelope:join(resolve(directory),'manifest.json'),publicKey:resolve(publicKey)},'pjm-'+target);
  const selected=selectPocketInputs(payload,'pjm-'+target,manifest.appId),plan=strictJson(selected.plan) as any;
  const width=plan?.viewport?.logical?.[0],height=plan?.viewport?.logical?.[1],density=plan?.viewport?.rasterDensity;
  if(![width,height,density].every(Number.isSafeInteger)||width<1||width>1024||height<1||height>1024||density<1||density>4||width*height*density*density*4>16*1024*1024)throw Error('Publication plan viewport limits');
  admitReplayPlan(selected.plan,{target:target==='ios'?'pjm-ios':'pjm-android',window:{width,height,density}},{appId:manifest.appId,version:manifest.version});
  const prepared={payload:Buffer.from(payload),manifest:JSON.parse(canonical(manifest)) as SignedManifest};
  admittedPublications.set(prepared,{payload,manifest});return prepared;
}
function endpointUrl(address:string):URL {
  const url=new URL(address);
  if(url.protocol!=='https:' || url.username || url.password || url.hash || url.search)throw Error('Publishing endpoint must be HTTPS without credentials, query or fragment');
  return url;
}
export async function uploadPublication(prepared:ReturnType<typeof preparePublication>,address:string,token:string,transport:typeof fetch=fetch) {
  const endpoint=endpointUrl(address);
  if(!token || token.length>4096 || /[^\x21-\x7e]/.test(token))throw Error('Publishing requires a valid bearer token in PJM_PUBLISH_TOKEN');
  const admitted=admittedPublications.get(prepared);
  if(!admitted)throw Error('Publication must be prepared with trusted package verification');
  const {payload,manifest}=admitted,form=new FormData();
  form.append('manifest',new Blob([canonical(manifest)],{type:'application/json'}),'manifest.json');
  form.append('package',new Blob([payload],{type:'application/octet-stream'}),'main.pocket');
  const response=await transport(endpoint,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Idempotency-Key':manifest.appId+':'+manifest.version+':'+manifest.sha256}});
  if(response.status!==200 && response.status!==201){await response.body?.cancel();throw Error('Distribution service rejected publication (HTTP '+response.status+')');}
  const reader=response.body?.getReader();if(!reader)throw Error('Missing publication receipt');
  const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>16384)throw Error('Publication receipt exceeds 16 KiB');parts.push(next.value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const receipt=strictJson(Buffer.concat(parts)) as any;
  if(!receipt || Object.keys(receipt).sort().join(',')!=='appId,sha256,url,version' || receipt.appId!==manifest.appId || receipt.version!==manifest.version || receipt.sha256!==manifest.sha256 || typeof receipt.url!=='string' || receipt.url.length>2048)throw Error('Publication receipt does not match the signed package');
  endpointUrl(receipt.url);return receipt as {appId:string;version:string;sha256:string;url:string};
}
async function main(){
  const args=process.argv.slice(2),flags=new Map<string,string>();let dry=false;
  for(let i=0;i<args.length;i++){if(args[i]==='--dry-run' && !dry){dry=true;continue;}const name=args[i],value=args[++i];if(!['--package','--public-key','--endpoint','--device'].includes(name) || flags.has(name) || !value || value.startsWith('--'))throw Error('Usage: pjm publish --package <release-directory> --public-key <raw-key-file> --device ios|android [--endpoint <HTTPS-url>] [--dry-run]');flags.set(name,value);}
  if(!flags.has('--package') || !flags.has('--public-key') || !['ios','android'].includes(flags.get('--device')??''))throw Error('Publish requires --package, --public-key and --device ios|android');
  const prepared=preparePublication(flags.get('--package')!,flags.get('--public-key')!,flags.get('--device') as 'ios'|'android');
  if(dry){console.log(JSON.stringify({appId:prepared.manifest.appId,version:prepared.manifest.version,sha256:prepared.manifest.sha256,bytes:prepared.payload.length,target:flags.get('--device'),verified:true}));return;}
  if(!flags.has('--endpoint'))throw Error('Publish requires the distribution service HTTPS endpoint');
  const receipt=await uploadPublication(prepared,flags.get('--endpoint')!,process.env.PJM_PUBLISH_TOKEN??'');console.log('Published '+receipt.appId+' '+receipt.version+': '+receipt.url);
}
if(import.meta.main)main().catch(error=>{console.error('pjm: '+error.message);process.exitCode=1;});
