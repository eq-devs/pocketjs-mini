import {test,expect} from "bun:test";
import {verifyPocketHash} from "../bin/package-hash.ts";
test("32-bit checksum verification matches independent BigInt FNV and rejects corruption",()=>{
 let seed=12345;for(const length of [0,1,7,8,255,4096,1048576]){
 const bytes=new Uint8Array(length+8);let hash=0xcbf29ce484222325n;for(let i=0;i<length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;bytes[i]=seed>>>24;hash=((hash^BigInt(bytes[i]))*0x100000001b3n)&0xffffffffffffffffn;}
 new DataView(bytes.buffer).setBigUint64(length,hash,true);expect(()=>verifyPocketHash(bytes)).not.toThrow();const padded=new Uint8Array(bytes.length+20);padded.set(bytes,10);expect(()=>verifyPocketHash(padded.subarray(10,10+bytes.length))).not.toThrow();bytes[bytes.length-1]^=1;expect(()=>verifyPocketHash(bytes)).toThrow();
 }
 expect(()=>verifyPocketHash(new Uint8Array(7))).toThrow();
});
