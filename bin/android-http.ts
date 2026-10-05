import {lstatSync,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

/** Verify the offline runtime before a build or export consumes any jar. */
export function androidHttpFiles(root=fileURLToPath(new URL("../vendor/android-http/",import.meta.url))) {
  const read=(name:string,limit:number)=>{const path=join(root,name),stat=lstatSync(path);if(!stat.isFile() || stat.isSymbolicLink() || stat.size>limit)throw new Error("Invalid pinned Android HTTP file: "+name);return readFileSync(path);};
  const lock=JSON.parse(read("lock.json",65536).toString("utf8"));
  const expected=new Set(["okhttp-android-5.5.0.jar","okio-jvm-3.18.1.jar","kotlin-stdlib-2.1.21.jar","annotations-13.0.jar","annotation-jvm-1.10.0.jar","startup-runtime-1.2.0.jar","tracing-1.0.0.jar","PublicSuffixDatabase.list"]);
  if(lock.schema!==1 || !Array.isArray(lock.artifacts) || lock.artifacts.length!==7)throw new Error("Invalid Android HTTP lock");
  const files=new Map<string,Buffer>();
  for(const artifact of lock.artifacts){
    if(!Array.isArray(artifact.files))throw new Error("Invalid Android HTTP lock");
    for(const file of artifact.files){
      if(!expected.delete(file.name) || !/^[0-9a-f]{64}$/.test(file.sha256))throw new Error("Invalid Android HTTP lock entry");
      const bytes=read(file.name,4*1024*1024);
      if(bytes.length!==file.bytes || createHash("sha256").update(bytes).digest("hex")!==file.sha256)throw new Error("Android HTTP checksum mismatch: "+file.name);
      files.set(file.name,bytes);
    }
  }
  if(expected.size)throw new Error("Incomplete Android HTTP runtime");
  return {root,files,lock:read("lock.json",65536),license:read("LICENSE-APACHE-2.0.txt",65536)};
}
export function copyAndroidHttp(directory:string) {
  const runtime=androidHttpFiles();
  mkdirSync(join(directory,"deps"),{recursive:true});mkdirSync(join(directory,"assets"),{recursive:true});
  for(const [name,bytes] of runtime.files)writeFileSync(join(directory,name.endsWith(".jar")?"deps":"assets",name),bytes);
  writeFileSync(join(directory,"deps/lock.json"),runtime.lock);writeFileSync(join(directory,"deps/LICENSE-APACHE-2.0.txt"),runtime.license);
}
