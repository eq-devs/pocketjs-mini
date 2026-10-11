import {deflateSync} from 'node:zlib';
function crc(bytes:Uint8Array){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function chunk(kind:string,data:Buffer){const tag=Buffer.from(kind),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([tag,data])));return Buffer.concat([size,tag,data,sum]);}
export function ownedMediaPng(){
const header=Buffer.alloc(13);header.writeUInt32BE(64,0);header.writeUInt32BE(32,4);header[8]=8;header[9]=2;
const pixels=Buffer.alloc((1+64*3)*32);for(let y=0;y<32;y++)for(let x=0;x<64;x++)pixels[y*(1+64*3)+1+x*3]=255;
return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
