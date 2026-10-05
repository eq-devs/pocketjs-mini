import {test,expect} from "bun:test";
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {writeInstalledAndroidProject} from "../bin/installed-android-project.ts";
test("Android installed export preserves separate trust and portable signed-only sources",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-installed-android-project-"));
  try{
    const fixture=spawnSync(process.execPath,[join(import.meta.dir,"package-load-fixtures.ts"),join(root,"cases.json")],{env:{...process.env,PJM_PACKAGE_REAL:"",PJM_PACKAGE_TARGET:"android"},encoding:"utf8"});expect(fixture.status).toBe(0);
    const item=JSON.parse(readFileSync(join(root,"cases.json"),"utf8"))[0],payload=join(root,"main.pocket"),envelope=join(root,"manifest.json"),publicKey=join(root,"publisher.key"),directory=join(root,"host");
    writeFileSync(payload,Buffer.from(item.payload,"base64"));writeFileSync(envelope,JSON.stringify(item.manifest));writeFileSync(publicKey,Buffer.from(item.key,"base64"));writeFileSync(join(root,"core.so"),"test library");
    const options={directory,library:join(root,"core.so"),payload,envelope,publicKey},result=writeInstalledAndroidProject(options);
    expect(result.appId).toBe("dev.pjm.fixture");expect(readFileSync(join(directory,"assets/main.pocket"))).toEqual(readFileSync(payload));expect(readFileSync(join(directory,"assets/publisher.key"))).toEqual(Buffer.from(item.key,"base64"));
    const manifest=readFileSync(join(directory,"AndroidManifest.xml"),"utf8");expect(manifest).toContain('android:debuggable="false"');expect(manifest).toContain('android:usesCleartextTraffic="false"');expect(manifest).toContain("InstalledActivity");expect(manifest).not.toContain("MiniActivity");
    expect(readdirSync(join(directory,"src"))).not.toContain("MiniActivity.java");expect(readFileSync(join(directory,"lib/arm64-v8a/libpocketjs.so"),"utf8")).toBe("test library");
    expect(readdirSync(join(directory,"src"))).not.toContain("HttpSurfaceActivity.java");
    expect(readFileSync(join(directory,"src/VerifiedClipboard.java"),"utf8")).toBe(readFileSync(join(import.meta.dir,"../host/android/VerifiedClipboard.java"),"utf8"));
    expect(readFileSync(join(directory,"src/InstalledActivity.java"),"utf8")).toContain('clipboard.start(admitted,generation');
    const script=join(directory,"build-apk.sh");expect(spawnSync("bash",["-n",script]).status).toBe(0);expect(readFileSync(script,"utf8")).not.toContain(root);expect(readFileSync(script,"utf8")).not.toContain("apksigner");
    expect(manifest).toContain('android.permission.INTERNET');expect(readdirSync(join(directory,"deps")).filter(name=>name.endsWith(".jar")).length).toBe(31);expect(readFileSync(join(directory,"assets/PublicSuffixDatabase.list")).length).toBeGreaterThan(0);
    expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION');expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION');expect(manifest).toContain('@integer/google_play_services_version');expect(manifest).toContain('GoogleApiActivity');
    expect(readFileSync(join(directory,"src/InstalledActivity.java"),"utf8")).toContain('location.start(admitted,generation');
    expect(readFileSync(join(directory,"src/LocationApproval.java"),"utf8")).toBe(readFileSync(join(import.meta.dir,"../host/android/LocationApproval.java"),"utf8"));
    expect(existsSync(join(directory,"deps/annotations-13.0.jar"))).toBe(false);expect(existsSync(join(directory,"deps/annotations-23.0.0.jar"))).toBe(true);
    expect(readFileSync(join(directory,"packages.txt"),"utf8")).toContain('com.google.android.gms.common');expect(existsSync(join(directory,"resources/play-services-basement-18.3.0/res/values/values.xml"))).toBe(true);
    writeFileSync(payload,"tampered");expect(()=>writeInstalledAndroidProject({...options,directory:join(root,"rejected")})).toThrow();expect(existsSync(join(root,"rejected"))).toBe(false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("Android export CLI rejects duplicate options and preserves existing output",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-export-android-cli-"));
  try{
    const cli=join(import.meta.dir,"../bin/pjm"),marker=join(root,"keep.txt");writeFileSync(marker,"keep");const run=(args:string[])=>spawnSync(cli,["export-android",...args],{encoding:"utf8"});
    expect(run([]).status).not.toBe(0);expect(run(["--package","x","--public-key","x","--output",root]).stderr).toContain("already exists");expect(readFileSync(marker,"utf8")).toBe("keep");
    expect(run(["--package","x","--package","y","--public-key","x","--output",join(root,"new")]).status).not.toBe(0);expect(existsSync(join(root,"new"))).toBe(false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
