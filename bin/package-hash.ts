/** FNV-1a 64-bit using exact integer products below JavaScript's 53-bit limit. */
export function verifyPocketHash(bytes:Uint8Array):void {
 if(bytes.length<8)throw Error("Truncated package checksum");
 let low=0x84222325,high=0xcbf29ce4;
 for(let i=0;i<bytes.length-8;i++){
   low=(low^bytes[i])>>>0;
   const product=low*0x1b3;
   high=(high*0x1b3+low*0x100+Math.floor(product/0x100000000))>>>0;
   low=product>>>0;
 }
 const footer=new DataView(bytes.buffer,bytes.byteOffset+bytes.length-8,8);
 if(footer.getUint32(0,true)!==low || footer.getUint32(4,true)!==high)throw Error("Package checksum mismatch");
}
