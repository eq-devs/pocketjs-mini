import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const pin='fe971ebb8e14724d2a98d4df6b34c065caf11132';
type Run=(args:string[])=>Promise<string>;
async function checkedSource(directory:string,run:Run){
 if((await run(['git','-C',directory,'rev-parse','HEAD'])).trim()!==pin)throw Error('Unexpected PocketJS revision for native build');
 await run(['git','-C',directory,'diff','--quiet','HEAD','--']);
 return realpathSync(directory);
}

/** Resolve Cargo path dependencies without writing into the SDK example app.
 * Snapshots are keyed by source bytes and the verified dependency location;
 * publication is atomic so concurrent callers never see a partial manifest. */
export async function prepareNativeEngineBuild(root:string,run:Run,projectUpstream?:string){
 root=resolve(root);
 let upstream:string;
 if(projectUpstream)upstream=await checkedSource(resolve(projectUpstream),run);
 else {
  const cache=join(root,'.pjm');mkdirSync(cache,{recursive:true});
  const destination=join(cache,'pocketjs');
  if(!existsSync(destination)){
   const temporary=mkdtempSync(join(cache,'.native-upstream-'));
   try {
    await run(['git','init','-q',temporary]);
    await run(['git','-C',temporary,'remote','add','origin','https://github.com/pocket-nexus/pocketjs.git']);
    await run(['git','-C',temporary,'fetch','--depth','1','origin',pin]);
    await run(['git','-C',temporary,'checkout','--detach',pin]);
    await checkedSource(temporary,run);
    if(!existsSync(destination))try{renameSync(temporary,destination);}catch(error){if(!existsSync(destination))throw error;}
   } finally {rmSync(temporary,{recursive:true,force:true});}
  }
  upstream=await checkedSource(destination,run);
 }
 const source=join(root,'core-ffi'),hash=createHash('sha256').update(upstream+'\0');
 const files:string[]=[];
 function walk(relative:string){for(const name of readdirSync(join(source,relative),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const path=join(relative,name.name);if(name.isDirectory())walk(path);else if(name.isFile())files.push(path);else throw Error('Native engine sources must be regular files: '+path);}}
 walk('src');walk('include');files.push('Cargo.toml','Cargo.lock','build.rs');
 const contents=new Map<string,Buffer>();
 for(const file of files){const bytes=readFileSync(join(source,file));contents.set(file,bytes);hash.update(file+'\0').update(bytes).update('\0');}
 let manifest=contents.get('Cargo.toml')!.toString('utf8');
 for(const path of ['engine/crates/pocket-mod','engine/crates/pocket-ui-surface','engine/core']){
  const original='"../examples/hello/.pjm/pocketjs/'+path+'"';
  if(manifest.split(original).length!==2)throw Error('Unexpected native dependency manifest: '+path);
  manifest=manifest.replace(original,JSON.stringify(join(upstream,path)));
 }
 contents.set('Cargo.toml',Buffer.from(manifest));
 const digest=hash.digest('hex'),parent=join(root,'.pjm/native-core');mkdirSync(parent,{recursive:true});
 const directory=join(parent,digest);
 if(!existsSync(directory)){
  const staging=mkdtempSync(join(parent,'.prepare-'));
  try {
   for(const [file,bytes] of contents){const target=join(staging,file);mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,bytes);}
   writeFileSync(join(staging,'source.json'),JSON.stringify({digest,upstream,pin},null,2)+'\n');
   try{renameSync(staging,directory);}catch(error){if(!existsSync(directory))throw error;}
  } finally {rmSync(staging,{recursive:true,force:true});}
 }
 for(const [file,bytes] of contents){let matches=false;try{matches=readFileSync(join(directory,file)).equals(bytes);}catch{}if(!matches)throw Error('Native build cache is inconsistent; remove '+directory+' and retry');}
 return {manifest:join(directory,'Cargo.toml'),upstream,targetDirectory:join(source,'target'),env:{PJM_UPSTREAM_ROOT:upstream}};
}
