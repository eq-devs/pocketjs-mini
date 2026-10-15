// Opt-in public create/run acceptance on a newly owned simulator. Requires the
// documented Bun and installed Xcode/Rust tools; never selects a physical phone.
import assert from 'node:assert/strict';
import {cpSync,existsSync,lstatSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,openSync,closeSync,readdirSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
assert.equal(process.platform,'darwin');assert.equal(Bun.version,'1.3.11','Use documented Bun 1.3.11');
const root=resolve(import.meta.dir,'..');
const evidence=resolve(process.env.PJM_FRESH_NATIVE_EVIDENCE??join(root,'build/validation/fresh-native-project-ios-'+Date.now()));
assert.ok(!existsSync(evidence),'Choose a new evidence directory');mkdirSync(evidence,{recursive:true});
const owned=mkdtempSync(join(tmpdir(),'pjm-fresh-native-project-')),sdk=join(owned,'sdk'),project=join(owned,'fresh-counter');
let serial:string|undefined,cleaned=false,failure:string|undefined,cliExit:number|undefined;
const commands:{label:string;exitCode:number}[]=[];
async function run(label:string,args:string[],cwd=owned,env=process.env,timeout=120000){
 const child=Bun.spawn(args,{cwd,env,stdout:'pipe',stderr:'pipe'});
 const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);commands.push({label,exitCode:status});writeFileSync(join(evidence,label+'.log'),out+err);assert.equal(status,0,label+' failed; see log');return out.trim();}finally{clearTimeout(timer);}
}
try {
 mkdirSync(sdk);
 for(const directory of ['bin','container','host','vendor','core-ffi','devtools','sdk','template'])cpSync(join(root,directory),join(sdk,directory),{recursive:true,filter:path=>path!==join(root,'core-ffi/target')});
 assert.ok(!existsSync(join(sdk,'examples'))&&!existsSync(join(sdk,'.pjm'))&&!existsSync(join(sdk,'core-ffi/target')));
 const sourceManifest=readFileSync(join(sdk,'core-ffi/Cargo.toml'));
 await run('create',[join(sdk,'bin/pjm'),'create','fresh-counter']);
 assert.ok(!existsSync(join(project,'.pjm')));
 serial=await run('create-simulator',['xcrun','simctl','create','iPhone pjm fresh '+Date.now(),'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro','com.apple.CoreSimulator.SimRuntime.iOS-26-4']);
 assert.match(serial,/^[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}$/i);
 // Explicit UUID matches this iPhone-named simulator before any phone discovery.
 const env:NodeJS.ProcessEnv={...process.env,PJM_NATIVE_TEST:'1',PJM_TEST_RESULTS:join(evidence,'Tests.xcresult')};delete env.PJM_TEST_SERVER;
 const fd=openSync(join(evidence,'public-run.log'),'w');
 let child:ReturnType<typeof Bun.spawn>|undefined,killTimer:ReturnType<typeof setTimeout>|undefined;
 try {
  child=Bun.spawn([join(sdk,'bin/pjm'),'run','--device','ios','-d',serial],{cwd:project,env,stdout:fd,stderr:fd,detached:true});
  const timer=setTimeout(()=>{child!.kill('SIGTERM');killTimer=setTimeout(()=>{try{process.kill(-child!.pid,'SIGKILL');}catch{}},30000);},1200000);
  try{cliExit=await child.exited;}finally{clearTimeout(timer);if(killTimer)clearTimeout(killTimer);}
 } finally {closeSync(fd);}
 if(existsSync(join(evidence,'Tests.xcresult'))){
  const summary=await run('test-summary',['xcrun','xcresulttool','get','test-results','summary','--path',join(evidence,'Tests.xcresult')]);writeFileSync(join(evidence,'summary.json'),summary);
  await run('attachments',['xcrun','xcresulttool','export','attachments','--path',join(evidence,'Tests.xcresult'),'--output-path',join(evidence,'attachments')]);
 }
 assert.equal(cliExit,0,'Public native run failed; see public-run.log');
 const summary=JSON.parse(readFileSync(join(evidence,'summary.json'),'utf8'));assert.equal(summary.passedTests,6);assert.equal(summary.failedTests,0);assert.equal(summary.skippedTests,0);
 assert.ok(!existsSync(join(sdk,'examples'))&&!existsSync(join(sdk,'.pjm/pocketjs')));
 assert.ok(lstatSync(join(project,'.pjm/pocketjs')).isDirectory());
 assert.deepEqual(readFileSync(join(sdk,'core-ffi/Cargo.toml')),sourceManifest);
 const cache=join(sdk,'.pjm/native-core'),snapshots=readdirSync(cache).filter(name=>!name.startsWith('.'));assert.equal(snapshots.length,1);
 const snapshot=join(cache,snapshots[0]);const source=JSON.parse(readFileSync(join(snapshot,'source.json'),'utf8'));
 assert.equal(source.upstream,realpathSync(join(project,'.pjm/pocketjs')));
 writeFileSync(join(evidence,'generated-Cargo.toml'),readFileSync(join(snapshot,'Cargo.toml')));
 writeFileSync(join(evidence,'source-resolution.json'),JSON.stringify(source,null,2)+'\n');
} catch(error) {failure=String(error);throw error;}
finally {
 let cleanupFailure:unknown;
 try{if(serial){await run('terminate-app',['xcrun','simctl','terminate',serial,'dev.pjm.host']).catch(()=>{});await run('uninstall-app',['xcrun','simctl','uninstall',serial,'dev.pjm.host']).catch(()=>{});await run('shutdown-simulator',['xcrun','simctl','shutdown',serial]).catch(()=>{});await run('delete-simulator',['xcrun','simctl','delete',serial]);cleaned=true;}}catch(error){cleanupFailure=error;}
 finally{
  rmSync(owned,{recursive:true,force:true});
  writeFileSync(join(evidence,'result.json'),JSON.stringify({passed:!failure&&!cleanupFailure,failure,cleanupFailure:cleanupFailure?String(cleanupFailure):undefined,cliExit,bunVersion:Bun.version,commands,initialSdkExampleAndNativeCachesAbsent:true,initialProjectCacheAbsent:true,projectName:'fresh-counter',publicNativeCreateRun:true,simulator:serial,ownedSimulatorRemoved:cleaned,ownedSdkAndProjectRemoved:!existsSync(owned),physicalDeviceUsed:false,bareOsInstallCovered:false},null,2)+'\n');
 }
 if(cleanupFailure&&!failure)throw cleanupFailure;
}
