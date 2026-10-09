import {test,expect} from "bun:test";
import {devtoolsPanel} from "../bin/devtools-panel.ts";
test("development panel consumes session manifest as text without embedding guest data",()=>{
  expect(devtoolsPanel).toContain("fetch('state'");
  expect(devtoolsPanel).toContain("fetch('replay/'+name");
  expect(devtoolsPanel).toContain("output.textContent=JSON.stringify");
  expect(devtoolsPanel).not.toContain("innerHTML");
  expect(devtoolsPanel).toContain('id="replay-step"');
  expect(devtoolsPanel).toContain("New snapshots clear selection");
});

import {sessionPanel} from "../bin/devtools.ts";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("panel command validates local session metadata and rejects linked files",()=>{
  const root=mkdtempSync(join(tmpdir(),"pjm-panel-"));mkdirSync(join(root,"build"));const path=join(root,"build/session.json"),url="http://127.0.0.1:8130/"+"a".repeat(48)+"/";
  try {
    writeFileSync(path,JSON.stringify({pid:process.pid,url}));expect(sessionPanel(root)).toBe(url+"devtools");
    for(const bad of ["https://example.com/","http://user:password@localhost/"+"a".repeat(48)+"/",url+"?x=1","file:///tmp/test"]){writeFileSync(path,JSON.stringify({pid:process.pid,url:bad}));expect(()=>sessionPanel(root)).toThrow();}
    rmSync(path);writeFileSync(join(root,"outside"),JSON.stringify({pid:process.pid,url}));symlinkSync(join(root,"outside"),path);expect(()=>sessionPanel(root)).toThrow();
  }finally{rmSync(root,{recursive:true,force:true});}
});

import {runInNewContext} from "node:vm";
test("panel renders literal logs, filters revisions and levels, and pauses polling",async()=>{
  class Element {
    textContent="";className="";hidden=false;value="all";checked=false;
    children:Element[]=[];listeners:Record<string,()=>void>={};
    appendChild(child:Element){this.children.push(child);}
    replaceChildren(){this.children=[];}
    addEventListener(name:string,callback:()=>void){this.listeners[name]=callback;}
  }
  const elements=new Map<string,Element>();
  const get=(id:string)=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id)!;};
  const literal='<img src=x onerror=alert(1)> 😀';let polls=0,next:()=>Promise<void>=async()=>{};const selections:any[]=[];
  const state={revision:2,compiling:false,error:null,metadata:{appId:'dev.test'},window:{width:360,height:598,density:3},inspection:{revision:2,frame:60,nodeCount:1},replay:{state:'paused',step:1,totalSteps:4,frame:1,totalFrames:3},builds:[{revision:2,outcome:'published',durationMs:900}],deviceEvents:[{revision:1,kind:'log',level:'info',message:'old',platform:'ios'},{revision:2,kind:'frame-ready',platform:'android'},{revision:2,kind:'log',level:'error',message:literal,platform:'android'}]};
  const script=devtoolsPanel.match(/<script>([\s\S]*?)<\/script>/)![1];
  runInNewContext(script,{document:{getElementById:get,createElement:()=>new Element()},fetch:async(path:string,options:any)=>{if(path==='inspection/select'){const selection=JSON.parse(options.body);selections.push(selection);return {ok:true,json:async()=>selection.nodeId===0?null:selection};}if(path==='inspection')return {ok:true,json:async()=>({revision:2,platform:'android',frame:60,tree:{nodes:[{id:1,parent:0,type:1,layout:[0,0,360,598],text:literal}]}})};polls++;return {ok:true,json:async()=>state};},setTimeout:(callback:()=>Promise<void>)=>{next=callback;},Date,JSON,Object,String,Math,Number});
  await new Promise(resolve=>setImmediate(resolve));
  expect(get('events').children.length).toBe(3);
  expect(get('inspection-tree').textContent).toContain(literal);
  expect(get('inspection-status').textContent).toBe('android · frame 60 · 1 nodes');
  expect(get('inspection-nodes').children[0].textContent).toBe('#1 '+literal);
  await get('inspection-nodes').children[0].listeners.click();
  expect(selections[0]).toEqual({revision:2,frame:60,nodeId:1});expect(get('inspection-selected').textContent).toContain(literal);
  await get('inspection-clear').listeners.click();expect(selections[1].nodeId).toBe(0);expect(get('inspection-selected').textContent).toBe('');
  expect(get('events').children[0].children[3].textContent).toBe('error: '+literal);
  get('active-only').checked=true;get('active-only').listeners.change();expect(get('events').children.length).toBe(2);
  get('filter').value='error';get('filter').listeners.change();expect(get('events').children.length).toBe(1);
  expect(get('replay-status').textContent).toContain('action 1 / 4');
  expect((get('replay-step') as any).disabled).toBe(false);
  get('updates-pause').listeners.click();await next();expect(polls).toBe(1);expect(get('updates-pause').textContent).toBe('Resume updates');
  get('updates-pause').listeners.click();await next();expect(polls).toBe(2);
  state.error='Compile failed' as any;await next();expect(get('failure').hidden).toBe(false);expect(get('failure').textContent).toBe('Compile failed');expect(get('build-state').textContent).toBe('Failed');
});
