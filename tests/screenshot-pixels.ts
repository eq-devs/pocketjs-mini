import {inflateSync} from 'node:zlib';
/** Read Android's bounded, non-interlaced RGB/RGBA screenshot without altering it. */
export function cyanViewportEdges(png:Uint8Array):number {
 const data=Buffer.from(png);if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid screenshot PNG');
 const width=data.readUInt32BE(16),height=data.readUInt32BE(20),channels=data[25]===2?3:data[25]===6?4:0;
 if(!channels||data[24]!==8||data[28]!==0||width<8||height<8||width*height*channels>32*1024*1024)throw Error('Unsupported screenshot PNG');
 const parts:Buffer[]=[];for(let p=8;p<data.length;){if(p+12>data.length)throw Error('Truncated PNG chunk');const n=data.readUInt32BE(p);if(n>data.length-p-12)throw Error('Truncated PNG payload');if(data.toString('ascii',p+4,p+8)==='IDAT')parts.push(data.subarray(p+8,p+8+n));p+=12+n;}
 const stride=width*channels,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});if(raw.length!==(stride+1)*height)throw Error('Invalid screenshot pixel length');
 let prior=Buffer.alloc(stride),count=0;
 for(let y=0;y<height;y++){
  const filter=raw[y*(stride+1)],row=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)));if(filter>4)throw Error('Invalid PNG filter');
  for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=prior[x],c=x>=channels?prior[x-channels]:0;let predictor=0;if(filter===1)predictor=a;if(filter===2)predictor=b;if(filter===3)predictor=Math.floor((a+b)/2);if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predictor=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}row[x]=(row[x]+predictor)&255;}
  for(const x of [0,1,2,3,width-4,width-3,width-2,width-1]){const p=x*channels;if(row[p]<40&&row[p+1]>180&&row[p+2]>180)count++;}
  prior=row;
 }
 return count;
}
