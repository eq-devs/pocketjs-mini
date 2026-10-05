import {existsSync,lstatSync,mkdirSync,mkdtempSync,rmSync} from "node:fs";
import {resolve,join,dirname} from "node:path";
import {homedir,tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {verifyInstalledInputs} from "./installed-project.ts";
import {writeInstalledAndroidProject} from "./installed-android-project.ts";
const usage="pjm export-android --package <release-directory> --public-key <raw-key-file> --output <new-directory> [--bundle <id>]";
async function main(){
  const args=process.argv.slice(2),flags=new Map<string,string>();
  for(let index=0;index<args.length;index+=2){const name=args[index],value=args[index+1];if(!["--package","--public-key","--output","--bundle"].includes(name) || flags.has(name) || !value || value.startsWith("--"))throw new Error(usage);flags.set(name,value);}
  for(const name of ["--package","--public-key","--output"])if(!flags.has(name))throw new Error(usage);
  const directory=resolve(flags.get("--output")!),root=fileURLToPath(new URL("../",import.meta.url));
  try{lstatSync(directory);throw new Error("Output directory already exists; choose a new directory");}catch(error:any){if(error.code!=="ENOENT")throw error;}
  const packageRoot=resolve(flags.get("--package")!),inputs={payload:join(packageRoot,"main.pocket"),envelope:join(packageRoot,"manifest.json"),publicKey:resolve(flags.get("--public-key")!)};
  const admitted=verifyInstalledInputs(inputs,"pjm-android"),bundle=flags.get("--bundle")??"dev.pjm.installed";
  if(!/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(bundle))throw new Error("Invalid Android host package identity");
  if(!["darwin","linux"].includes(process.platform))throw new Error("Android export currently requires macOS or Linux");
  const sdk=process.env.ANDROID_SDK_ROOT??process.env.ANDROID_HOME??join(homedir(),process.platform==="darwin"?"Library/Android/sdk":"Android/Sdk");
  const ndk=join(sdk,"ndk/28.2.13676358/toolchains/llvm/prebuilt",process.platform==="darwin"?"darwin-x86_64":"linux-x86_64","bin"),clang=join(ndk,"aarch64-linux-android23-clang");
  if(!existsSync(clang))throw new Error("Install Android NDK 28.2.13676358 and set ANDROID_SDK_ROOT");
  const env:NodeJS.ProcessEnv={...process.env,CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER:clang,CC_aarch64_linux_android:clang,AR_aarch64_linux_android:join(ndk,"llvm-ar"),BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android:`--target=aarch64-linux-android23 --sysroot=${join(ndk,"../sysroot")}`,RUSTFLAGS:[process.env.RUSTFLAGS,"-C link-arg=-Wl,-z,max-page-size=16384"].filter(Boolean).join(" ")};
  if(process.platform==="darwin")env.LIBCLANG_PATH??="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib";
  async function run(command:string[],capture=false){const child=Bun.spawn(command,{stdout:capture?"pipe":"inherit",stderr:"inherit",env});const [status,output]=await Promise.all([child.exited,capture?new Response(child.stdout).text():Promise.resolve("")]);if(status!==0)throw new Error(`${command[0]} failed (${status})`);return output;}
  env.RUSTC=(await run(["rustup","which","--toolchain","stable","rustc"],true)).trim();
  const target="aarch64-linux-android",installed=await run(["rustup","target","list","--installed","--toolchain","stable"],true);
  if(!installed.trim().split("\n").includes(target))await run(["rustup","target","add","--toolchain","stable",target]);
  await run(["rustup","run","stable","cargo","build","--release","--locked","--manifest-path",join(root,"core-ffi/Cargo.toml"),"--target",target]);
  const temporary=mkdtempSync(join(tmpdir(),"pjm-export-android-"));let created=false,complete=false;
  try{
    const library=join(temporary,"libpocketjs.so");
    await run([clang,"-Wall","-Wextra","-Werror","-O2","-fPIC","-shared","-Wl,--gc-sections","-Wl,--exclude-libs,ALL","-Wl,--no-undefined","-Wl,-z,max-page-size=16384","-I",join(root,"core-ffi/include"),... ["package_bridge.c","pool_bridge.c","store_bridge.c"].map(name=>join(root,"host/android",name)),join(root,"core-ffi/target",target,"release/libmini_core_ffi.a"),"-lEGL","-lGLESv2","-ldl","-lm","-llog","-o",library]);
    mkdirSync(dirname(directory),{recursive:true});mkdirSync(directory,{recursive:false});created=true;
    const result=writeInstalledAndroidProject({...inputs,directory,library,bundle});complete=true;
    console.log(`Exported ${admitted.manifest.appId} ${admitted.manifest.version}: ${result.directory}. Run build-apk.sh there to build an unsigned APK.`);
  }finally{rmSync(temporary,{recursive:true,force:true});if(created && !complete)rmSync(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(`pjm: ${error.message}`);process.exitCode=1;});
