import {generateKeyPairSync,createHash} from "node:crypto";
import {writeFileSync,readFileSync} from "node:fs";
import {signPackage,canonical} from "../container/package.ts";
import {encodePocketPackage,encodeIdentity,decodePocketPackage} from "../examples/hello/.pjm/pocketjs/contracts/spec/pocket-package.ts";
const keys=generateKeyPairSync("ed25519"), key=keys.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("base64");
const target=process.env.PJM_PACKAGE_TARGET==="android"?"pjm-android":"pjm-ios";
const metadata={appId:"dev.pjm.fixture",version:"1.0.0",minHostAbi:7,entry:"main.pocket" as const,pages:["/"],permissions:process.env.PJM_PACKAGE_LOCATION_SDK_TEST==="1"?["media","location","clipboard.read"]:["media"],domains:["example.com"],targets:[target]};
const hashPlan=(plan:any)=>({...plan,planHash:"sha256:"+createHash("sha256").update(canonical(plan)).digest("hex")});
let backSdkGuest="";
if(process.env.PJM_PACKAGE_BACK_TEST==='1'){
  metadata.pages.push('/detail');
  const sdkPath=new URL('../sdk/native.ts',import.meta.url).pathname;
  const source=`import {connectMiniApp} from ${JSON.stringify(sdkPath)};
    const mini=connectMiniApp({pages:['/','/detail']});globalThis.__pjmFrameHook=globalThis.frame;
    mini.navigation.subscribe(stack=>{ui.setProp(1,64,stack.length===1?0xff00ff00:0xff0000ff);if(stack.length===1)ui.svcSend('back-root-pass');});
    mini.after(1,()=>{mini.navigation.push('/detail',{id:'retained'});ui.svcSend('back-ready');});`;
  const result=await Bun.build({entrypoints:['pjm-sdk-back-fixture'],target:'browser',format:'iife',plugins:[{name:'fixture',setup(build){build.onResolve({filter:/^pjm-sdk-back-fixture$/},()=>({path:'fixture',namespace:'pjm-fixture'}));build.onLoad({filter:/.*/,namespace:'pjm-fixture'},()=>({contents:source,loader:'ts'}));}}]});
  if(!result.success)throw new Error(result.logs.join('\n'));backSdkGuest=';'+await result.outputs[0].text();
}
let sdkResourceGuest="";
if(process.env.PJM_PACKAGE_HTTP_TEST==='sdk-resource'){
  const sdkPath=new URL('../sdk/native.ts',import.meta.url).pathname;
  const source=`import {connectMiniApp} from ${JSON.stringify(sdkPath)};
    const mini=connectMiniApp();mini.after(1,()=>{
      mini.http({url:'https://example.com/',responseMode:'resource'}).promise.then(response=>{
        if(!response.resource || response.resource.size!==4097)throw Error('SDK resource mismatch');
        const {handle,size}=response.resource;
        const read=(offset)=>mini.resources.read({handle,offset,count:1536}).promise.then(chunk=>{
          const length=chunk.nextOffset-offset,expected='/'.repeat(Math.floor(length/3)*4)+(length%3===1?'/w==':length%3===2?'//8=':'');
          if(chunk.bodyBase64!==expected || chunk.size!==size)throw Error('SDK resource bytes mismatch');
          if(!chunk.eof)return read(chunk.nextOffset);
          return mini.resources.release(handle).promise.then(()=>mini.resources.read({handle,offset:0,count:1}).promise.then(()=>{throw Error('Released SDK handle readable');},error=>{
            if(error.code!=='DENIED')throw error;ui.setProp(1,64,0xff00ff00);ui.svcSend('http-live-pass:sdk-resource-'+size);
          }));
        });return read(0);
      });
    });`;
  const result=await Bun.build({entrypoints:['pjm-sdk-resource-fixture'],target:'browser',format:'iife',plugins:[{name:'fixture',setup(build){build.onResolve({filter:/^pjm-sdk-resource-fixture$/},()=>({path:'fixture',namespace:'pjm-fixture'}));build.onLoad({filter:/.*/,namespace:'pjm-fixture'},()=>({contents:source,loader:'ts'}));}}]});
  if(!result.success)throw new Error(result.logs.join('\n'));sdkResourceGuest=';'+await result.outputs[0].text();
}
let locationSdkGuest="";
if(process.env.PJM_PACKAGE_LOCATION_SDK_TEST==='1'){
  const sdkPath=new URL('../sdk/native.ts',import.meta.url).pathname;
  const source=`import {connectMiniApp} from ${JSON.stringify(sdkPath)};
    let mini;try{mini=connectMiniApp();globalThis.__pjmFrameHook=globalThis.frame;mini.location.get({timeoutMs:5000,maximumAgeMs:60000,highAccuracy:false}).promise.then(position=>{
      if(Math.abs(position.latitude-43.238949)>.001||Math.abs(position.longitude-76.889709)>.001||position.accuracyMeters<0||!Number.isSafeInteger(position.timestampMs))throw Error('Location SDK response mismatch');
      return mini.clipboard.write('PocketJS SDK 😀').promise.then(()=>mini.clipboard.read().promise).then(text=>{if(text!=='PocketJS SDK 😀')throw Error('Clipboard SDK response mismatch');mini.dispose();ui.svcSend('location-sdk-pass:'+position.latitude+','+position.longitude+':clipboard');});
    },error=>ui.svcSend('location-sdk-error:'+error.code+':'+error.message));}catch(error){ui.svcSend('location-sdk-error:throw:'+error.message);}`;
  const result=await Bun.build({entrypoints:['pjm-sdk-location-fixture'],target:'browser',format:'iife',plugins:[{name:'fixture',setup(build){build.onResolve({filter:/^pjm-sdk-location-fixture$/},()=>({path:'fixture',namespace:'pjm-fixture'}));build.onLoad({filter:/.*/,namespace:'pjm-fixture'},()=>({contents:source,loader:'ts'}));}}]});
  if(!result.success)throw new Error(result.logs.join('\n'));locationSdkGuest=';'+await result.outputs[0].text();
}
const liveHttpGuest=process.env.PJM_PACKAGE_HTTP_TEST==='live'?`;
const livePreviousFrame=globalThis.frame;let liveTicks=0,liveDone=false;
globalThis.frame=(...args)=>{
  liveTicks++;if(liveTicks===1)ui.svcSend(JSON.stringify({v:1,id:720,kind:'request.v1',args:{url:'https://example.com/'}}));
  const incoming=ui.svcPoll();if(liveTicks===1 && incoming)throw new Error('Same-frame live completion');
  if(incoming)for(const line of incoming.trim().split(String.fromCharCode(92)+'n').join(String.fromCharCode(10)).split(String.fromCharCode(10))){
    const reply=JSON.parse(line);if(liveDone || reply.v!==1 || reply.id!==720 || !reply.ok || reply.data.status!==200 || typeof reply.data.bodyBase64!=='string' || reply.data.bodyBase64.length<1 || reply.data.bodyBase64.length>2048)throw new Error('Live HTTP response mismatch');
    liveDone=true;ui.setProp(1,64,0xff00ff00);ui.svcSend('http-live-pass:'+reply.data.bodyBase64.length);
  }
  livePreviousFrame(...args);if(liveTicks>1200 && !liveDone)throw new Error('Live HTTP timeout');
}`:'';
const resourceGuest=['resource','resource-large'].includes(process.env.PJM_PACKAGE_HTTP_TEST??'')?`;
const resourcePatternCheck=${process.env.PJM_PACKAGE_HTTP_TEST==='resource-large'};
const resourcePreviousFrame=globalThis.frame;let resourceTicks=0,resourceStage=0,resourceHandle='',resourceSize=0,resourceOffset=0,resourceExpected=730;
const resourceSend=(kind,args)=>ui.svcSend(JSON.stringify({v:1,id:resourceExpected,kind,args}));
globalThis.frame=(...args)=>{
  resourceTicks++;if(resourceTicks===1)resourceSend('request.v1',{url:'https://example.com/',responseMode:'resource'});
  const incoming=ui.svcPoll();if(resourceTicks===1 && incoming)throw new Error('Same-frame resource completion');
  if(incoming)for(const line of incoming.trim().split(String.fromCharCode(92)+'n').join(String.fromCharCode(10)).split(String.fromCharCode(10))){
    const reply=JSON.parse(line);if(reply.v!==1 || reply.id!==resourceExpected)throw new Error('Resource correlation mismatch');resourceExpected++;
    if(resourceStage===0){if(!reply.ok || reply.data.status!==200 || !/^r_[a-f0-9]{32}$/.test(reply.data.resource.handle) || !Number.isInteger(reply.data.resource.size) || reply.data.resource.size<1 || reply.data.resource.size>1048576)throw new Error('Resource response mismatch');resourceHandle=reply.data.resource.handle;resourceSize=reply.data.resource.size;resourceStage=1;resourceSend('resource.read.v1',{handle:resourceHandle,offset:0,count:1536});}
    else if(resourceStage===1){const data=reply.data,end=Math.min(resourceOffset+1536,resourceSize);if(!reply.ok || data.offset!==resourceOffset || data.nextOffset!==end || data.size!==resourceSize || data.eof!==(end===resourceSize) || typeof data.bodyBase64!=='string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.bodyBase64))throw new Error('Resource chunk mismatch');const decoded=data.bodyBase64.length/4*3-(data.bodyBase64.endsWith('==')?2:data.bodyBase64.endsWith('=')?1:0);if(decoded!==end-resourceOffset)throw new Error('Resource chunk length mismatch');if(resourcePatternCheck && data.bodyBase64!=='/'.repeat(Math.floor(decoded/3)*4)+(decoded%3===1?'/w==':decoded%3===2?'//8=':''))throw new Error('Resource content mismatch');resourceOffset=end;if(end<resourceSize)resourceSend('resource.read.v1',{handle:resourceHandle,offset:end,count:1536});else{resourceStage=2;resourceSend('resource.read.v1',{handle:resourceHandle,offset:resourceSize,count:1});}}
    else if(resourceStage===2){if(!reply.ok || reply.data.offset!==resourceSize || reply.data.nextOffset!==resourceSize || reply.data.size!==resourceSize || reply.data.bodyBase64!=='' || reply.data.eof!==true)throw new Error('Resource EOF mismatch');resourceStage=3;resourceSend('resource.release.v1',{handle:resourceHandle});}
    else if(resourceStage===3){if(!reply.ok || reply.data!==null)throw new Error('Resource release mismatch');resourceStage=4;resourceSend('resource.read.v1',{handle:resourceHandle,offset:0,count:1});}
    else if(resourceStage===4){if(reply.ok || reply.error.code!=='DENIED')throw new Error('Released resource still readable');resourceStage=5;ui.setProp(1,64,0xff00ff00);ui.svcSend('http-live-pass:resource-'+resourceSize);}
    else throw new Error('Duplicate resource completion');
  }
  resourcePreviousFrame(...args);if(resourceTicks>1200 && resourceStage!==5)throw new Error('Resource guest timeout');
}`:'';
const httpGuest=process.env.PJM_PACKAGE_HTTP_TEST==="1"?`;
const previousFrame=globalThis.frame;let httpTicks=0,checked=0,httpDone=false;
globalThis.frame=(...args)=>{
  httpTicks++;
  if(httpTicks===1){
    for(const [id,url] of [[701,'https://example.com/ok'],[702,'https://denied.example/'],[703,'https://example.com/big'],[704,'https://example.com/denied'],[705,'https://example.com/redirect']])ui.svcSend(JSON.stringify({v:1,id,kind:'request.v1',args:{url,headers:id===705?{Authorization:'secret'}:{}}}));
    ui.svcSend(JSON.stringify({v:1,id:710,kind:'request.v1',args:{url:'https://example.com/',headers:{Accept:'é'}}}));
  }
  const incoming=ui.svcPoll();if(httpTicks===1 && incoming)throw new Error('Same-frame HTTP completion');
  if(incoming)for(const line of incoming.trim().split(String.fromCharCode(92)+'n').join(String.fromCharCode(10)).split(String.fromCharCode(10))){
    const reply=JSON.parse(line);const index=[701,702,703,704,705,710].indexOf(reply.id);if(index<0 || reply.v!==1 || checked&(1<<index))throw new Error('Wrong HTTP correlation');
    if(reply.id===701 || reply.id===705){if(!reply.ok || reply.data.status!==200 || reply.data.bodyBase64!=='aGVsbG8=')throw new Error('HTTP success mismatch');}
    else{const expected=reply.id===703?'FAILED':reply.id===710?'PROTOCOL':'DENIED';if(reply.ok || reply.error.code!==expected)throw new Error('HTTP rejection mismatch');}
    checked|=1<<index;
  }
  previousFrame(...args);if(checked===63 && !httpDone){ui.setProp(1,64,0xff00ff00);httpDone=true;}if(httpTicks>120 && checked!==63)throw new Error('HTTP guest completion timeout');
}`:"";
const payload=Buffer.from(encodePocketPackage({manifest:Buffer.from("{}"),variants:[{target,hostAbi:7,sections:[{kind:1,bytes:encodeIdentity({output:"fixture",id:metadata.appId,title:"Fixture"})},{kind:2,bytes:Buffer.from(JSON.stringify(hashPlan({app:{id:metadata.appId,version:metadata.version},target:{id:target,hostAbi:7},viewport:{logical:[64,64],physical:[64,64],rasterDensity:1,presentation:"native",policy:"fixed"},features:{"input.touch":true,"text.glyphs.baked":true},companions:[],modality:{form:"takeover",screens:[{role:"primary",logical:[64,64],orientation:"portrait",touch:true,resizable:false}],touch:"primary",pointer:"none",buttons:false,analog:0}}))) },{kind:3,bytes:Buffer.from((process.env.PJM_PACKAGE_VISUAL?"globalThis.__visual=true;ui.setProp(1,64,0xff0000ff);":"")+"let launches=0,frames=0;globalThis.__miniLifecycle=e=>{if(e==='launch')launches++;if(e==='unload'){ui.svcSend('cleanup');ui.svcSend(JSON.stringify({v:1,id:99,kind:'storage.set.v1',args:{key:'cleanup-proof',value:'saved'}}))}};const fixtureFrame=(buttons,analog,contacts)=>{if(globalThis.__visual && contacts.length)ui.setProp(1,64,0xffff0000);const incoming=ui.svcPoll();if(incoming)for(const line of incoming.trim().split('\\n')){if(line==='pump')ui.svcSend(JSON.stringify({v:1,id:456,kind:'storage.get.v1',args:{key:'live-proof'}}));else if(line!=='pressure')ui.svcSend('reply:'+line)};ui.svcSend('verified:'+launches+':'+(++frames))};globalThis.frame=(...args)=>{const hook=globalThis.__pjmFrameHook;if(hook){globalThis.__pjmFrameHook=null;try{return hook(...args)}finally{globalThis.__pjmFrameHook=hook}}return fixtureFrame(...args)}"+httpGuest+liveHttpGuest+resourceGuest+sdkResourceGuest+locationSdkGuest+backSdkGuest+"\0")},{kind:4,bytes:new Uint8Array()}]}]}));
const valid={payload:payload.toString("base64"),manifest:signPackage(payload,metadata,keys.privateKey),key,valid:true,...(process.env.PJM_PACKAGE_LOCATION_TEST==="1"?{locationCase:{payload:payload.toString("base64"),manifest:signPackage(payload,{...metadata,permissions:["media","location"]},keys.privateKey)}}:{})};
const basePlan=JSON.parse(Buffer.from(decodePocketPackage(payload).variants[0].sections.find(section=>section.kind===2)!.bytes).toString());
const rejectedPlans=[{...basePlan,planHash:"bad"},{...basePlan,planHash:"sha256:"+"0".repeat(64)},{...basePlan,modality:{...basePlan.modality,screens:[]}},{...basePlan,modality:{...basePlan.modality,pointer:"mouse"}},{...basePlan,modality:{...basePlan.modality,buttons:true}},{...basePlan,modality:{...basePlan.modality,analog:true}},{...basePlan,modality:{...basePlan.modality,screens:[{...basePlan.modality.screens[0],logical:[32,64]}]}},{...basePlan,features:{"net.http":true}},{...basePlan,features:{"input.touch":1}},{...basePlan,companions:[{id:"other"}]},{...basePlan,viewport:{...basePlan.viewport,presentation:"stretch"}},{app:{id:metadata.appId,version:"2.0.0"},target:{id:target,hostAbi:7},viewport:{logical:[64,64],physical:[64,64],rasterDensity:1}},{app:{id:metadata.appId,version:metadata.version},target:{id:target,hostAbi:7},viewport:{logical:[64,64],physical:[128,64],rasterDensity:1}},{app:{id:metadata.appId,version:metadata.version},target:{id:target,hostAbi:7},viewport:{logical:[64,64],physical:[64,64],rasterDensity:true}}].map(plan=>{if(plan.planHash!=="bad" && plan.planHash!=="sha256:"+"0".repeat(64)){const {planHash,...content}=plan;plan=hashPlan(content);}const decoded=decodePocketPackage(payload);decoded.variants[0].sections.find(section=>section.kind===2)!.bytes=Buffer.from(JSON.stringify(plan));const bytes=Buffer.from(encodePocketPackage(decoded));return {...valid,payload:bytes.toString("base64"),manifest:signPackage(bytes,metadata,keys.privateKey),valid:false};});
// Correctly signed payloads with ambiguous plan JSON must fail native admission.
for(const prefix of ['{"app":null,','{"\\u0061pp":null,','\ufeff{']){
 const malformed=decodePocketPackage(payload),plan=malformed.variants[0].sections.find(section=>section.kind===2)!;
 plan.bytes=Buffer.from(prefix+Buffer.from(plan.bytes).toString().slice(1));
 const bytes=Buffer.from(encodePocketPackage(malformed));rejectedPlans.push({...valid,payload:bytes.toString("base64"),manifest:signPackage(bytes,metadata,keys.privateKey),valid:false});
}
const realCases=[];
if(process.env.PJM_PACKAGE_REAL){const bytes=readFileSync(process.env.PJM_PACKAGE_REAL);const decoded=decodePocketPackage(bytes),variant=decoded.variants.find(v=>v.target===target)!;const plan=JSON.parse(Buffer.from(variant.sections.find(s=>s.kind===2)!.bytes).toString());realCases.push({payload:bytes.toString("base64"),manifest:signPackage(bytes,{...metadata,appId:plan.app.id,version:plan.app.version},keys.privateKey),key,valid:true});}
const updateDecoded=decodePocketPackage(payload);
// Hash only plan content; the old hash must not be included.
const updatePlan={...basePlan,app:{...basePlan.app,version:"2.0.0"}};delete updatePlan.planHash;
updateDecoded.variants[0].sections.find(section=>section.kind===2)!.bytes=Buffer.from(JSON.stringify(hashPlan(updatePlan)));
const updatePayload=Buffer.from(encodePocketPackage(updateDecoded));
const update={payload:updatePayload.toString("base64"),manifest:signPackage(updatePayload,{...metadata,version:"2.0.0"},keys.privateKey)};
const peers=[1,2,3].map(index=>{
 const appId=metadata.appId+".peer"+index,decoded=decodePocketPackage(payload),plan={...basePlan,app:{...basePlan.app,id:appId}};delete plan.planHash;
 decoded.variants[0].sections.find(section=>section.kind===1)!.bytes=encodeIdentity({output:"fixture",id:appId,title:"Fixture"});
 decoded.variants[0].sections.find(section=>section.kind===2)!.bytes=Buffer.from(JSON.stringify(hashPlan(plan)));
 const bytes=Buffer.from(encodePocketPackage(decoded));return {payload:bytes.toString("base64"),manifest:signPackage(bytes,{...metadata,appId},keys.privateKey)};
});
writeFileSync(process.argv[2],JSON.stringify([...realCases,{...valid,update,peers},...rejectedPlans,{...valid,manifest:signPackage(payload,{...metadata,appId:"dev.other.app"},keys.privateKey),valid:false},{...valid,payload:Buffer.from("tampered").toString("base64"),valid:false},{...valid,payload:Buffer.from("not a pocket package").toString("base64"),manifest:signPackage(Buffer.from("not a pocket package"),metadata,keys.privateKey),valid:false}]));
