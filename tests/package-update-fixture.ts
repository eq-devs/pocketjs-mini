import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {compileApplication} from '../bin/compiler.ts';
import {signPackage} from '../container/package.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';
export async function updateFixture(temp:string,platform:'ios'|'android',rotatePublisher=false) {
 const root=resolve(import.meta.dir,'..');
 const keys=generateKeyPairSync('ed25519'),nextKeys=rotatePublisher?generateKeyPairSync('ed25519'):keys;const releases=[];
 for(const [version,color] of [['1.0.0','red'],['2.0.0','green']]){
  const project=join(temp,version);mkdirSync(join(project,'app'),{recursive:true});mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
  writeFileSync(join(project,'tsconfig.json'),readFileSync(join(root,'examples/navigation/tsconfig.json')));writeFileSync(join(project,'mini.json'),JSON.stringify({name:'update-proof',version,pages:['/']}));
  writeFileSync(join(project,'app/main.tsx'),`import {createSignal,createEffect} from 'solid-js';import {mount} from '@pocketjs/framework/solid';import {View,Text} from '@pocketjs/framework/components';import {connectMiniApp} from '@pocketjs/mini';const [count,setCount]=createSignal(0);function App(){return <View class="w-full h-full bg-${color}-600 flex-col justify-center items-center gap-4 p-6"><Text class="text-white text-xl">Release ${version}</Text><Text class="text-white text-xl">Counter: {count()}</Text><View focusable onPress={()=>setCount(count()+1)} class="bg-slate-700 p-4 rounded-xl"><Text class="text-white text-base">Increment update counter</Text></View></View>;}mount(App);const mini=connectMiniApp();createEffect(()=>{mini.storage.set('update-proof',{version:'${version}',count:count()}).promise.catch(error=>{throw Error('Update proof '+error.code);});});`);
  const compiled=await compileApplication({project,upstream:join(project,'.pjm/pocketjs'),directory:join(project,'build'),platform,window:{width:360,height:598,density:3,top:0,bottom:0,left:0,right:0}});
  releases.push({payload:compiled.packed,envelope:signPackage(compiled.packed,compiled.metadata,version==='1.0.0'?keys.privateKey:nextKeys.privateKey),metadata:compiled.metadata});
 }
 const [old,next]=releases;assert.equal(old.metadata.appId,next.metadata.appId);assert.equal(next.metadata.version,'2.0.0');
 const engine=nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:old.metadata.appId,version:old.metadata.version},true);let point:number[];
 try{engine.boot(old.payload,{format:1,packageSha256:createHash('sha256').update(old.payload).digest('hex'),target:'pjm-'+platform,launchData:'{}',window:{width:360,height:598,density:3},steps:[]});engine.frame([],[],[]);const nodes=decodeInspectorTree(engine.inspectTree!()).nodes,marker=nodes.find(node=>node.text==='Increment update counter');assert.ok(marker);const bounds=nodes.find(node=>node.id===marker.parent)?.bounds;assert.ok(bounds);point=[bounds[0]+bounds[2]/2,bounds[1]+bounds[3]/2];}finally{engine.close();}
 return {old,next,point:point!,publicKey:keys.publicKey.export({format:'der',type:'spki'}).subarray(-32),nextPublicKey:nextKeys.publicKey.export({format:'der',type:'spki'}).subarray(-32)};
}
