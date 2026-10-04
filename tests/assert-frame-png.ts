import {readFileSync} from "node:fs";
import {inflateSync} from "node:zlib";
// Decode owned Android screenshots without a platform image-library dependency.
function center(path:string):number[]{
  const png=readFileSync(path),parts:Buffer[]=[];let width=0,height=0,channels=0;
  if(png.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")throw Error("Not PNG");
  for(let offset=8;offset+12<=png.length;){const length=png.readUInt32BE(offset),kind=png.toString("ascii",offset+4,offset+8),data=png.subarray(offset+8,offset+8+length);if(data.length!==length)throw Error("Truncated PNG");
    if(kind==="IHDR"){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===6?4:data[9]===2?3:0;if(data[8]!==8 || data[12]!==0 || !channels || width*height>32*1024*1024)throw Error("Unsupported screenshot");}
    if(kind==="IDAT")parts.push(data);offset+=length+12;
  }
  const stride=width*channels,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});if(raw.length!==(stride+1)*height)throw Error("Invalid screenshot rows");
  let previous=Buffer.alloc(stride);
  for(let y=0;y<=Math.floor(height/2);y++){const filter=raw[y*(stride+1)],row=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)));if(filter>4)throw Error("Invalid PNG filter");
    for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0,p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);row[x]=(row[x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?(pa<=pb && pa<=pc?a:pb<=pc?b:c):0))&255;}
    previous=row;
  }return [...previous.subarray(Math.floor(width/2)*channels,Math.floor(width/2)*channels+3)];
}
const [path,expected]=process.argv.slice(2),actual=center(path).join(",");if(actual!==expected)throw Error(`Screenshot center ${actual}, expected ${expected}`);console.log(`Verified screenshot center: ${actual}`);
