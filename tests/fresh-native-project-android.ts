// Opt-in fresh SDK/project acceptance. The existing isolated API 26 wrapper
// owns the emulator; the navigation driver exercises the actual public CLI.
import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
assert.equal(Bun.version,'1.3.11','Use documented Bun 1.3.11');
const root=resolve(import.meta.dir,'..');
const evidence=resolve(process.env.PJM_FRESH_NATIVE_EVIDENCE??join(root,'build/validation/fresh-native-project-android-'+Date.now()));
assert.ok(!existsSync(evidence),'Choose a new evidence directory');mkdirSync(evidence,{recursive:true});
const owned=mkdtempSync(join(tmpdir(),'pjm-fresh-android-sdk-')),sdk=join(owned,'sdk');
let failure:string|undefined,exitCode:number|undefined;
try {
 mkdirSync(sdk);
 for(const directory of ['bin','container','host','vendor','core-ffi','devtools','sdk','template'])cpSync(join(root,directory),join(sdk,directory),{recursive:true,filter:path=>path!==join(root,'core-ffi/target')});
 assert.ok(!existsSync(join(sdk,'examples'))&&!existsSync(join(sdk,'.pjm'))&&!existsSync(join(sdk,'core-ffi/target')));
 const manifest=readFileSync(join(sdk,'core-ffi/Cargo.toml'));
 const fd=openSync(join(evidence,'owned-workflow.log'),'w');
 try{const child=Bun.spawn([process.execPath,join(root,'tests/minimum-os-owned-android.ts'),'26'],{env:{...process.env,PJM_FRESH_NATIVE_SDK:sdk,PJM_PACKAGE_LOAD_EVIDENCE:evidence},stdout:fd,stderr:fd});exitCode=await child.exited;}finally{closeSync(fd);}
 assert.equal(exitCode,0,'Fresh Android workflow failed; see retained logs');
 const cleanup=JSON.parse(readFileSync(join(evidence,'owned-emulator.json'),'utf8'));assert.equal(cleanup.cleaned,true);assert.equal(cleanup.temporaryAvdRemoved,true);
 const proof=JSON.parse(readFileSync(join(evidence,'result.json'),'utf8'));assert.equal(proof.freshSdkPublicNativeWorkflow,true);assert.equal(proof.systemBack,true);assert.equal(proof.networkHotReloadReset,true);
 assert.deepEqual(readFileSync(join(sdk,'core-ffi/Cargo.toml')),manifest);
 assert.ok(!existsSync(join(sdk,'examples'))&&!existsSync(join(sdk,'.pjm/pocketjs')));
} catch(error){failure=String(error);throw error;}
finally {
 rmSync(owned,{recursive:true,force:true});
 writeFileSync(join(evidence,'fresh-sdk-result.json'),JSON.stringify({passed:!failure,failure,exitCode,bunVersion:Bun.version,initialSdkExampleAndNativeCachesAbsent:true,initialProjectCacheAbsent:true,publicNativeCreateRun:true,ownedSdkRemoved:!existsSync(owned),physicalDeviceUsed:false,bareOsInstallCovered:false},null,2)+'\n');
}
