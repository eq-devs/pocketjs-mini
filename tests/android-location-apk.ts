import {mkdtempSync,writeFileSync,readFileSync,rmSync,renameSync,existsSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {spawnSync} from "node:child_process";
import {writeInstalledAndroidProject} from "../bin/installed-android-project.ts";

// Build the exported Java/resources/dex closure; deliberately do not load a native engine.
const root=mkdtempSync(join(tmpdir(),"pjm-location-apk-"));
try{
  const fixture=spawnSync(process.execPath,[join(import.meta.dir,"package-load-fixtures.ts"),join(root,"cases.json")],{env:{...process.env,PJM_PACKAGE_REAL:"",PJM_PACKAGE_TARGET:"android"},encoding:"utf8"});
  if(fixture.status!==0)throw new Error(fixture.stderr);
  const item=JSON.parse(readFileSync(join(root,"cases.json"),"utf8"))[0];
  for(const [name,data] of [["main.pocket",Buffer.from(item.payload,"base64")],["manifest.json",Buffer.from(JSON.stringify(item.manifest))],["publisher.key",Buffer.from(item.key,"base64")],["core.so",Buffer.from("Packaging fixture only; not an executable engine")]] as const)writeFileSync(join(root,name),data);
  const directory=join(root,"export");
  writeInstalledAndroidProject({directory,library:join(root,"core.so"),payload:join(root,"main.pocket"),envelope:join(root,"manifest.json"),publicKey:join(root,"publisher.key")});
  const relocated=join(root,"relocated host with spaces");renameSync(directory,relocated);
  const build=spawnSync("bash",[join(relocated,"build-apk.sh")],{stdio:"inherit",env:{...process.env,ANDROID_SDK_ROOT:process.env.ANDROID_SDK_ROOT??join(process.env.HOME!,"Library/Android/sdk"),JAVA_HOME:process.env.JAVA_HOME??"/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home"}});
  if(build.status!==0||!existsSync(join(relocated,"build/Mini-unsigned.apk")))throw new Error("Location APK packaging failed");
  console.log("Relocated location Java/resources/dex APK packaging passed; fixture engine is not executable and no device/location service ran.");
}finally{rmSync(root,{recursive:true,force:true});}
