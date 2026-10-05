import {createHash} from 'node:crypto';
import {canonical} from '../container/package.ts';
import {strictJson} from '../container/strict-json.ts';
import type {NativeTape} from './tape.ts';
export function admitReplayPlan(bytes:Uint8Array,tape:Pick<NativeTape,'target'|'window'>,identity:{appId:string;version:string}):void{
 if(!bytes.length||bytes.length>1024*1024)throw Error('Replay plan byte limit');
 const plan=strictJson(bytes) as any;
 if(!plan||typeof plan!=='object'||Array.isArray(plan))throw Error('Replay plan object');
 const {planHash,...body}=plan;
 if(planHash!=='sha256:'+createHash('sha256').update(canonical(body)).digest('hex'))throw Error('Replay plan hash mismatch');
 const {width,height,density}=tape.window,v=plan.viewport,m=plan.modality;
 const pair=(value:any,a:number,b:number)=>Array.isArray(value)&&value.length===2&&value[0]===a&&value[1]===b;
 if(plan.app?.id!==identity.appId||plan.app?.version!==identity.version||plan.target?.id!==tape.target||plan.target?.hostAbi!==7||!pair(v?.logical,width,height)||!pair(v?.physical,width*density,height*density)||v?.rasterDensity!==density||v?.presentation!=='native'||v?.policy!=='fixed')throw Error('Replay plan identity or viewport mismatch');
 if(!plan.features||typeof plan.features!=='object'||Array.isArray(plan.features)||Object.entries(plan.features).some(([key,value])=>typeof value!=='boolean'||value&&!['input.touch','text.glyphs.baked'].includes(key))||!Array.isArray(plan.companions)||plan.companions.length||m?.form!=='takeover'||m?.touch!=='primary'||m?.pointer!=='none'||m?.buttons!==false||m?.analog!==0||!Array.isArray(m?.screens)||m.screens.length!==1)throw Error('Replay plan capabilities incompatible');
 const screen=m.screens[0];if(screen?.role!=='primary'||!pair(screen.logical,width,height)||screen.touch!==true||screen.resizable!==false||!['portrait','landscape'].includes(screen.orientation))throw Error('Replay plan screen incompatible');
}
