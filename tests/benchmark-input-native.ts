import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {selectPocketInputs} from '../container/pocket-inputs.ts';
import {strictJson} from '../container/strict-json.ts';
import {nativeReplayEngine} from "../devtools/native-engine.ts";
import {decodeInspectorTree} from "../devtools/tree.ts";
const payload=readFileSync(new URL("../examples/benchmark/build/benchmark.pocket",import.meta.url));
const plan=strictJson(selectPocketInputs(payload,"pjm-android","dev.pjm.benchmark").plan) as {app:{id:string;version:string};viewport:{logical:number[];rasterDensity:number}};
const engine=nativeReplayEngine(new URL("../core-ffi/target/release/libmini_core_ffi.dylib",import.meta.url).pathname,{appId:plan.app.id,version:plan.app.version},true);
try{
  engine.boot(payload,{format:1,packageSha256:createHash("sha256").update(payload).digest("hex"),target:"pjm-android",launchData:"{}",window:{width:plan.viewport.logical[0],height:plan.viewport.logical[1],density:plan.viewport.rasterDensity},steps:[]});
  engine.frame([],[],[]);
  for(const invalid of [NaN,Infinity,-Infinity]){
    let rejected=false;try{engine.hitTest!(invalid,0);}catch{rejected=true;}
    if(!rejected)throw Error("Non-finite hit-test coordinate accepted");
  }
  if(process.env.PJM_BENCHMARK_SWIPES==="6"){
    const rowMax=()=>Math.max(0,...decodeInspectorTree(engine.inspectTree!()).nodes.map(node=>Number(node.text.match(/^(?:Item )?(\d+)$/)?.[1]??0)));
    const before=rowMax();
    for(let swipe=0;swipe<6;swipe++){
      const hit=engine.hitTest!(195,650);
      if(!hit)throw Error("Swipe start hit missing");
      const samples=process.env.PJM_BENCHMARK_COMPRESSED==="1"?2:60;
      for(let sample=0;sample<samples;sample++){
        const y=Math.round(650-450*sample/(samples-1)),id=swipe+2;
        const packed=y>511?((0x80000000|(id<<20)|(y<<10)|195)>>>0):((id<<18)|(y<<9)|195);
        engine.frame([packed],[hit],[]);
      }
      engine.frame([],[],[]);
    }
    if(rowMax()<=before)throw Error("Deterministic swipe sequence did not advance visible rows");
    console.log("Native visible rows advanced",before,rowMax());
  }
  const tree=decodeInspectorTree(engine.inspectTree!());
  const toggle=tree.nodes.find(node=>node.text==="Form");if(!toggle)throw Error("Form toggle missing");
  const contact=((1<<18)|(32<<9)|340)>>>0;
  const toggleHit=engine.hitTest!(340,32);if(!toggleHit)throw Error("Form toggle hit missing");
  engine.frame([contact],[toggleHit],[]);engine.frame([],[],[]);engine.frame([],[],[]);
  const result=decodeInspectorTree(engine.inspectTree!());
  mkdirSync("build/benchmark-native-input",{recursive:true});
  writeFileSync("build/benchmark-native-input/"+(process.env.PJM_BENCHMARK_SWIPES==="6"?"scroll-form":"form-only")+".json",JSON.stringify(result,null,2));
  console.log(JSON.stringify(result.nodes.filter(node=>node.text).map(node=>({id:node.id,text:node.text}))));
  const newsletter=result.nodes.find(node=>node.text==="Newsletter: ");
  if(!newsletter||!result.nodes.some(node=>node.parent===newsletter.parent&&node.text==="No"))throw Error("Mode-switch tap changed newsletter state");
}finally{engine.close();}
