import {readFileSync} from 'node:fs';

export function benchmarkInputPoints(xml:string):number[] {
 const nodes=xml.match(/<node\b[^>]*>/g)??[];
 const candidates=nodes.filter(value=>/class="(?:android\.view\.(?:SurfaceView|View)|android\.opengl\.GLSurfaceView)"/.test(value)&&value.includes('package="dev.pjm.benchmark.validation"')&&/content-desc="signed=dev\.pjm\.benchmark version=[0-9]+\.[0-9]+\.[0-9]+ frames=[1-9][0-9]*"/.test(value));
 if(candidates.length!==1)throw Error('One authenticated benchmark surface required');
 const bounds=candidates[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
 if(!bounds)throw Error('Authenticated benchmark bounds missing');
 const [left,top,right,bottom]=bounds.slice(1).map(Number),width=right-left,height=bottom-top;
 if(width<1||height<1||right>8192||bottom>8192)throw Error('Invalid surface bounds');
 const scale=Math.min(width/390,height/844),x=left+(width-390*scale)/2,y=top+(height-844*scale)/2;
 const point=(lx:number,ly:number)=>[Math.round(x+lx*scale),Math.round(y+ly*scale)];
 return [...point(195,650),...point(195,200),...point(340,32)];
}
if(import.meta.main)console.log(benchmarkInputPoints(readFileSync(process.argv[2],'utf8')).join(' '));
