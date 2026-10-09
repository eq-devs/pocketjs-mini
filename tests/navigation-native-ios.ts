import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {writeNativeProject} from '../bin/native-project.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial)throw Error('Usage: bun tests/navigation-native-ios.ts <booted simulator UUID>');
const temp=mkdtempSync(join(tmpdir(),'pjm-navigation-ios-')),project=join(temp,'navigation'),native=join(temp,'host');
const bundle='dev.pjm.navigation.a'+Date.now();
const evidence=resolve(process.env.PJM_NAVIGATION_EVIDENCE??join(root,'build/ios-validation/navigation-'+Date.now()));mkdirSync(evidence,{recursive:true});
let server:ReturnType<typeof Bun.spawn>|undefined,logging:Promise<unknown>|undefined,launched=false;
const log=Bun.file(join(evidence,'server.log')).writer();
async function run(args:string[],cwd=root){
 const child=Bun.spawn(args,{cwd,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out;}finally{clearTimeout(timer);}
}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){
 const deadline=Date.now()+120000;let last:unknown;
 while(Date.now()<deadline){if(server?.exitCode!==null && server?.exitCode!==undefined)throw Error('Development server stopped');try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(200);}
 throw Error('Navigation startup timeout: '+JSON.stringify(last));
}
try{
 await run([join(root,'bin/pjm'),'create','navigation'],temp);
 mkdirSync(join(project,'.pjm'));symlinkSync(join(root,'examples/hello/.pjm/pocketjs'),join(project,'.pjm/pocketjs'));
 for(const name of ['mini.json','app/main.tsx'])writeFileSync(join(project,name),readFileSync(join(root,'examples/navigation',name)));
 server=Bun.spawn([join(root,'bin/pjm'),'run'],{cwd:project,env:{...process.env,PJM_TEST_SERVER:'1'},stdout:'pipe',stderr:'pipe'});
 const copy=async(stream:ReadableStream<Uint8Array>)=>{for await(const bytes of stream)log.write(bytes);};logging=Promise.all([copy(server.stdout),copy(server.stderr)]);
 const session=await wait(async()=>JSON.parse(readFileSync(join(project,'build/session.json'),'utf8')),value=>!!value.url);
 await wait(async()=>{const response=await fetch(session.url+'state');return response.json() as Promise<any>;},value=>value.revision>0 && !value.error);
 cpSync(join(root,'host/ios'),native,{recursive:true});cpSync(join(root,'core-ffi/include/mini_core.h'),join(native,'mini_core.h'));
 writeNativeProject(native,'',join(root,'core-ffi/target/aarch64-apple-ios-sim/release/libmini_core_ffi.a'),session.url,true,bundle);
 cpSync(join(root,'tests/NavigationInputTests.swift'),join(native,'Tests.swift'));launched=true;
 writeFileSync(join(evidence,'xcode.log'),await run(['xcodebuild','-quiet','-project',join(native,'Mini.xcodeproj'),'-scheme','Mini','-configuration','Debug','-destination','platform=iOS Simulator,id='+serial,'-derivedDataPath',join(native,'DerivedData'),'-parallel-testing-enabled','NO','-resultBundlePath',join(evidence,'Tests.xcresult'),'CODE_SIGNING_ALLOWED=NO','test']));
 await run(['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 writeFileSync(join(evidence,'navigation.pocket'),readFileSync(join(project,'build/navigation.pocket')));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({platform:'ios',realTsx:true,buttonNavigation:true,queryRetained:true,counterRetained:true,backgroundResume:true,coldReset:true,physicalDevicePerformanceMeasured:false},null,2));
 console.log('Actual UIKit TSX navigation passed: button routes, query/counter retention, Home/resume and cold reset.');
}finally{
 if(launched){await run(['xcrun','simctl','terminate',serial,bundle]).catch(()=>{});await run(['xcrun','simctl','uninstall',serial,bundle]).catch(()=>{});}
 if(server){server.kill('SIGTERM');await server.exited;}
 await logging;await log.end();rmSync(temp,{recursive:true,force:true});
}
