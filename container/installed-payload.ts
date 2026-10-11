import {selectPocketInputs} from './pocket-inputs.ts';
import {strictJson} from './strict-json.ts';
import {admitReplayPlan} from '../devtools/plan.ts';
import type {SignedManifest} from './package.ts';

/** Validate an already authenticated package against the native build contract. */
export function admitInstalledPayload(payload:Uint8Array,manifest:SignedManifest,target:'pjm-ios'|'pjm-android') {
 const selected=selectPocketInputs(payload,target,manifest.appId),plan=strictJson(selected.plan) as any;
 const width=plan?.viewport?.logical?.[0],height=plan?.viewport?.logical?.[1],density=plan?.viewport?.rasterDensity;
 if(![width,height,density].every(Number.isSafeInteger)||width<1||width>1024||height<1||height>1024||density<1||density>4||width*height*density*density*4>16*1024*1024)throw Error('Native package plan viewport limits');
 admitReplayPlan(selected.plan,{target,window:{width,height,density}},{appId:manifest.appId,version:manifest.version});
}
