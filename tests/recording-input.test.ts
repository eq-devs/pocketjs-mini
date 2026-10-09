import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeNativeTape} from '../devtools/tape.ts';
test('native Android recording preserves packed input and admits all samples as tape',()=>{
 const root=resolve(import.meta.dir,'..'),temp=mkdtempSync(join(tmpdir(),'pjm-record-input-'));
 try{
  const build=spawnSync('cc',['-std=c11','-Wall','-Wextra','-Werror','-I'+join(root,'host/android'),'-I'+join(root,'core-ffi/include'),join(root,'tests/recording-input.c'),'-o',join(temp,'check')],{encoding:'utf8'});
  expect(build.status).toBe(0);if(build.status!==0)throw Error(build.stderr);
  const run=spawnSync(join(temp,'check'),[],{encoding:'utf8'});expect(run.status).toBe(0);
  const steps=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
  const tape=decodeNativeTape(Buffer.from(JSON.stringify({format:1,packageSha256:'0'.repeat(64),target:'pjm-android',launchData:'{}',window:{width:64,height:64,density:1},steps})));
  expect(tape.steps.length).toBe(3);expect(tape.steps[0]).toEqual({kind:'frame',contacts:[],hits:[],cancelled:[]});
  expect(tape.steps[1]).toEqual({kind:'frame',contacts:[0x803fffff,0x40203],hits:[-2147483648,2147483647],cancelled:[0,255]});
  expect((tape.steps[2] as any).contacts.length).toBe(8);expect((tape.steps[2] as any).cancelled).toEqual([0,1,2,3,4,5,6,7]);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
