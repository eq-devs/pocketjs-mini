import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {canonical} from '../container/package.ts';
import {admitReplayPlan} from '../devtools/plan.ts';
import type {NativeTape} from '../devtools/tape.ts';
const tape:NativeTape={format:1,launchData:'{}',packageSha256:'a'.repeat(64),target:'pjm-ios',window:{width:64,height:64,density:1},steps:[]};
const plan={app:{id:'dev.pjm.replay',version:'1.0.0'},target:{id:'pjm-ios',hostAbi:7},viewport:{logical:[64,64],physical:[64,64],rasterDensity:1,presentation:'native',policy:'fixed'},features:{'input.touch':true},companions:[],modality:{form:'takeover',touch:'primary',pointer:'none',buttons:false,analog:0,screens:[{role:'primary',logical:[64,64],touch:true,resizable:false,orientation:'portrait'}]}};
const signed=(value:any)=>Buffer.from(JSON.stringify({...value,planHash:'sha256:'+createHash('sha256').update(canonical(value)).digest('hex')}));
test('replay plan admission rejects identity/viewport/capability mismatch before engine boot',()=>{
 const identity={appId:'dev.pjm.replay',version:'1.0.0'};admitReplayPlan(signed(plan),tape,identity);
 for(const patch of [{app:{id:'dev.other.app',version:'1.0.0'}},{target:{id:'pjm-android',hostAbi:7}},{viewport:{...plan.viewport,physical:[128,64]}},{features:{'net.http':true}},{companions:[{}]},{modality:{...plan.modality,analog:true}},{modality:{...plan.modality,screens:[{...plan.modality.screens[0],touch:1}]}}])expect(()=>admitReplayPlan(signed({...plan,...patch}),tape,identity)).toThrow();
 expect(()=>admitReplayPlan(Buffer.from(signed(plan).toString().replace('"policy":"fixed"','"policy":"stretch"')),tape,identity)).toThrow('hash mismatch');
});
test('native replay binding source bundles without loading or executing a library',async()=>{
 const result=await Bun.build({entrypoints:[new URL('../devtools/native-engine.ts',import.meta.url).pathname],target:'bun',write:false});expect(result.success).toBe(true);
});
