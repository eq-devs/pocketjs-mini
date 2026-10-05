import {strictJson} from "./strict-json.ts";
import {readBoundedFile} from './bounded-file.ts';
import { mkdirSync, rmSync } from "node:fs";
import {writeAtomicFile} from './atomic-file.ts';
import { join } from "node:path";
import { PackageStore } from "./store.ts";
import { canonical } from "./package.ts";

export const STORAGE_BYTES = 1024 * 1024;
export const STORAGE_KEYS = 256;
export const VALUE_BYTES = 2048;
/** Reference host storage. App identity comes from the verified host package,
 * never from service arguments. Keys are JSON data, never filesystem paths.
 */
export class AppStorage {
  private directory: string;
  private validateDirectory: () => void;
  constructor(store: PackageStore, appId: string) {
    this.directory = store.dataRoot(appId);
    this.validateDirectory = () => {store.dataRoot(appId);};
  }
  private key(key: string): void {
    if (typeof key !== "string" || !key.length || Buffer.byteLength(key,"utf8") > 128) throw new Error("Storage key must contain 1..128 UTF-8 bytes");
    strictJson(Buffer.from(JSON.stringify(key)));
  }
  private read(): Record<string,unknown> {
    this.validateDirectory();
    const path=join(this.directory,"storage.json");
    try {
      const value=strictJson(readBoundedFile(path,STORAGE_BYTES));
      if (!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).length>STORAGE_KEYS) throw new Error("Invalid storage contents");
      for (const [key,item] of Object.entries(value)) {this.key(key);if(Buffer.byteLength(canonical(item),"utf8")>VALUE_BYTES)throw new Error("Invalid stored value");}
      return value as Record<string,unknown>;
    }catch(error:any){if(error.code==="ENOENT")return Object.create(null);if(error.code==="ELOOP")throw new Error("Invalid storage file",{cause:error});throw error;}
  }
  get(key:string): unknown {
    this.key(key);const values=this.read();
    return Object.hasOwn(values,key)?values[key]:null;
  }
  set(key:string,value:unknown): void {
    this.key(key);
    const encoded=canonical(value);
    if(Buffer.byteLength(encoded,"utf8")>VALUE_BYTES)throw new Error("Storage value exceeds quota");
    this.mutate(values=>{Object.defineProperty(values,key,{value:strictJson(Buffer.from(encoded)),enumerable:true,writable:true,configurable:true});});
  }
  remove(key:string): void {this.key(key);this.mutate(values=>{delete values[key];});}
  private mutate(operation:(values:Record<string,unknown>)=>void): void {
    this.validateDirectory();
    const lock=join(this.directory,".storage-lock");
    try{mkdirSync(lock,{mode:0o700});}catch(error:any){if(error.code==="EEXIST")throw new Error("Storage is busy; interrupted locks require host recovery");throw error;}
    try {
      const values=this.read();operation(values);
      const encoded=canonical(values);
      if(Object.keys(values).length>STORAGE_KEYS || Buffer.byteLength(encoded,"utf8")>STORAGE_BYTES)throw new Error("Application storage quota exceeded");
      writeAtomicFile(this.directory,'storage.json',encoded);
    }finally{rmSync(lock,{recursive:true});}
  }
}
