// Opt-in public CLI acceptance. Downloads the pinned compiler and dependencies;
// uses installed build tools, never enumerates or drives devices, never uploads.
import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const root=resolve(import.meta.dir,'..');
const evidence=resolve(process.env.PJM_RELEASE_WORKFLOW_EVIDENCE??join(root,'build/validation/release-fresh-cache-'+Date.now()));
assert.ok(!existsSync(evidence),'Choose a new evidence directory');
mkdirSync(evidence,{recursive:true});
const temporary=mkdtempSync(join(tmpdir(),'pjm-fresh-release-'));
const project=join(temporary,'fresh-release');
const cli=join(root,'bin/pjm');
const pin='fe971ebb8e14724d2a98d4df6b34c065caf11132';
const steps:{label:string;exitCode:number;expectedExit:'zero'|'nonzero';elapsedMs:number}[]=[];
let failure:string|undefined;
async function run(label:string,args:string[],cwd=project,expectedExit:'zero'|'nonzero'='zero') {
  const start=performance.now();
  const child=Bun.spawn(args,{cwd,env:process.env,stdout:'pipe',stderr:'pipe',detached:true});
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}},300000);
  try {
    const [exitCode,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
    writeFileSync(join(evidence,label+'.log'),out+err);
    steps.push({label,exitCode,expectedExit,elapsedMs:Math.round(performance.now()-start)});
    console.log(label+': '+exitCode);
    assert.ok(!timedOut,label+' timed out');
    assert.ok(expectedExit==='zero'?exitCode===0:exitCode!==0,label+' unexpected exit; see retained log');
    return out.trim();
  } finally {clearTimeout(timer);}
}
try {
  await run('create',[cli,'create','fresh-release'],temporary);
  assert.ok(!existsSync(join(project,'.pjm')),'New project must have no compiler cache');
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const signingKey=join(temporary,'signing.pem'),trustedKey=join(temporary,'publisher.raw');
  writeFileSync(signingKey,privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  writeFileSync(trustedKey,publicKey.export({format:'der',type:'spki'}).subarray(-32));
  for(const platform of ['ios','android']) {
    await run('check-'+platform,[cli,'check','--device',platform]);
    await run('build-'+platform,[cli,'build','--release','--device',platform,'--key',signingKey]);
    const release=join(project,'build/fresh-release-'+platform+'.release');
    const receipt=JSON.parse(await run('publish-dry-'+platform,[cli,'publish','--package',release,'--public-key',trustedKey,'--device',platform,'--dry-run']));
    const manifest=JSON.parse(readFileSync(join(release,'manifest.json'),'utf8'));
    assert.equal(receipt.verified,true);assert.equal(receipt.sha256,manifest.sha256);
    assert.equal(receipt.target,platform);assert.equal(receipt.appId,'dev.pjm.fresh-release');
    await run('publish-wrong-target-'+platform,[cli,'publish','--package',release,'--public-key',trustedKey,'--device',platform==='ios'?'android':'ios','--dry-run'],project,'nonzero');
    cpSync(release,join(evidence,platform+'.release'),{recursive:true});
    writeFileSync(join(evidence,'receipt-'+platform+'.json'),JSON.stringify(receipt,null,2));
  }
  const actual=await run('compiler-pin',['git','rev-parse','HEAD'],join(project,'.pjm/pocketjs'));
  assert.equal(actual,pin);
  await run('clean',[cli,'clean']);
  assert.ok(!existsSync(join(project,'build')));
  assert.ok(existsSync(join(project,'app/main.tsx')),'Clean must preserve sources');
  cpSync(trustedKey,join(evidence,'publisher.raw'));
} catch(error) {failure=String(error);throw error;}
finally {
  rmSync(temporary,{recursive:true,force:true});
  writeFileSync(join(evidence,'result.json'),JSON.stringify({passed:!failure,failure,steps,pinnedCompiler:pin,bunVersion:Bun.version,initialProjectCacheEmpty:true,ownedTemporaryRemoved:!existsSync(temporary),privateKeyRetained:false,physicalDeviceUsed:false,uploaded:false,nativeHostExportCovered:false,cleanMachineCovered:false},null,2));
}
