import {test,expect} from 'bun:test';
import {mkdtempSync,rmSync,writeFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {readBoundedFile} from '../container/bounded-file.ts';
test('bounded host file reads preserve exact bytes and reject oversize and redirected files',()=>{
 const root=mkdtempSync('/private/tmp/pjm-bounded-file-');try{
  const path=join(root,'data');
  for(const size of [0,1,65535,65536,65537]){
   const bytes=Buffer.alloc(size,0xa5);writeFileSync(path,bytes);
   expect(readBoundedFile(path,size)).toEqual(bytes);
   if(size)expect(()=>readBoundedFile(path,size-1)).toThrow(/size limit/);
  }
  const redirected=join(root,'link');symlinkSync(path,redirected);
  expect(()=>readBoundedFile(redirected,100000)).toThrow();
  expect(()=>readBoundedFile(root,100000)).toThrow(/regular/);
  for(const limit of [-1,0.5,NaN,Infinity])expect(()=>readBoundedFile(path,limit)).toThrow(/byte limit/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
