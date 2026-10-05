import {lstatSync,mkdirSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {androidHttpFiles} from "./android-http.ts";

/** Offline runtime closure, including AAR resources and their original manifests. */
export function androidLocationFiles(root=fileURLToPath(new URL("../vendor/android-location/",import.meta.url))) {
  const rootStat=lstatSync(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error("Invalid Android location runtime root");
  const read=(name:string,limit:number)=>{
    if(!/^[A-Za-z0-9_.+\/-]+$/.test(name)||name.startsWith("/")||name.split("/").some(part=>!part||part==="."||part===".."))throw new Error("Invalid Android location path");
    let current=root;for(const part of name.split("/")){current=join(current,part);const stat=lstatSync(current);if(stat.isSymbolicLink())throw new Error("Redirected Android location file: "+name);}
    const path=join(root,name),stat=lstatSync(path);if(!stat.isFile()||stat.size>limit)throw new Error("Invalid pinned Android location file: "+name);
    return readFileSync(path);
  };
  const bytes=read("runtime-lock.json",256*1024),lock=JSON.parse(bytes.toString("utf8"));
  if(lock.schema!==1||!Array.isArray(lock.artifacts)||lock.artifacts.length!==27||!Array.isArray(lock.files)||lock.files.length!==422)throw new Error("Invalid Android location runtime lock");
  if(JSON.stringify(lock.sharedHttp)!==JSON.stringify(["annotation-jvm-1.10.0.jar","kotlin-stdlib-2.1.21.jar"])||JSON.stringify(lock.replaceHttp)!==JSON.stringify(["annotations-13.0.jar"]))throw new Error("Invalid shared Android runtime lock");
  const files=new Map<string,Buffer>();
  for(const file of lock.files){
    if(typeof file.name!=="string"||files.has(file.name)||!Number.isSafeInteger(file.bytes)||file.bytes<0||!/^[0-9a-f]{64}$/.test(file.sha256))throw new Error("Invalid Android location lock entry");
    const data=read(file.name,4*1024*1024);
    if(data.length!==file.bytes||createHash("sha256").update(data).digest("hex")!==file.sha256)throw new Error("Android location checksum mismatch: "+file.name);
    files.set(file.name,data);
  }
  if(!files.has("packages.txt")||![...files.keys()].some(name=>name.startsWith("resources/")))throw new Error("Incomplete Android location resources");
  const http=androidHttpFiles();
  for(const name of lock.sharedHttp){if(!files.get("jars/"+name)?.equals(http.files.get(name)!))throw new Error("Conflicting shared Android runtime: "+name);}
  return {files,lock:bytes};
}
export function copyAndroidLocation(directory:string){
  const runtime=androidLocationFiles();
  for(const [name,bytes] of runtime.files){
    const target=join(directory,name.startsWith("jars/")?"deps/"+name.slice(5):name);
    mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
  }
  // Gradle selected annotations 23.0.0 for coroutines; retain one copy of these classes.
  rmSync(join(directory,"deps/annotations-13.0.jar"),{force:true});
  writeFileSync(join(directory,"deps/location-lock.json"),runtime.lock);
}
