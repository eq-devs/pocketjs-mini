import {RELEASE_VERSION} from "./release-version.ts";
import { lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

/** Install generated SDK dependency without changing the user's tsconfig. */
export function installSdk(project: string, appEntry?: string): void {
  project=resolve(project);
  const directory = (path: string) => {
    try {const stat=lstatSync(path);if(!stat.isDirectory() || stat.isSymbolicLink())throw new Error(`SDK directory must be real: ${path}`);}
    catch(error:any){if(error.code!=="ENOENT")throw error;mkdirSync(path,{mode:0o700});}
  };
  const destination=join(project,".pjm/mini-sdk");
  for(const path of [join(project,".pjm"),destination,join(project,"node_modules"),join(project,"node_modules/@pocketjs")])directory(path);
  const link=join(project,"node_modules/@pocketjs/mini");
  let missing=false;
  try {
    const stat=lstatSync(link);
    if(!stat.isSymbolicLink() || resolve(dirname(link),readlinkSync(link))!==destination)throw new Error("@pocketjs/mini already exists outside the generated SDK; preserve or move it before running Mini");
  }catch(error:any){if(error.code!=="ENOENT")throw error;missing=true;}
  const source=fileURLToPath(new URL("../sdk/",import.meta.url));
  const files:Record<string,string>={"package.json":JSON.stringify({name:"@pocketjs/mini",version:RELEASE_VERSION,type:"module",types:"./index.ts",exports:{".":"./index.ts","./overlays":"./overlays.tsx"}})};
  for(const name of ["index.ts","native.ts","runtime.ts","navigation.ts","http.ts","json.ts","location.ts","network.ts","media.ts","ui.ts","ui-layout.ts","overlays.tsx"])files[name]=readFileSync(join(source,name),"utf8");
  // Existing projects only map the original framework entry points in tsconfig.
  // Resolve the renderer's additional dependency through the pinned local tree,
  // without rewriting the application's path mappings.
  files["overlays.tsx"]=files["overlays.tsx"].replace("from '@pocketjs/framework/virtual-list'", "from '../pocketjs/framework/src/virtual-list.ts'");
  // The pinned compiler's first pass skips external bare imports. A relative
  // entry makes SDK overlay styles/glyphs part of the same scanned module graph.
  if(appEntry)files["build-entry.ts"]='import "./overlays.tsx";\nimport '+JSON.stringify(relative(destination,resolve(project,appEntry)).split('\\').join('/'))+';\n';
  for(const [name,contents] of Object.entries(files)) {
    const path=join(destination,name);
    try {const stat=lstatSync(path);if(!stat.isFile() || stat.isSymbolicLink())throw new Error(`Invalid generated SDK file: ${path}`);if(readFileSync(path,"utf8")===contents)continue;}
    catch(error:any){if(error.code!=="ENOENT")throw error;}
    const temporary=join(destination,`.sdk-${randomBytes(12).toString("hex")}`);
    try {writeFileSync(temporary,contents,{flag:"wx",mode:0o600});renameSync(temporary,path);}finally{rmSync(temporary,{force:true});}
  }
  if(missing)symlinkSync(relative(dirname(link),destination),link,"dir");
}
