import {test,expect} from 'bun:test';
import {cpSync,mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {androidMediaFiles} from '../bin/android-media.ts';

test('offline media closure verifies parser, metadata and licenses and rejects altered or redirected files',()=>{
 const root=join(import.meta.dir,'../vendor/android-media');expect(androidMediaFiles().files.size).toBe(7);
 const temp=mkdtempSync(join(tmpdir(),'pjm-media-runtime-'));const copy=join(temp,'copy');
 try{
  cpSync(root,copy,{recursive:true});const jar=join(copy,'exifinterface-1.4.2.jar');const bytes=readFileSync(jar);bytes[bytes.length-1]^=1;writeFileSync(jar,bytes);expect(()=>androidMediaFiles(copy)).toThrow('checksum');
  cpSync(join(root,'exifinterface-1.4.2.jar'),jar);rmSync(jar);symlinkSync(join(root,'exifinterface-1.4.2.jar'),jar);expect(()=>androidMediaFiles(copy)).toThrow('Invalid Android media file');
  rmSync(jar);cpSync(join(root,'exifinterface-1.4.2.jar'),jar);rmSync(join(copy,'LICENSE-EXIF.txt'));expect(()=>androidMediaFiles(copy)).toThrow();
  const link=join(temp,'redirect');symlinkSync(root,link);expect(()=>androidMediaFiles(link)).toThrow('root');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
