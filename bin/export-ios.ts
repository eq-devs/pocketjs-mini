import {existsSync,lstatSync,mkdirSync,rmSync} from "node:fs";
import {resolve,join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyInstalledInputs,writeInstalledProject} from "./installed-project.ts";
const usage="pjm export-ios --package <release-directory> --public-key <raw-key-file> --output <new-directory> [--target simulator|device] [--bundle <id>]";
async function main(){
  const args=process.argv.slice(2),flags=new Map<string,string>();
  for(let index=0;index<args.length;index+=2){const name=args[index],value=args[index+1];if(!["--package","--public-key","--output","--target","--bundle"].includes(name) || flags.has(name) || !value || value.startsWith("--"))throw new Error(usage);flags.set(name,value);}
  for(const name of ["--package","--public-key","--output"])if(!flags.has(name))throw new Error(usage);
  const mode=flags.get("--target")??"device";if(!["device","simulator"].includes(mode))throw new Error(usage);
  const directory=resolve(flags.get("--output")!),root=fileURLToPath(new URL("../",import.meta.url));
  try{lstatSync(directory);throw new Error("Output directory already exists; choose a new directory");}catch(error:any){if(error.code!=="ENOENT")throw error;}
  const packageRoot=resolve(flags.get("--package")!),inputs={payload:join(packageRoot,"main.pocket"),envelope:join(packageRoot,"manifest.json"),publicKey:resolve(flags.get("--public-key")!)};
  verifyInstalledInputs(inputs);
  const bundle=flags.get("--bundle")??"dev.pjm.installed";if(!/^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*)+$/.test(bundle))throw new Error("Invalid host bundle identity");
  if(process.platform!=="darwin")throw new Error("Native iOS export requires macOS and Xcode");
  const target=mode==="device"?"aarch64-apple-ios":process.arch==="arm64"?"aarch64-apple-ios-sim":"x86_64-apple-ios";
  async function run(command:string[],capture=false){const child=Bun.spawn(command,{stdout:capture?"pipe":"inherit",stderr:"inherit",env:{...process.env,IPHONEOS_DEPLOYMENT_TARGET:"16.0"}});const [status,output]=await Promise.all([child.exited,capture?new Response(child.stdout).text():Promise.resolve("")]);if(status!==0)throw new Error(`${command[0]} failed (${status})`);return output;}
  const installed=await run(["rustup","target","list","--installed","--toolchain","stable"],true);
  if(!installed.trim().split("\n").includes(target))await run(["rustup","target","add","--toolchain","stable",target]);
  await run(["rustup","run","stable","cargo","build","--release","--locked","--manifest-path",join(root,"core-ffi/Cargo.toml"),"--target",target]);
  mkdirSync(dirname(directory),{recursive:true});mkdirSync(directory,{recursive:false});let complete=false;
  try{const result=writeInstalledProject({...inputs,directory,library:join(root,"core-ffi/target",target,"release/libmini_core_ffi.a"),bundle});complete=true;console.log(`Exported ${result.appId} ${result.version}: ${join(result.directory,"Mini.xcodeproj")} (${mode})`);}
  finally{if(!complete && existsSync(directory))rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(`pjm: ${error.message}`);process.exitCode=1;});
