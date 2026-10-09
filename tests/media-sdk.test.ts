import {test,expect} from 'bun:test';
import assert from 'node:assert/strict';
import {connectMiniApp,type FrameHost} from '../sdk/native.ts';
import {checkedMediaOptions,checkedMediaImage} from '../sdk/media.ts';

test('media SDK supports library/camera and validates owned JPEG resources at frame boundaries',async()=>{
 const sent:any[]=[];let reply='';const host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcSend:line=>sent.push(JSON.parse(line)),svcPoll:()=>{const data=reply;reply='';return data;}}};const app=connectMiniApp({host});
 for(const options of [null,[],{source:null},{source:'file'},{source:undefined},{quality:24},{quality:91},{quality:null},{quality:undefined},{maxDimension:63},{maxDimension:1025},{maxDimension:1.5},{maxDimension:null},{path:'/tmp/user.jpg'}])expect(()=>app.media.select(options as any)).toThrow();expect(sent).toEqual([]);
 const work=app.media.select();expect(sent.at(-1)).toMatchObject({kind:'media.select.v1',args:{source:'library',maxDimension:1024,quality:80}});
 const image={mime:'image/jpeg',width:320,height:240,resource:{handle:'r_'+'a'.repeat(32),size:512}};let settled=false;work.promise.then(()=>{settled=true;});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data:image});await Promise.resolve();expect(settled).toBe(false);host.frame!();const result=await work.promise;expect(result).toEqual(image);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.resource)).toBe(true);
 for(const data of [{...image,width:65},{...image,height:0},{...image,mime:'image/png'},{...image,path:'/tmp/image.jpg'},{...image,resource:{...image.resource,size:1048577}},{...image,resource:{...image.resource,handle:'/tmp/image.jpg'}},{...image,resource:{...image.resource,path:'secret'}}]){const pending=app.media.select({source:'camera',maxDimension:64,quality:25}),failure=assert.rejects(pending.promise,{code:'PROTOCOL'});reply=JSON.stringify({v:1,id:sent.at(-1).id,ok:true,data});host.frame!();await failure;}
 const selection=app.media.select({source:'camera'}),cancelled=assert.rejects(selection.promise,{code:'CANCELLED'});for(let i=0;i<601;i++)host.frame!();expect(sent.at(-1).kind).toBe('media.select.v1');selection.cancel();await cancelled;expect(sent.at(-1).kind).toBe('cancel.v1');app.dispose();
});
test('media contract bounds dimensions, quality and binary resource descriptors',()=>{
 const options=checkedMediaOptions({source:'camera',maxDimension:64,quality:90});expect(checkedMediaImage({mime:'image/jpeg',width:64,height:1,resource:{handle:'r_'+'b'.repeat(32),size:1048576}},options).width).toBe(64);
 for(const data of [null,[],{}, {mime:'image/jpeg',width:1,height:1,resource:{handle:'r_'+'b'.repeat(32),size:0}}])expect(()=>checkedMediaImage(data,options)).toThrow();
});
