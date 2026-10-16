import {test,expect} from 'bun:test';
import {connectMiniApp,type FrameHost} from '../sdk/native.ts';
import {FrameRuntime} from '../sdk/runtime.ts';
import {MiniUI,type UISnapshot} from '../sdk/ui.ts';
function fixture(){const sent:string[]=[],host:FrameHost={frame(){},ui:{svcOpen:()=>true,svcPoll:()=>'',svcSend:(line:string)=>sent.push(line)}};const mini=connectMiniApp({host,pages:['/','/detail']});let snapshot:UISnapshot={};const detach=mini.ui.attach(value=>{snapshot=value;});return {mini,host,sent,detach,get snapshot(){return snapshot;}};}
test('dialog results, modal admission, stale buttons and action-sheet selections are guest local',async()=>{
 const f=fixture();const first=f.mini.ui.dialog({title:'Save?',message:'Keep changes'}),state=f.snapshot.modal!;
 expect(()=>f.mini.ui.actionSheet({items:['One']})).toThrow(expect.objectContaining({code:'BUSY'}));
 f.mini.ui.respond(state,1);expect(await first.promise).toEqual({confirmed:true});
 const sheet=f.mini.ui.actionSheet({items:['One','Two']});
 f.mini.ui.respond(state,0);expect(f.snapshot.modal?.kind).toBe('actionSheet');
 expect(()=>f.mini.ui.respond(f.snapshot.modal!,2)).toThrow(expect.objectContaining({code:'PROTOCOL'}));
 f.mini.ui.respond(f.snapshot.modal!,1);expect(await sheet.promise).toEqual({index:1});
 const cancelled=f.mini.ui.dialog({title:'Cancel?'});f.mini.ui.respond(f.snapshot.modal!,0);expect(await cancelled.promise).toEqual({confirmed:false});
 expect(f.sent).toEqual([]);f.mini.dispose();
});
test('toast timing follows frames and coexists with one modal',async()=>{
 const f=fixture();const toast=f.mini.ui.toast({text:'Saved',durationFrames:2});let done=false;void toast.promise.then(()=>{done=true;});
 const modal=f.mini.ui.dialog({title:'Hello'});expect(()=>f.mini.ui.toast({text:'Other'})).toThrow(expect.objectContaining({code:'BUSY'}));
 f.host.frame();await Promise.resolve();expect(done).toBe(false);expect(f.snapshot.toast?.text).toBe('Saved');
 f.host.frame();await toast.promise;expect(f.snapshot.toast).toBeUndefined();expect(f.snapshot.modal?.title).toBe('Hello');
 const rejected=modal.promise.catch(error=>error);modal.cancel();expect(await rejected).toMatchObject({code:'CANCELLED'});f.mini.dispose();
});
test('Back dismisses overlays before navigation and hide, unload and disposal settle work',async()=>{
 const f=fixture();f.mini.navigation.push('/detail');
 const sheet=f.mini.ui.actionSheet({items:['One']});const cancelled=sheet.promise.catch(error=>error);
 expect(f.host.__miniBack?.()).toBe(true);expect(await cancelled).toMatchObject({code:'CANCELLED'});expect(f.mini.navigation.current.path).toBe('/detail');
 expect(f.host.__miniBack?.()).toBe(true);expect(f.mini.navigation.current.path).toBe('/');
 const toast=f.mini.ui.toast({text:'Hidden'}),dialog=f.mini.ui.dialog({title:'Hidden'});
 const one=toast.promise.catch(error=>error),two=dialog.promise.catch(error=>error);
 f.host.__miniLifecycle?.('hide');for(const error of await Promise.all([one,two]))expect(error).toMatchObject({code:'CANCELLED'});expect(f.snapshot).toEqual({modal:undefined,toast:undefined});
 const last=f.mini.ui.dialog({title:'Unload'});const closed=last.promise.catch(error=>error);
 f.host.__miniLifecycle?.('unload');expect(await closed).toMatchObject({code:'CLOSED'});expect(()=>f.mini.ui.toast({text:'Late'})).toThrow(expect.objectContaining({code:'CLOSED'}));f.mini.dispose();
});
test('renderer ownership and detach cancel visible work without retaining old timers',async()=>{
 const mini=connectMiniApp({host:{frame(){}}});expect(()=>mini.ui.toast({text:'No renderer'})).toThrow(expect.objectContaining({code:'UNSUPPORTED'}));
 const detach=mini.ui.attach(()=>{});expect(()=>mini.ui.attach(()=>{})).toThrow(expect.objectContaining({code:'BUSY'}));
 const toast=mini.ui.toast({text:'Detached',durationFrames:1}),rejected=toast.promise.catch(error=>error);detach();detach();expect(await rejected).toMatchObject({code:'CANCELLED'});
 const detachNext=mini.ui.attach(()=>{});const next=mini.ui.toast({text:'Next',durationFrames:2});mini.runtime.beginFrame();mini.runtime.beginFrame();await next.promise;detachNext();mini.dispose();
});
test('text, action count, sparse arrays and durations are bounded before admission',()=>{
 const f=fixture();for(const options of [{text:''},{text:'x'.repeat(513)},{text:'\ud800'},{text:'a',durationFrames:0},{text:'a',durationFrames:3601},{text:'a',extra:true}])expect(()=>f.mini.ui.toast(options)).toThrow(expect.objectContaining({code:'PROTOCOL'}));
 for(const items of [[],Array(2),Array(9).fill('a'),['x'.repeat(129)]])expect(()=>f.mini.ui.actionSheet({items})).toThrow(expect.objectContaining({code:'PROTOCOL'}));
 expect(()=>f.mini.ui.dialog({title:'x',showCancel:'bad' as any})).toThrow(expect.objectContaining({code:'PROTOCOL'}));
 expect(f.snapshot.modal).toBeUndefined();expect(f.snapshot.toast).toBeUndefined();f.mini.dispose();
});
test('toast timer admission respects shared frame runtime limits',async()=>{
 const runtime=new FrameRuntime({send(){}},{maxTimers:1}),ui=new MiniUI(runtime);let state:UISnapshot={};ui.attach(value=>{state=value;});
 const stop=runtime.after(1,()=>{});expect(()=>ui.toast({text:'Busy'})).toThrow(expect.objectContaining({code:'BUSY'}));expect(state.toast).toBeUndefined();stop();
 const next=ui.toast({text:'Ready',durationFrames:1});runtime.beginFrame();await next.promise;ui.dispose();runtime.dispose();
});


test('UI wrapping preserves scalars and blank lines without exceeding measured width',async()=>{
 const {wrapUI}=await import('../sdk/ui-layout.ts');const measure=(text:string)=>Array.from(text).length*8;
 const source='Long unbrokenword0123456789 😀\n\nLast line';const rows=wrapUI(source,40,measure);
 expect(rows.every(row=>measure(row)<=40)).toBe(true);expect(rows.join('')).toBe(source.replaceAll('\n',''));expect(rows).toContain('');
 expect(wrapUI('A\r\nB\rC',40,measure)).toEqual(['A','B','C']);
});
