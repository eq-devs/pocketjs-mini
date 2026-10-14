import {test,expect} from "bun:test";
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {writeInstalledAndroidProject} from "../bin/installed-android-project.ts";
import {writeInstalledProject} from "../bin/installed-project.ts";
test("installed host export bundles separate trust and excludes the development entry",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-installed-project-"));
  try{
    const fixture=spawnSync(process.execPath,[join(import.meta.dir,"package-load-fixtures.ts"),join(root,"cases.json")],{env:{...process.env,PJM_PACKAGE_REAL:""},encoding:"utf8"});expect(fixture.status).toBe(0);
    const item=JSON.parse(readFileSync(join(root,"cases.json"),"utf8"))[0];
    const payload=join(root,"main.pocket"),envelope=join(root,"manifest.json"),publicKey=join(root,"publisher.key"),directory=join(root,"host");
    writeFileSync(payload,Buffer.from(item.payload,"base64"));writeFileSync(envelope,JSON.stringify(item.manifest));writeFileSync(publicKey,Buffer.from(item.key,"base64"));
    writeFileSync(join(root,"core.a"),"test archive");
    const options={directory,library:join(root,"core.a"),payload,envelope,publicKey};
    const result=writeInstalledProject(options);expect(result.appId).toBe("dev.pjm.fixture");
    expect(readFileSync(join(directory,"publisher.key"))).toEqual(Buffer.from(item.key,"base64"));
    expect(readFileSync(join(directory,"main.pocket"))).toEqual(readFileSync(payload));
    expect(readFileSync(join(directory,"Config.h"),"utf8")).toContain("PJM_DEVELOPMENT_MODE 0");
    const info=readFileSync(join(directory,"Info.plist"),"utf8");
    expect(info).toContain('<key>CFBundleShortVersionString</key><string>0.0.1</string>');expect(info).toContain('<key>CFBundleVersion</key><string>5</string>');
    expect(JSON.parse(readFileSync(join(directory,"manifest.json"),"utf8")).version).toBe("1.0.0");
    const project=readFileSync(join(directory,"Mini.xcodeproj/project.pbxproj"),"utf8");
    for(const name of ["main.pocket","manifest.json","publisher.key","app.id"])expect(project).toContain(name);
    expect(project).toContain("A081, A083, A085, A087");
    expect(project).toContain("$(PROJECT_DIR)/libmini_core_ffi.a");
    expect(project).toContain("VerifiedLocation.m");
    expect(project).toContain('"-framework", CoreLocation');
    expect(project).toContain("name = Release");
    expect(readFileSync(join(directory,"Info.plist"),"utf8")).toContain("NSLocationWhenInUseUsageDescription");
    expect(readFileSync(join(directory,"VerifiedLocation.m"),"utf8")).toContain("requestWhenInUseAuthorization");
    expect(readFileSync(join(directory,"Mini.xcodeproj/xcshareddata/xcschemes/Mini.xcscheme"),"utf8")).toContain('ArchiveAction buildConfiguration="Release"');
    expect(readFileSync(join(directory,"libmini_core_ffi.a"),"utf8")).toBe("test archive");
    expect(existsSync(join(directory,"distribution.json"))).toBe(false);
    expect(project).toContain("PackageDownload.m");
    const enabled=join(root,"distribution");writeInstalledProject({...options,directory:enabled,distributionUrl:"https://distribution.example/latest.json"});
    expect(JSON.parse(readFileSync(join(enabled,"distribution.json"),"utf8"))).toEqual({format:1,latestUrl:"https://distribution.example/latest.json"});
    expect(readFileSync(join(enabled,"Mini.xcodeproj/project.pbxproj"),"utf8")).toContain("A097");
    expect(readFileSync(join(enabled,"PackageDownload.m"),"utf8")).toBe(readFileSync(join(import.meta.dir,"../host/ios/PackageDownload.m"),"utf8"));
    for(const distributionUrl of ["http://distribution.example/latest.json","https://@distribution.example/latest.json","https://user@distribution.example/latest.json","https://distribution.example/latest.json?","https://distribution.example/latest.json#"]){const rejected=join(root,"invalid-distribution");expect(()=>writeInstalledProject({...options,directory:rejected,distributionUrl})).toThrow();expect(existsSync(rejected)).toBe(false);}
    const rotated=item.rotation,newPayload=join(root,'rotated.pocket'),newEnvelope=join(root,'rotated.json'),newKey=join(root,'rotated.key');
    writeFileSync(newPayload,Buffer.from(rotated.payload,'base64'));writeFileSync(newEnvelope,JSON.stringify(rotated.manifest));writeFileSync(newKey,Buffer.from(rotated.key,'base64'));
    const transitionDirectory=join(root,'transition-host');
    writeInstalledProject({...options,directory:transitionDirectory,payload:newPayload,envelope:newEnvelope,publicKey:newKey,previousPublicKey:publicKey});
    expect(readFileSync(join(transitionDirectory,'publisher.key'))).toEqual(Buffer.from(rotated.key,'base64'));
    expect(readFileSync(join(transitionDirectory,'publisher.previous.key'))).toEqual(Buffer.from(item.key,'base64'));
    expect(existsSync(join(directory,'publisher.previous.key'))).toBe(false);
    expect(readFileSync(join(directory,'publisher.trust'))).toEqual(Buffer.from([1,1]));
    expect(readFileSync(join(transitionDirectory,'publisher.trust'))).toEqual(Buffer.from([1,2]));
    const linkedPrevious=join(root,'linked-previous.key');symlinkSync(publicKey,linkedPrevious);
    const linkedOutput=join(root,'linked-key-host');
    expect(()=>writeInstalledProject({...options,directory:linkedOutput,previousPublicKey:linkedPrevious})).toThrow();expect(existsSync(linkedOutput)).toBe(false);
    const invalidPrevious=join(root,'invalid-previous.key');
    for(const bytes of [Buffer.alloc(31),Buffer.alloc(33),Buffer.from(item.key,'base64')]){
      writeFileSync(invalidPrevious,bytes);const rejected=join(root,'invalid-key-host');
      expect(()=>writeInstalledProject({...options,directory:rejected,previousPublicKey:invalidPrevious})).toThrow();expect(existsSync(rejected)).toBe(false);
    }
    expect(readFileSync(join(transitionDirectory,'Mini.xcodeproj/project.pbxproj'),'utf8')).toContain('fileRef = A098');
    expect(readFileSync(join(transitionDirectory,'Mini.xcodeproj/project.pbxproj'),'utf8')).toContain('A085, A087, A099');
    writeFileSync(payload,"tampered");const rejected=join(root,"rejected");
    expect(()=>writeInstalledProject({...options,directory:rejected})).toThrow();expect(existsSync(rejected)).toBe(false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("public export command rejects invalid options and preserves existing output",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-export-cli-"));
  try{
    const cli=join(import.meta.dir,"../bin/pjm"),marker=join(root,"keep.txt");writeFileSync(marker,"keep");
    const run=(args:string[])=>spawnSync(cli,["export-ios",...args],{encoding:"utf8"});
    const version=spawnSync(cli,["--version"],{encoding:"utf8"});expect(version.status).toBe(0);expect(version.stdout.trim()).toBe("pjm 0.0.1 (build 5)");
    expect(run([]).status).not.toBe(0);
    expect(run(["--package","x","--public-key","x","--output",root]).stderr).toContain("already exists");
    expect(readFileSync(marker,"utf8")).toBe("keep");
    expect(run(["--package","x","--public-key","x","--output",join(root,"new"),"--target","android"]).status).not.toBe(0);
    expect(existsSync(join(root,"new"))).toBe(false);
    expect(run(["--package","x","--package","y","--public-key","x","--output",join(root,"new")]).status).not.toBe(0);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("both installed exports reject authenticated packages with incompatible native plans before writing output",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-installed-plan-rejection-"));
  try{
    for(const target of ["ios","android"] as const){
      const casesPath=join(root,target+"-cases.json"),fixture=spawnSync(process.execPath,[join(import.meta.dir,"package-load-fixtures.ts"),casesPath],{env:{...process.env,PJM_PACKAGE_TARGET:target,PJM_PACKAGE_REAL:"",PJM_PACKAGE_HTTP_TEST:"",PJM_PACKAGE_LOCATION_SDK_TEST:""},encoding:"utf8"});expect(fixture.status).toBe(0);
      const cases=JSON.parse(readFileSync(casesPath,"utf8"));
      for(const name of ["plan-version-mismatch","signed-identity-mismatch","unsupported-presentation"]){
        const item=cases.find((value:any)=>value.name===name);expect(item).toBeDefined();
        const payload=join(root,"main.pocket"),envelope=join(root,"manifest.json"),publicKey=join(root,"publisher.key"),directory=join(root,target+"-"+name);
        writeFileSync(payload,Buffer.from(item.payload,"base64"));writeFileSync(envelope,JSON.stringify(item.manifest));writeFileSync(publicKey,Buffer.from(item.key,"base64"));
        const exportHost=target==="ios"?writeInstalledProject:writeInstalledAndroidProject;
        expect(()=>exportHost({directory,library:join(root,"unused-native-library"),payload,envelope,publicKey})).toThrow(/plan|identity/);
        expect(existsSync(directory)).toBe(false);
      }
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});
