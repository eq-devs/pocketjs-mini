import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,cpSync,symlinkSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {compileApplication} from '../bin/compiler.ts';
import {nativeReplayEngine} from '../devtools/native-engine.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';
import {encodeReplayPNG} from '../devtools/png.ts';
const root=resolve(import.meta.dir,'..'),upstream=resolve(process.env.PJM_TEST_UPSTREAM??join(root,'examples/hello/.pjm/pocketjs'));
const temporary=mkdtempSync(join(tmpdir(),'pjm-ui-layout-')),project=join(temporary,'app');
const evidence=process.env.PJM_UI_EVIDENCE; if(evidence)mkdirSync(evidence,{recursive:true});
const cases=[{name:'compact',width:240,height:280,density:1,safeTop:0,safeBottom:0,safeLeft:0,safeRight:0},{name:'landscape-safe',width:320,height:180,density:1,safeTop:20,safeBottom:12,safeLeft:16,safeRight:4}];
const receipts:unknown[]=[];
try{
 cpSync(join(root,'examples/ui-overlays'),project,{recursive:true,filter:path=>!['.pjm','node_modules','build'].includes(path.split('/').at(-1)!)});
 mkdirSync(join(project,'.pjm'));symlinkSync(upstream,join(project,'.pjm/pocketjs'));
 const source=readFileSync(join(project,'app/main.tsx'),'utf8');
 const dialog={title:'T'.repeat(128),message:'Long message words '.repeat(108).slice(0,2034)+'LAST MESSAGE!!',confirmLabel:'c'.repeat(59)+'\nDONE',cancelLabel:'C'.repeat(64)};
 assert.equal(Buffer.byteLength(dialog.message),2048);
 const items=Array.from({length:8},(_,index)=>'x'.repeat(123)+'\nEND'+(index+1));
 writeFileSync(join(project,'app/main.tsx'),source+`\nmini.after(1,()=>{mini.ui.dialog(${JSON.stringify(dialog)}).promise.then(value=>{setResult('Long dialog '+value.confirmed);mini.after(1,()=>mini.ui.actionSheet({title:'A'.repeat(128),items:${JSON.stringify(items)},cancelLabel:'C'.repeat(64)}).promise.then(value=>{setResult('Selected '+value.index);report(mini.ui.toast({text:'Long toast words '.repeat(32).slice(0,512),durationFrames:600}),()=>'Toast done');}).catch(error=>setResult(error.code)));}).catch(error=>setResult(error.code));});\n`);
 for(const platform of ['ios','android'] as const)for(const config of cases){
  const {name,...window}=config;const prefix=platform+'-'+name;
  const compiled=await compileApplication({upstream,project,directory:join(temporary,prefix),window,platform});
  const engine=nativeReplayEngine(join(root,'core-ffi/target/release/libmini_core_ffi.dylib'),{appId:'dev.pjm.ui-overlays',version:'0.0.1'},true);
  let swipes=0;
  try{
   engine.boot(compiled.packed,{format:1,target:`pjm-${platform}`,window,launchData:'{}',packageSha256:createHash('sha256').update(compiled.packed).digest('hex'),steps:[]});
   const frame=()=>engine.frame([],[],[]);frame();frame();
   const tree=()=>decodeInspectorTree(engine.inspectTree!());const text=()=>tree().nodes.map(node=>node.text).join('');
   const save=(label:string)=>{if(!evidence)return;const output=frame();writeFileSync(join(evidence,prefix+'-'+label+'.png'),encodeReplayPNG(window.width,window.height,output.pixels));writeFileSync(join(evidence,prefix+'-'+label+'.json'),JSON.stringify(tree()));};
   const point=(label:string)=>{const nodes=tree().nodes,leaf=nodes.find(node=>node.text===label);const node=leaf&&nodes.find(node=>node.id===leaf.parent);if(!node?.bounds)return;const [x,y,w,h]=node.bounds;if(h<16||x<window.safeLeft||y<window.safeTop||x+w>window.width-window.safeRight||y+h>window.height-window.safeBottom)return;return [Math.floor(x+w/2),Math.floor(y+h/2)];};
   const swipe=()=>{
    const x=Math.floor((window.width+window.safeLeft-window.safeRight)/2),bottom=window.height-window.safeBottom-30,top=window.safeTop+30,hit=engine.hitTest!(x,bottom);
    for(let step=0;step<=8;step++){const y=Math.round(bottom+(top-bottom)*step/8);engine.frame([(1<<18)|(y<<9)|x],[hit],[]);}for(let hold=0;hold<12;hold++)engine.frame([(1<<18)|(top<<9)|x],[hit],[]);frame();for(let settle=0;settle<30;settle++)frame();swipes++;
   };
   const reveal=(label:string)=>{for(let attempt=0;attempt<160;attempt++){const p=point(label);if(p)return p;swipe();}save('failed-'+label);throw Error(prefix+' could not scroll to '+label);};
   const tap=(p:number[])=>{const [x,y]=p;const hit=engine.hitTest!(x,y);assert.notEqual(hit,0);engine.frame([(1<<18)|(y<<9)|x],[hit],[]);frame();frame();};
   save('long-dialog-first');const done=reveal('DONE');save('long-dialog-last');tap(done);assert.ok(text().includes('Long dialog true'));
   const last=reveal('END8');save('eight-actions-last');tap(point('END8')??last);save('long-toast');assert.ok(text().includes('Selected 7'),text());
   const toast=tree().nodes.find(node=>node.text.includes('...'));assert.ok(toast,'Long toast must visibly indicate truncation');assert.ok(toast.text.split('\n').length<=4);
   for(let index=0;index<601;index++)frame();assert.ok(text().includes('Toast done'));assert.ok(!text().includes('Long toast words'));
   receipts.push({platform,...config,swipes,maximumDialogMessageBytes:2048,eightLongItemsReachable:true,wrappedConfirmReachable:true,longToastBounded:true});
   console.log(prefix+' maximum dialog/action-sheet content reachable by real pan gestures; wrapped confirm and eighth selection pass; toast wraps/truncates and expires.');
  }finally{engine.close();}
 }
 if(evidence)writeFileSync(join(evidence,'layout-result.json'),JSON.stringify({passed:true,physicalDeviceUsed:false,mobileGpu:false,cases:receipts},null,2)+'\n');
}finally{rmSync(temporary,{recursive:true,force:true});}
