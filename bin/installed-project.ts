import {cpSync,lstatSync,readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createPublicKey} from "node:crypto";
import {verifyPackage,canonical,MAX_PACKAGE_BYTES} from "../container/package.ts";
import {writeNativeProject} from "./native-project.ts";
/** Produce a signed-only iOS host project. The caller supplies a trusted public
 * key separately from the envelope; private publisher keys are never bundled.
 * Native startup additionally verifies structure and admits the build plan. */
export function verifyInstalledInputs(options:{payload:string;envelope:string;publicKey:string}) {
  const read=(path:string,limit:number)=>{const info=lstatSync(path);if(!info.isFile() || info.isSymbolicLink() || info.size>limit)throw new Error("Installed host input must be a bounded regular file");return readFileSync(path);};
  const payload=read(options.payload,MAX_PACKAGE_BYTES), envelope=JSON.parse(read(options.envelope,65536).toString("utf8")),key=read(options.publicKey,32);
  if(key.length!==32)throw new Error("Installed host requires a trusted raw 32-byte Ed25519 public key");
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),key]),format:"der",type:"spki"});
  const manifest=verifyPackage(payload,envelope,publicKey,{abi:7,target:"pjm-ios"});
  return {payload,key,manifest};
}
export function writeInstalledProject(options:{directory:string;library:string;payload:string;envelope:string;publicKey:string;bundle?:string}) {
  const {payload,key,manifest}=verifyInstalledInputs(options);
  const bundle=options.bundle??"dev.pjm.installed";
  if(!/^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/.test(bundle))throw new Error("Invalid installed host bundle identity");
  const root=fileURLToPath(new URL("../",import.meta.url)),directory=resolve(options.directory);
  mkdirSync(directory,{recursive:true});cpSync(join(root,"host/ios"),directory,{recursive:true});cpSync(join(root,"core-ffi/include/mini_core.h"),join(directory,"mini_core.h"));
  writeFileSync(join(directory,"main.pocket"),payload);writeFileSync(join(directory,"manifest.json"),canonical(manifest));writeFileSync(join(directory,"publisher.key"),key);writeFileSync(join(directory,"app.id"),manifest.appId);
  cpSync(resolve(options.library),join(directory,"libmini_core_ffi.a"));
  writeNativeProject(directory,"","$(PROJECT_DIR)/libmini_core_ffi.a","",false,bundle,true);
  return {directory,bundle,appId:manifest.appId,version:manifest.version};
}
