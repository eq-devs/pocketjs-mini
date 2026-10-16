import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,symlinkSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {compileApplication} from '../bin/compiler.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';
import {encodeReplayPNG} from '../devtools/png.ts';
const root=resolve(import.meta.dir,'..'),upstream=resolve(process.env.PJM_TEST_UPSTREAM??join(root,'examples/hello/.pjm/pocketjs'));
const temporary=mkdtempSync(join(tmpdir(),'pjm-ui-native-')),project=join(temporary,'app');
const evidence=process.env.PJM_UI_EVIDENCE; if(evidence)mkdirSync(evidence,{recursive:true});
try{
 cpSync(join(root,'examples/ui-overlays'),project,{recursive:true,filter:path=>!['.pjm','node_modules','build'].includes(path.split('/').at(-1)!)});
 mkdirSync(join(project,'.pjm'));symlinkSync(upstream,join(project,'.pjm/pocketjs'));
 for(const platform of ['ios','android'] as const){
  const window={width:360,height:512,density:1};const compiled=await compileApplication({upstream,project,directory:join(temporary,platform),window,platform});
  const engine=nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:'dev.pjm.ui-overlays',version:'0.0.1'},true);
  try{
   engine.boot(compiled.packed,{format:1,target:`pjm-${platform}`,window,launchData:'{}',packageSha256:createHash('sha256').update(compiled.packed).digest('hex'),steps:[]});
   const frame=()=>engine.frame([],[],[]);frame();frame();
   const tree=()=>decodeInspectorTree(engine.inspectTree!());
   const texts=()=>tree().nodes.map(n=>n.text).join('');
   const save=(name:string)=>{if(!evidence)return;const output=frame();writeFileSync(join(evidence,platform+'-'+name+'.png'),encodeReplayPNG(360,512,output.pixels));writeFileSync(join(evidence,platform+'-'+name+'.json'),JSON.stringify(tree()));};
   const tap=(label:string)=>{
    const nodes=tree().nodes;let node=nodes.find(n=>n.text===label);assert.ok(node,'Missing text '+label);while(node&&!node.bounds)node=nodes.find(n=>n.id===node!.parent);assert.ok(node?.bounds,'Missing visible ancestor '+label);const [x,y,w,h]=node.bounds;const cx=Math.floor(x+w/2),cy=Math.floor(y+h/2);assert.ok(cx>=0&&cx<360&&cy>=0&&cy<512,'Off-screen button '+label);
    const hit=engine.hitTest!(cx,cy);assert.notEqual(hit,0);engine.frame([(1<<18)|(cy<<9)|cx],[hit],[]);frame();frame();
   };
   save('initial');tap('Show dialog');assert.ok(texts().includes('Save changes?'));save('dialog');
   tap('Background count: ');assert.ok(texts().includes('Background count: 0'),'Modal must block background input');
   tap('Save');assert.ok(texts().includes('Dialog saved'));assert.ok(!texts().includes('Save changes?'));
   tap('Show actions');save('actions');tap('Green');assert.ok(texts().includes('Selected 1'));
   tap('Show actions');tap('Cancel');assert.ok(texts().includes('CANCELLED'));
   tap('Show toast');assert.ok(texts().includes('Saved toast'));save('toast');for(let n=0;n<121;n++)frame();assert.ok(!texts().includes('Saved toast'));assert.ok(texts().includes('Toast finished'));
   tap('Show dialog');engine.lifecycle('hide');engine.lifecycle('show');frame();assert.ok(!texts().includes('Save changes?'));assert.ok(texts().includes('CANCELLED'));save('resumed');
   console.log(platform+' real compiled TSX/native QuickJS UI passed: dialog confirm, action select/cancel, modal background blocking, toast expiry and hide cleanup. Software rendering only.');
  }finally{engine.close();}
 }
}finally{rmSync(temporary,{recursive:true,force:true});}
