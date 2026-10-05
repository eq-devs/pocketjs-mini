import {readFileSync} from 'node:fs';

// Fixture is a fixed square viewport. Derive device taps from its owned SurfaceView.
const [path,bundle]=process.argv.slice(2),xml=readFileSync(path,'utf8');
const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]);
const owned=nodes.filter(node=>node.includes('package="'+bundle+'"')&&/content-desc="signed=dev\.pjm\.fixture version=1\.0\.0 frames=[1-9][0-9]*"/.test(node));
if(owned.length!==1)throw Error('Expected one authenticated fixture surface');
const bounds=owned[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
if(!bounds)throw Error('Fixture surface bounds missing');
const [left,top,right,bottom]=bounds.slice(1).map(Number),width=right-left,height=bottom-top;
if(width<=0||height<=0)throw Error('Invalid fixture surface bounds');
const x=Math.floor((left+right)/2),y=Math.floor((top+bottom)/2),square=Math.min(width,height),padX=(width-square)/2,padY=(height-square)/2;
let outsideX=x,outsideY=y;
if(padY>=8)outsideY=Math.floor(top+padY/2);
else if(padX>=8)outsideX=Math.floor(left+padX/2);
else throw Error('Fixture surface has no testable letterbox');
console.log([x,y,outsideX,outsideY].join(' '));
