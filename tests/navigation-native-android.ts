import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {androidSdk} from '../bin/android.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial || !/^[a-zA-Z0-9_.:-]+$/.test(serial))throw Error('Usage: bun tests/navigation-native-android.ts <adb serial>');
const temp=mkdtempSync(join(tmpdir(),'pjm-navigation-android-')),project=join(temp,'navigation');
const evidence=resolve(process.env.PJM_NAVIGATION_EVIDENCE??join(root,'build/android-validation/navigation-'+Date.now()));
mkdirSync(evidence,{recursive:true});
const env={...process.env,PJM_RECORD:'0',PJM_INSPECT:'1',PJM_ANDROID_TEST:'1'};
const adb=(...args:string[])=>[join(androidSdk(),'platform-tools/adb'),'-s',serial,...args];
let host:ReturnType<typeof Bun.spawn>|undefined;
let logging:Promise<unknown>|undefined;
const log=Bun.file(join(evidence,'server.log')).writer();
async function run(args:string[],cwd=temp){
 const child=Bun.spawn(args,{cwd,env,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),30000);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);assert.equal(status,0,args[0]+': '+err);return out.trim();}finally{clearTimeout(timer);}
}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){
 const deadline=Date.now()+300000;let last:unknown;
 while(Date.now()<deadline){if(host?.exitCode!==null && host?.exitCode!==undefined)throw Error('Native launcher stopped; inspect '+join(evidence,'server.log'));
  try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(250);
 }throw Error('Navigation timeout: '+JSON.stringify(last));
}
async function screenshot(name:string){
 const child=Bun.spawn(adb('exec-out','screencap','-p'),{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),30000);
 try{const [status,bytes,error]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);assert.equal(status,0,error);writeFileSync(join(evidence,name),new Uint8Array(bytes));}finally{clearTimeout(timer);}
}
try{
 await wait(()=>run(adb('shell','getprop','sys.boot_completed')),value=>value==='1');
 await run([join(root,'bin/pjm'),'create','navigation']);mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
 for(const name of ['mini.json','app/main.tsx'])writeFileSync(join(project,name),readFileSync(join(root,'examples/navigation',name)));
 host=Bun.spawn([join(root,'bin/pjm'),'run','--device','android','-d',serial],{cwd:project,env,stdout:'pipe',stderr:'pipe'});
 const copy=async(stream:ReadableStream<Uint8Array>)=>{for await(const bytes of stream)log.write(bytes);};logging=Promise.all([copy(host.stdout),copy(host.stderr)]);
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,'build/session.json'),'utf8')),value=>!!value.url);
 const receipt=async()=>JSON.parse(await run(adb('shell','run-as','dev.pjm.android','cat','files/pjm-receipt.json')));
 const snapshot=async()=>{const response=await fetch(session.url+'inspection');assert.ok(response.ok);return response.json() as Promise<any>;};
 const text=(value:any)=>value.tree.nodes.map((node:any)=>node.text).join('');
 async function page(label:string,counter:number){
  const value=await wait(snapshot,value=>text(value).includes(label) && new RegExp('(Home|Saved) counter: '+counter).test(text(value)));
  const state=await(await fetch(session.url+'state')).json();assert.equal(value.revision,state.revision);assert.equal(value.platform,'android');
  return value;
 }
 async function tap(label:string){
  const tree=await snapshot(),marker=tree.tree.nodes.find((node:any)=>node.text===label);assert.ok(marker,'Missing button '+label);
  const bounds=tree.tree.nodes.find((node:any)=>node.id===marker.parent)?.bounds;assert.ok(bounds,'Missing button bounds '+label);
  const value=await receipt();assert.equal(value.session,session.url);assert.equal(value.revision,tree.revision);
  await run(adb('shell','input','tap',String(Math.round((value.left+bounds[0]+bounds[2]/2)*value.density)),String(Math.round((value.top+bounds[1]+bounds[3]/2)*value.density))));
 }
 await wait(receipt,value=>value.session===session.url && value.frames>=30);
 writeFileSync(join(evidence,'home.json'),JSON.stringify(await page('Home page',0)));await screenshot('home.png');
 await tap('Increment counter');await page('Home page',1);
 await tap('Open detail');const detail=await page('Detail page',1);assert.match(text(detail),/Selected item: 42/);
 writeFileSync(join(evidence,'detail.json'),JSON.stringify(detail));await screenshot('detail.png');
 await tap('Back to home');await page('Home page',1);
 await tap('Open detail');await page('Detail page',1);
 await run(adb('shell','input','keyevent','KEYCODE_HOME'));await Bun.sleep(500);
 const open=()=>run(adb('shell','am','start','-W','-f','0x00020000','-n','dev.pjm.android/.MiniActivity','--es','pjm-url',session.url,'--ez','pjm-test','true','--ez','pjm-inspect','true'));
 await open();await page('Detail page',1);
 await run(adb('shell','input','keyevent','KEYCODE_BACK'));
 writeFileSync(join(evidence,'back-home.json'),JSON.stringify(await page('Home page',1)));await screenshot('back-home.png');
 await run(adb('shell','input','keyevent','KEYCODE_BACK'));
 const xmlPath='/data/local/tmp/'+temp.split('/').pop()+'.xml';
 const exit=await wait(async()=>{await run(adb('shell','uiautomator','dump',xmlPath));return run(adb('shell','cat',xmlPath));},value=>!value.includes('package="dev.pjm.android"'));
 writeFileSync(join(evidence,'back-exit.xml'),exit);await run(adb('shell','rm','-f',xmlPath));
 await open();await wait(receipt,value=>value.session===session.url && value.frames>=30);
 const cold=await page('Home page',0);writeFileSync(join(evidence,'cold-home.json'),JSON.stringify(cold));await screenshot('cold-home.png');
 writeFileSync(join(evidence,'navigation.pocket'),readFileSync(join(project,'build/navigation.pocket')));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'android',realTsx:true,buttonNavigation:true,queryRetained:true,counterRetained:true,backgroundResume:true,systemBack:true,rootExit:true,coldReset:true,physicalDevicePerformanceMeasured:false},null,2));
 console.log('Actual Android TSX navigation passed: button routes, query/counter retention, Home/resume, system Back, root exit and cold reset.');
}finally{
 if(host){host.kill('SIGTERM');await host.exited;}
 await logging;await log.end();rmSync(temp,{recursive:true,force:true});
}
