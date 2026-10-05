import {openSync,closeSync,fstatSync,readSync,constants} from 'node:fs';

/** Read a regular host file with a byte bound enforced on the opened descriptor. */
export function readBoundedFile(path:string,maximum:number):Buffer {
  if(!Number.isSafeInteger(maximum)||maximum<0)throw Error('Invalid file byte limit');
  const file=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const stat=fstatSync(file);
    if(!stat.isFile())throw Error('Host file must be regular');
    if(stat.size>maximum)throw Error('Host file exceeds size limit');
    const chunks:Buffer[]=[];let size=0;
    for(;;){
      const chunk=Buffer.allocUnsafe(Math.min(65536,maximum-size+1));
      const count=readSync(file,chunk,0,chunk.length,null);
      if(count===0)return Buffer.concat(chunks,size);
      size+=count;if(size>maximum)throw Error('Host file exceeds size limit');
      chunks.push(chunk.subarray(0,count));
    }
  }finally{closeSync(file);}
}
