import {mkdtempSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dir,'..');
const upstream=resolve(process.env.PJM_TEST_UPSTREAM??join(root,'examples/hello/.pjm/pocketjs'));
const compiler=join(upstream,'node_modules/typescript/bin/tsc');
if(!existsSync(compiler))throw Error('SDK type checking requires installed pinned PocketJS dependencies or PJM_TEST_UPSTREAM');
const temporary=mkdtempSync(join(tmpdir(),'pjm-sdk-types-'));
try{
 const config=join(temporary,'tsconfig.json');
 // The guest SDK must typecheck without DOM, Node or Bun ambient globals.
 writeFileSync(config,JSON.stringify({compilerOptions:{noEmit:true,strict:true,skipLibCheck:true,target:'ES2022',lib:['ES2022'],module:'ESNext',moduleResolution:'Bundler',allowImportingTsExtensions:true,types:[]},files:readdirSync(join(root,'sdk')).filter(name=>name.endsWith('.ts')).map(name=>join(root,'sdk',name))}));
 const child=Bun.spawn([process.execPath,compiler,'-p',config],{stdout:'inherit',stderr:'inherit'});
 process.exitCode=await child.exited;
}finally{rmSync(temporary,{recursive:true,force:true});}
