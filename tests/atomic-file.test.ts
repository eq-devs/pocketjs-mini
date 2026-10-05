import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync,mkdirSync,readFileSync,readdirSync,statSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {writeAtomicFile} from '../container/atomic-file.ts';
test('atomic host writes retain existing output on rename failure and clean temporary files',()=>{
 const root=mkdtempSync('/private/tmp/pjm-atomic-file-');try{
  writeAtomicFile(root,'state.json','first');writeAtomicFile(root,'state.json','second');
  expect(readFileSync(join(root,'state.json'),'utf8')).toBe('second');expect(statSync(join(root,'state.json')).mode&0o777).toBe(0o600);
  mkdirSync(join(root,'blocked.json'));expect(()=>writeAtomicFile(root,'blocked.json','replace')).toThrow();
  expect(statSync(join(root,'blocked.json')).isDirectory()).toBe(true);expect(readdirSync(root).sort()).toEqual(['blocked.json','state.json']);
  for(const name of ['../escape','/absolute','.','..','a/b'])expect(()=>writeAtomicFile(root,name,'x')).toThrow(/file name/);
  const redirected=join(root,'redirected');symlinkSync(root,redirected);expect(()=>writeAtomicFile(redirected,'new.json','x')).toThrow();
  expect(readdirSync(root).sort()).toEqual(['blocked.json','redirected','state.json']);
 }finally{rmSync(root,{recursive:true,force:true});}
});
