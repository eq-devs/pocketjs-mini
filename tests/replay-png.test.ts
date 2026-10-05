import {test,expect} from 'bun:test';
import {inflateSync} from 'node:zlib';
import {encodeReplayPNG} from '../devtools/png.ts';
test('replay PNG preserves BGRA colour and alpha without modifying native input',()=>{
 const pixels=Buffer.from([0,0,255,255,255,0,0,128,0,255,0,255,255,255,255,0]),original=Buffer.from(pixels),png=Buffer.from(encodeReplayPNG(2,2,pixels));
 expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
 let offset=8,compressed=Buffer.alloc(0),types:string[]=[];while(offset<png.length){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);types.push(type);if(type==='IHDR'){expect(data.readUInt32BE(0)).toBe(2);expect(data.readUInt32BE(4)).toBe(2);expect(data[9]).toBe(6);}if(type==='IDAT')compressed=Buffer.concat([compressed,data]);offset+=12+size;}
 expect(types).toEqual(['IHDR','IDAT','IEND']);expect(inflateSync(compressed)).toEqual(Buffer.from([0,255,0,0,255,0,0,255,128,0,0,255,0,255,255,255,255,0]));expect(pixels).toEqual(original);
});
test('replay PNG rejects oversized or inconsistent native frames',()=>{
 for(const [width,height] of [[0,1],[1.5,1],[4097,1],[4096,4096],[1,1]])expect(()=>encodeReplayPNG(width,height,new Uint8Array())).toThrow('framebuffer');
});
