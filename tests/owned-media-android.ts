import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {ownedMediaPng} from './media-library-fixture.ts';

// A separate test app owns the published provider row and file. The development host is unchanged.
export async function provisionOwnedMedia(root:string,sdk:string,serial:string,name:string,evidence:string){
 assert.match(name,/^pjm-owned-[a-zA-Z0-9-]+\.png$/);
 const temp=mkdtempSync(join(tmpdir(),'pjm-owned-media-')),bundle='dev.pjm.fixture.a'+Date.now();
 const java=process.env.JAVA_HOME??'/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home';
 const tools=join(sdk,'build-tools/36.0.0'),android=join(sdk,'platforms/android-34/android.jar');
 const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];let installed=false,log='';
 async function run(args:string[],cwd?:string){const child=Bun.spawn(args,{cwd,stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),30000);try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);log+=args[0]+'\n'+out+err;assert.equal(status,0,out+err);return out.trim();}finally{clearTimeout(timer);}}
 const xmlPath='/data/local/tmp/'+bundle+'.xml';
 async function proof(label:string){const deadline=Date.now()+60000;let value='';while(Date.now()<deadline){await run(adb('shell','uiautomator','dump',xmlPath));value=await run(adb('shell','cat',xmlPath));if(value.includes('Owned media fixture FAILED'))throw Error(value);if(value.includes(label))return value;await Bun.sleep(250);}throw Error('Fixture timeout '+value);}
 async function cleanup(){try{if(installed){await run(adb('shell','am','force-stop',bundle));await run(adb('shell','am','start','-W','-n',bundle+'/dev.pjm.android.MediaLibraryFixtureActivity','--ez','cleanup','true'));writeFileSync(join(evidence,'fixture-cleaned.xml'),await proof('Owned media fixture cleaned'));}}finally{if(installed)await run(adb('uninstall',bundle)).catch(()=>{});await run(adb('shell','rm','-f',xmlPath)).catch(()=>{});writeFileSync(join(evidence,'fixture-build.log'),log);rmSync(temp,{recursive:true,force:true});}}
 try{
  for(const directory of ['assets','classes','dex'])mkdirSync(join(temp,directory));
  const image=ownedMediaPng(),sha256=createHash('sha256').update(image).digest('hex');
  writeFileSync(join(temp,'assets/owned-media.png'),image);writeFileSync(join(temp,'assets/owned-media.json'),JSON.stringify({name,sha256}));
  writeFileSync(join(temp,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="${bundle}"><uses-sdk android:minSdkVersion="23" android:targetSdkVersion="34"/><uses-permission android:name="android.permission.INTERNET"/><uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/><uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="28"/><application android:label="Owned media fixture" android:allowBackup="false" android:theme="@android:style/Theme.Material.NoActionBar"><activity android:name="dev.pjm.android.MediaLibraryFixtureActivity" android:exported="true"/></application></manifest>`);
  await run([join(tools,'aapt2'),'link','-o',join(temp,'unsigned.apk'),'-I',android,'--manifest',join(temp,'AndroidManifest.xml'),'-A',join(temp,'assets')]);
  await run([join(java,'bin/javac'),'-source','8','-target','8','-classpath',android,'-d',join(temp,'classes'),join(root,'tests/MediaLibraryFixtureActivity.java')]);
  await run([join(java,'bin/jar'),'cf',join(temp,'classes.jar'),'-C',join(temp,'classes'),'.']);
  await run([join(tools,'d8'),'--min-api','23','--lib',android,'--output',join(temp,'dex'),join(temp,'classes.jar')]);
  await run(['zip','-j',join(temp,'unsigned.apk'),join(temp,'dex/classes.dex')]);
  await run([join(tools,'zipalign'),'-f','4',join(temp,'unsigned.apk'),join(temp,'aligned.apk')]);
  await run([join(java,'bin/keytool'),'-genkeypair','-keystore',join(temp,'test.jks'),'-storepass','android','-keypass','android','-alias','test','-keyalg','RSA','-validity','1','-dname','CN=Temporary Owned Media Test']);
  await run([join(tools,'apksigner'),'sign','--ks',join(temp,'test.jks'),'--ks-pass','pass:android','--out',join(temp,'test.apk'),join(temp,'aligned.apk')]);
  await run(adb('install',join(temp,'test.apk')));installed=true;
  if(Number(await run(adb('shell','getprop','ro.build.version.sdk')))<29){for(const permission of ['READ_EXTERNAL_STORAGE','WRITE_EXTERNAL_STORAGE'])await run(adb('shell','pm','grant',bundle,'android.permission.'+permission));}
  await run(adb('shell','am','start','-W','-n',bundle+'/dev.pjm.android.MediaLibraryFixtureActivity'));
  writeFileSync(join(evidence,'fixture-ready.xml'),await proof('Owned media fixture ready '+name+' bytes='+image.length+' sha256='+sha256));
  await run(adb('shell','am','force-stop',bundle));return cleanup;
 }catch(error){await cleanup();throw error;}
}
