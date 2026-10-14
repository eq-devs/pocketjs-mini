import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

/** Check strong dynamic imports against the selected NDK platform stubs.
 * This does not prove Java dependency compatibility or device execution. */
export function auditAndroidImports(library:string,toolchain:string,api=23){
  if(!Number.isInteger(api)||api<23)throw Error('Invalid Android API audit level');
  const readelf=join(toolchain,'bin/llvm-readelf');
  function inspect(path:string){
    const result=spawnSync(readelf,['--file-header','--dyn-syms','--dynamic','--wide',path],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:30000});
    if(result.status!==0)throw Error('Cannot inspect Android ELF: '+path+'\n'+result.stderr);
    if(!/Class:\s+ELF64/.test(result.stdout)||!/Machine:\s+AArch64/.test(result.stdout))throw Error('Expected an arm64 Android ELF: '+path);
    const needed=[...result.stdout.matchAll(/\(NEEDED\).*\[([^\]]+)\]/g)].map(item=>item[1]);
    const symbols=[...result.stdout.matchAll(/^\s*\d+:\s+\S+\s+\d+\s+\S+\s+(GLOBAL|WEAK)\s+\S+\s+(\S+)\s+(\S+)/gm)].map(item=>({binding:item[1],section:item[2],name:item[3].replace('@@','@')}));
    return {needed,symbols};
  }
  const target=inspect(library),exports=new Set<string>(),visited=new Set<string>();
  function platform(name:string){
    if(!/^lib[A-Za-z0-9_+.-]+\.so$/.test(name))throw Error('Invalid native dependency: '+name);
    if(visited.has(name))return;visited.add(name);
    const stub=join(toolchain,'sysroot/usr/lib/aarch64-linux-android',String(api),name);
    if(!existsSync(stub))throw Error('Native dependency unavailable at Android API '+api+': '+name);
    const info=inspect(stub);
    for(const symbol of info.symbols)if(symbol.section!=='UND'){exports.add(symbol.name);exports.add(symbol.name.split('@')[0]);}
    for(const dependency of info.needed)platform(dependency);
  }
  for(const dependency of target.needed)platform(dependency);
  const required=target.symbols.filter(item=>item.section==='UND'&&item.binding==='GLOBAL').map(item=>item.name);
  if(!required.length)throw Error('Native API audit found no required dynamic imports');
  const missing=required.filter(name=>!exports.has(name));
  if(missing.length)throw Error('Native imports unavailable at Android API '+api+': '+missing.join(', '));
  return {api,sha256:createHash('sha256').update(readFileSync(library)).digest('hex'),needed:target.needed,platformLibraries:[...visited].sort(),requiredImports:required.sort(),optionalWeakImports:target.symbols.filter(item=>item.section==='UND'&&item.binding==='WEAK').map(item=>item.name).sort()};
}
