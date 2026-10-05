import {mkdtempSync,writeFileSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';

const root=resolve(import.meta.dir,'..');
const upstream=resolve(process.env.PJM_TEST_UPSTREAM??join(root,'examples/hello/.pjm/pocketjs'));
const compiler=join(upstream,'node_modules/typescript/bin/tsc');
if(!existsSync(compiler))throw Error('Replay type checking requires installed pinned PocketJS dependencies in examples/hello/.pjm/pocketjs or PJM_TEST_UPSTREAM');
const temporary=mkdtempSync(join(tmpdir(),'pjm-replay-types-'));
try{
 const config=join(temporary,'tsconfig.json');
 writeFileSync(config,JSON.stringify({compilerOptions:{noEmit:true,strict:true,skipLibCheck:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',allowImportingTsExtensions:true,types:['bun-types','node'],typeRoots:[join(upstream,'node_modules'),join(upstream,'node_modules/@types')]},files:[...readdirSync(join(root,'devtools')).filter(name=>name.endsWith('.ts')).map(name=>join(root,'devtools',name)),join(root,'bin/replay.ts')]}));
 const child=Bun.spawn([process.execPath,compiler,'-p',config],{stdout:'inherit',stderr:'inherit'});
 process.exitCode=await child.exited;
}finally{rmSync(temporary,{recursive:true,force:true});}
