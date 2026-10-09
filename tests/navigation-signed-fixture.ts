import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {compileApplication} from '../bin/compiler.ts';
import {signPackage} from '../container/package.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';

// Observe the actual example via its normal SDK storage service. This appended
// observer is test-only; it changes neither routing nor the shipping example.
export async function signedNavigationFixture(directory:string,platform:'ios'|'android',width:number,height:number,density:number){
 const root=resolve(import.meta.dir,'..'),project=join(directory,'navigation');
 mkdirSync(join(project,'app'),{recursive:true});mkdirSync(join(project,'.pjm'));
 symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
 for(const name of ['mini.json','tsconfig.json'])writeFileSync(join(project,name),readFileSync(join(root,'examples/navigation',name)));
 const mediaUi=process.env.PJM_MEDIA_UI_CASE;
 if(mediaUi){assert.ok(['deny','cancel','provider','overflow','late'].includes(mediaUi));assert.ok(!['provider','overflow','late'].includes(mediaUi)||platform==='ios','Controlled provider fixture requires iOS');const config=JSON.parse(readFileSync(join(project,'mini.json'),'utf8'));config.permissions=['media'];writeFileSync(join(project,'mini.json'),JSON.stringify(config));}
 const observer=`\nimport {createEffect} from "solid-js";
 createEffect(()=>{route();mini.storage.set("navigation-proof",{path:mini.navigation.current.path,item:mini.navigation.current.query.item??null,count:count()}).promise.catch(error=>{throw Error("Navigation proof storage: "+error.code);});});
 let networkEvents=0;
 const saveNetwork=(state:import("@pocketjs/mini").NetworkState)=>mini.storage.set("network-proof",{state,events:networkEvents}).promise.catch(error=>{throw Error("Network proof storage: "+error.code);});
 const networkWatch=mini.network.watch(state=>{networkEvents++;saveNetwork(state);});
 networkWatch.promise.then(saveNetwork).catch(error=>{throw Error("Network proof watch: "+error.code);});\n`;
 const lateObserver=`
let firstMedia:ReturnType<typeof mini.media.select>;
const proveMedia=(code:string)=>mini.storage.set("media-proof",{code}).promise;
const checkProvider=()=>mini.storage.get<boolean>("media-provider-start").promise.then(started=>{if(!started){mini.after(1,checkProvider);return;}firstMedia.cancel();});
mini.storage.remove("media-provider-start").promise.then(()=>mini.storage.remove("media-provider-done").promise).then(()=>{firstMedia=mini.media.select();firstMedia.promise.then(onFirstSuccess,onFirstError);mini.after(1,checkProvider);});
const onFirstSuccess=()=>proveMedia("UNEXPECTED_SUCCESS");
const onFirstError=(error:{code:string})=>{if(error.code!=="CANCELLED")return proveMedia(error.code);return mini.media.select().promise.then(()=>proveMedia("UNEXPECTED_EARLY_SUCCESS"),busy=>{if(busy.code!=="BUSY")return proveMedia(busy.code);const recover=()=>mini.storage.get<boolean>("media-provider-done").promise.then(done=>{if(!done){mini.after(1,recover);return;}mini.media.select().promise.then(image=>mini.resources.release(image.resource.handle).promise.then(()=>proveMedia("RECOVERED")),retry=>{if(retry.code==="BUSY")mini.after(10,recover);else proveMedia(retry.code);});});mini.after(1,recover);});};
`;
 const mediaObserver=mediaUi==='late'?lateObserver:mediaUi==='provider'?`
mini.media.select().promise.then(image=>{if(image.mime!=="image/jpeg"||image.width!==64||image.height!==32)throw Error("Wrong native image");return mini.resources.read({handle:image.resource.handle,offset:0,count:3}).promise.then(chunk=>{if(chunk.bodyBase64!=="/9j/"||chunk.size!==image.resource.size)throw Error("Wrong native JPEG resource");return mini.resources.release(image.resource.handle).promise;});}).then(()=>mini.storage.set("media-proof",{code:"SUCCESS"}).promise,error=>mini.storage.set("media-proof",{code:error.code??"FAILED"}).promise);
`:mediaUi?'\nmini.media.select().promise.then(()=>{throw Error("Unexpected picker image in cancellation test");},error=>mini.storage.set("media-proof",{code:error.code}).promise);\n':'';
 writeFileSync(join(project,'app/main.tsx'),readFileSync(join(root,'examples/navigation/app/main.tsx'),'utf8')+observer+mediaObserver);
 const window={width,height,density,top:0,bottom:0,left:0,right:0};
 const compiled=await compileApplication({project,upstream:join(project,'.pjm/pocketjs'),directory:join(project,'build'),platform,window});
 const keys=generateKeyPairSync('ed25519');
 const envelope=signPackage(compiled.packed,compiled.metadata,keys.privateKey);
 const publicKey=keys.publicKey.export({format:'der',type:'spki'}).subarray(-32);
 const payloadPath=join(directory,'main.pocket'),envelopePath=join(directory,'manifest.json'),publicKeyPath=join(directory,'publisher.key');
 writeFileSync(payloadPath,compiled.packed);writeFileSync(envelopePath,JSON.stringify(envelope));writeFileSync(publicKeyPath,publicKey);
 const engine=nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:compiled.metadata.appId,version:compiled.metadata.version},true);
 try{
  engine.boot(compiled.packed,{format:1,packageSha256:createHash('sha256').update(compiled.packed).digest('hex'),target:'pjm-'+platform,launchData:'{}',window:{width,height,density},steps:[]});
  engine.frame([],[],[]);
  const tree=()=>decodeInspectorTree(engine.inspectTree!());
  const point=(label:string)=>{const nodes=tree().nodes,marker=nodes.find(node=>node.text===label);assert.ok(marker,'Missing '+label);const bounds=nodes.find(node=>node.id===marker.parent)?.bounds;assert.ok(bounds,'Missing bounds '+label);return [Math.round(bounds[0]+bounds[2]/2),Math.round(bounds[1]+bounds[3]/2)];};
  const increment=point('Increment counter'),detail=point('Open detail');
  let id=0;
  const tap=(point:number[])=>{const [x,y]=point,hit=engine.hitTest!(x,y);assert.ok(hit);id++;const packed=x>511||y>511?(0x80000000|(id<<20)|(y<<10)|x)>>>0:((id<<18)|(y<<9)|x)>>>0;engine.frame([packed],[hit],[]);engine.frame([],[],[]);};
  tap(increment);tap(detail);
  const text=tree().nodes.map(node=>node.text).join('');assert.match(text,/Detail page/);assert.match(text,/Selected item: 42/);assert.match(text,/Saved counter: 1/);
  const back=point('Back to home');
  writeFileSync(join(directory,'input-points.json'),JSON.stringify({increment,detail,back,width,height,density},null,2));
  return {payload:payloadPath,envelope:envelopePath,publicKey:publicKeyPath,metadata:compiled.metadata,points:{increment,detail,back,width,height,density}};
 }finally{engine.close();}
}
