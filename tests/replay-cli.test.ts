import {test,expect} from 'bun:test';
import {replayArguments,saveReplayGolden} from '../bin/replay.ts';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,symlinkSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
test('replay CLI rejects ambiguous flags and preserves existing comparison artifacts',()=>{
 const args=['--package','main.pocket','--tape','tape.json','--app-id','dev.pjm.test','--version','1.0.0'];
 expect(replayArguments([...args,'--validate-only']).validate).toBe(true);
 expect(replayArguments([...args,'--timeout-ms','300000']).flags.get('--timeout-ms')).toBe('300000');
 for(const timeout of ['0','01','1.5','300001','Infinity'])expect(()=>replayArguments([...args,'--timeout-ms',timeout])).toThrow('deadline');
 for(const tail of [['--tree-frame','1'],['--tree-output','out.json'],['--tree-frame','0','--tree-output','out.json'],['--assert'],['--assert','--output'],['--app-id','dev.other.app'],['--validate-only','--validate-only'],['--validate-only','--output','out.json']])expect(()=>replayArguments([...args,...tail])).toThrow();
 const root=mkdtempSync('/private/tmp/pjm-replay-output-');try{
  const path=join(root,'golden.json');saveReplayGolden(path,Buffer.from('first'));expect(()=>saveReplayGolden(path,Buffer.from('second'))).toThrow();expect(readFileSync(path,'utf8')).toBe('first');
  const linked=join(root,'linked.json');symlinkSync(path,linked);expect(()=>saveReplayGolden(linked,Buffer.from('overwrite'))).toThrow();expect(readFileSync(path,'utf8')).toBe('first');expect(readdirSync(root).filter(name=>name.startsWith('.pjm'))).toEqual([]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('public validation-only command checks package binding without loading native code',async()=>{
 const root=mkdtempSync('/private/tmp/pjm-replay-cli-'),payload=Buffer.from('hash-only fixture'),packagePath=join(root,'main.pocket'),tapePath=join(root,'tape.json');
 try{
 writeFileSync(packagePath,payload);writeFileSync(tapePath,JSON.stringify({format:1,launchData:'{}',packageSha256:createHash('sha256').update(payload).digest('hex'),target:'pjm-ios',window:{width:1,height:1,density:1},steps:[{kind:'frame',contacts:[],hits:[],cancelled:[]}]}));
 const args=[join(import.meta.dir,'../bin/pjm'),'replay','--package',packagePath,'--tape',tapePath,'--app-id','dev.pjm.test','--version','1.0.0','--validate-only'];
 const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});expect(await child.exited).toBe(0);const result=JSON.parse(await new Response(child.stdout).text());expect(result.tapeValidated).toBe(true);expect(result.nativeAdmission).toBe(false);
 writeFileSync(packagePath,'changed');const invalid=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});expect(await invalid.exited).toBe(1);expect(await new Response(invalid.stderr).text()).toContain('does not match tape');
 const outside=join(root,'original.pocket');writeFileSync(outside,payload);rmSync(packagePath);symlinkSync(outside,packagePath);
 const redirected=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});expect(await redirected.exited).toBe(1);expect(await new Response(redirected.stderr).text()).toContain('bounded regular file');expect(readFileSync(outside)).toEqual(payload);
 }finally{rmSync(root,{recursive:true,force:true});}
});
