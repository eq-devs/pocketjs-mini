import {cpSync,mkdirSync,writeFileSync} from "node:fs";
import {readBoundedFile} from '../container/bounded-file.ts';
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createPublicKey} from "node:crypto";
import {verifyPackage,canonical,MAX_PACKAGE_BYTES} from "../container/package.ts";
import {admitInstalledPayload} from '../container/installed-payload.ts';
import {strictJson} from "../container/strict-json.ts";
import {writeNativeProject} from "./native-project.ts";
/** Produce a signed-only iOS host project. The caller supplies a trusted public
 * key separately from the envelope; private publisher keys are never bundled.
 * Native startup additionally verifies structure and admits the build plan. */
export function verifyInstalledInputs(options:{payload:string;envelope:string;publicKey:string},target:"pjm-ios"|"pjm-android"="pjm-ios") {
  const read=(path:string,limit:number)=>{try{return readBoundedFile(path,limit);}catch(cause){throw new Error("Installed host input must be a bounded regular file",{cause});}};
  const payload=read(options.payload,MAX_PACKAGE_BYTES), envelope=strictJson(read(options.envelope,65536)),key=read(options.publicKey,32);
  if(key.length!==32)throw new Error("Installed host requires a trusted raw 32-byte Ed25519 public key");
  const publicKey=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),key]),format:"der",type:"spki"});
  const manifest=verifyPackage(payload,envelope,publicKey,{abi:7,target});
  admitInstalledPayload(payload,manifest,target);
  return {payload,key,manifest};
}
export function previousPublisherKey(path:string|undefined,current:Uint8Array){
  if(path===undefined)return undefined;
  const key=readBoundedFile(path,32);
  if(key.length!==32||key.equals(Buffer.from(current)))throw Error('Previous publisher key must be a distinct raw 32-byte public key');
  return key;
}
export function iosDistributionUrl(address:string){
  const url=new URL(address),authority=address.match(/^https:\/\/([^/?#]*)/i)?.[1];
  if(address.length>2048 || !authority || authority.includes('@') || /\s/.test(address) || url.protocol!=='https:' || url.username || url.password || url.search || url.hash || address.includes('?') || address.includes('#'))throw Error('Distribution endpoint must be HTTPS without credentials, query or fragment');
  return url.href;
}
export function writeInstalledProject(options:{directory:string;library:string;payload:string;envelope:string;publicKey:string;previousPublicKey?:string;bundle?:string;distributionUrl?:string}) {
  const distribution=options.distributionUrl===undefined?undefined:iosDistributionUrl(options.distributionUrl);
  const {payload,key,manifest}=verifyInstalledInputs(options);
  const previous=previousPublisherKey(options.previousPublicKey,key);
  const bundle=options.bundle??"dev.pjm.installed";
  if(!/^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/.test(bundle))throw new Error("Invalid installed host bundle identity");
  const root=fileURLToPath(new URL("../",import.meta.url)),directory=resolve(options.directory);
  mkdirSync(directory,{recursive:true});cpSync(join(root,"host/ios"),directory,{recursive:true});cpSync(join(root,"core-ffi/include/mini_core.h"),join(directory,"mini_core.h"));
  writeFileSync(join(directory,"main.pocket"),payload);writeFileSync(join(directory,"manifest.json"),canonical(manifest));writeFileSync(join(directory,"publisher.key"),key);writeFileSync(join(directory,"app.id"),manifest.appId);
  if(distribution)writeFileSync(join(directory,"distribution.json"),canonical({format:1,latestUrl:distribution}));
  writeFileSync(join(directory,"publisher.trust"),Buffer.from([1,previous?2:1]));
  if(previous)writeFileSync(join(directory,"publisher.previous.key"),previous);
  cpSync(resolve(options.library),join(directory,"libmini_core_ffi.a"));
  writeNativeProject(directory,"","$(PROJECT_DIR)/libmini_core_ffi.a","",false,bundle,true,!!distribution,!!previous);
  return {directory,bundle,appId:manifest.appId,version:manifest.version};
}
