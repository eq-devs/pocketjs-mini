import {test,expect} from "bun:test";
import {cpSync,mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {androidLocationFiles} from "../bin/android-location.ts";

test("location runtime rejects changed libraries, resources and redirected files before export",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-location-runtime-")),runtime=join(root,"runtime");
  try{
    cpSync(join(import.meta.dir,"../vendor/android-location"),runtime,{recursive:true});
    expect(androidLocationFiles(runtime).files.size).toBe(422);
    for(const name of ["jars/play-services-location-21.2.0.jar","resources/play-services-basement-18.3.0/res/values/values.xml"]){
      const path=join(runtime,name),original=readFileSync(path);
      writeFileSync(path,Buffer.concat([original,Buffer.from("changed")]));
      expect(()=>androidLocationFiles(runtime)).toThrow("checksum mismatch");writeFileSync(path,original);
    }
    const path=join(runtime,"packages.txt"),outside=join(root,"original-packages.txt");writeFileSync(outside,readFileSync(path));rmSync(path);symlinkSync(outside,path);
    expect(()=>androidLocationFiles(runtime)).toThrow("Redirected");rmSync(path);writeFileSync(path,readFileSync(outside));
    const lockPath=join(runtime,"runtime-lock.json"),lock=JSON.parse(readFileSync(lockPath,"utf8"));lock.files[0].name="../outside";writeFileSync(lockPath,JSON.stringify(lock));
    expect(()=>androidLocationFiles(runtime)).toThrow("Invalid Android location path");
  }finally{rmSync(root,{recursive:true,force:true});}
});
