import {lstatSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

/** Offline EXIF parser closure; original metadata and licenses accompany every export. */
export function androidMediaFiles(root=fileURLToPath(new URL('../vendor/android-media/',import.meta.url))){
 const directory=lstatSync(root);if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('Invalid Android media root');
 const read=(name:string,limit:number)=>{const p=join(root,name),s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>limit)throw Error('Invalid Android media file: '+name);return readFileSync(p);};
 const lock=read('lock.json',65536),value=JSON.parse(lock.toString('utf8'));
 const expected=new Set(['exifinterface-1.4.2.jar','jspecify-1.0.0.jar','AndroidManifest.xml','exifinterface-1.4.2.pom','LICENSE-EXIF.txt','LICENSE-JSPECIFY.txt','jspecify-1.0.0.pom']);
 if(value.schema!==1||value.artifact!=='androidx.exifinterface:exifinterface:1.4.2'||!Array.isArray(value.files)||value.files.length!==expected.size)throw Error('Invalid Android media lock');
 const files=new Map<string,Buffer>();
 for(const f of value.files){if(!expected.delete(f.name)||!Number.isSafeInteger(f.bytes)||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid Android media entry');const b=read(f.name,1048576);if(b.length!==f.bytes||createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Android media checksum mismatch: '+f.name);files.set(f.name,b);}
 if(expected.size)throw Error('Incomplete Android media runtime');return {files,lock};
}
export function copyAndroidMedia(directory:string){const runtime=androidMediaFiles();mkdirSync(join(directory,'deps'),{recursive:true});for(const [name,bytes]of runtime.files)writeFileSync(join(directory,'deps',name.endsWith('.jar')?name:'media-'+name),bytes);writeFileSync(join(directory,'deps/media-lock.json'),runtime.lock);}
