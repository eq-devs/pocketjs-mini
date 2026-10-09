import {test,expect} from "bun:test";
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
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
    writeFileSync(payload,"tampered");const rejected=join(root,"rejected");
    expect(()=>writeInstalledProject({...options,directory:rejected})).toThrow();expect(existsSync(rejected)).toBe(false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("public export command rejects invalid options and preserves existing output",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-export-cli-"));
  try{
    const cli=join(import.meta.dir,"../bin/pjm"),marker=join(root,"keep.txt");writeFileSync(marker,"keep");
    const run=(args:string[])=>spawnSync(cli,["export-ios",...args],{encoding:"utf8"});
    expect(run([]).status).not.toBe(0);
    expect(run(["--package","x","--public-key","x","--output",root]).stderr).toContain("already exists");
    expect(readFileSync(marker,"utf8")).toBe("keep");
    expect(run(["--package","x","--public-key","x","--output",join(root,"new"),"--target","android"]).status).not.toBe(0);
    expect(existsSync(join(root,"new"))).toBe(false);
    expect(run(["--package","x","--package","y","--public-key","x","--output",join(root,"new")]).status).not.toBe(0);
  }finally{rmSync(root,{recursive:true,force:true});}
});
