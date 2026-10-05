import {deflateSync} from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(kind:string,data:Uint8Array){const type=Buffer.from(kind),body=Buffer.concat([type,data]),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(body));return Buffer.concat([length,body,crc]);}
/** Native FFI pixels are tightly packed little-endian BGRA; PNG stores RGBA. */
export function encodeReplayPNG(width:number,height:number,pixels:Uint8Array):Uint8Array{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>4096||height>4096||width*height*4>16*1024*1024||pixels.length!==width*height*4)throw Error('Invalid replay framebuffer');
 const stride=width*4,rows=Buffer.alloc((stride+1)*height);
 for(let y=0;y<height;y++){const row=y*(stride+1);rows[row]=0;for(let x=0;x<width;x++){const source=y*stride+x*4,target=row+1+x*4;rows[target]=pixels[source+2];rows[target+1]=pixels[source+1];rows[target+2]=pixels[source];rows[target+3]=pixels[source+3];}}
 const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
