import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {androidSdk} from '../bin/android.ts';
import {writeInstalledAndroidProject} from '../bin/installed-android-project.ts';
import {signedNavigationFixture} from './navigation-signed-fixture.ts';

const root=resolve(import.meta.dir,'..'),serial=Bun.argv[2];
if(!serial || !/^[a-zA-Z0-9_.:-]+$/.test(serial))throw Error('Usage: bun tests/navigation-signed-android.ts <adb serial>');
const temp=mkdtempSync(join(tmpdir(),'pjm-signed-navigation-')),bundle='dev.pjm.navigation.a'+Date.now();
const evidence=resolve(process.env.PJM_NAVIGATION_EVIDENCE??join(root,'build/android-validation/signed-navigation-'+Date.now()));mkdirSync(evidence,{recursive:true});
const sdk=androidSdk(),java=process.env.JAVA_HOME??'/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home';
const ndk=join(sdk,'ndk/28.2.13676358/toolchains/llvm/prebuilt/darwin-x86_64/bin');
const adb=(...args:string[])=>[join(sdk,'platform-tools/adb'),'-s',serial,...args];
const activity='dev.pjm.android.NavigationSurfaceActivity',xmlPath='/data/local/tmp/'+temp.split('/').pop()+'.xml';
let installed=false;
let restoreConnectivity:(()=>Promise<void>)|undefined;
let networkTransitions=false;
async function run(args:string[],timeout=30000){
 const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),timeout);
 try{const [status,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);assert.equal(status,0,args[0]+': '+err+'\n'+out);return out.trim();}finally{clearTimeout(timer);}
}
async function wait<T>(read:()=>Promise<T>,accept:(value:T)=>boolean){const deadline=Date.now()+60000;let last:unknown;while(Date.now()<deadline){try{const value=await read();if(accept(value))return value;last=value;}catch(error){last=String(error);}await Bun.sleep(250);}throw Error('Signed navigation timeout: '+JSON.stringify(last));}
async function screenshot(name:string){const child=Bun.spawn(adb('exec-out','screencap','-p'),{stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill('SIGTERM'),30000);try{const [status,bytes,err]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);assert.equal(status,0,err);writeFileSync(join(evidence,name),new Uint8Array(bytes));}finally{clearTimeout(timer);}}
try{
 await wait(()=>run(adb('shell','getprop','sys.boot_completed')),value=>value==='1');
 const fixture=await signedNavigationFixture(temp,'android',360,598,3);
 const library=join(temp,'libpocketjs.so');
 await run([join(ndk,'aarch64-linux-android23-clang'),'-Wall','-Wextra','-Werror','-fPIC','-shared','-Wl,--gc-sections','-Wl,--exclude-libs,ALL','-Wl,--no-undefined','-Wl,-z,max-page-size=16384','-I',join(root,'core-ffi/include'),...['package_bridge.c','pool_bridge.c','store_bridge.c'].map(name=>join(root,'host/android',name)),join(root,'core-ffi/target/aarch64-linux-android/release/libmini_core_ffi.a'),'-lEGL','-lGLESv2','-ldl','-lm','-llog','-o',library],120000);
 const project=join(temp,'host');writeInstalledAndroidProject({directory:project,bundle,library,...fixture});
 cpSync(join(root,'tests/NavigationSurfaceActivity.java'),join(project,'src/NavigationSurfaceActivity.java'));
 const manifestPath=join(project,'AndroidManifest.xml');writeFileSync(manifestPath,readFileSync(manifestPath,'utf8').replace('android:name="dev.pjm.android.InstalledActivity"','android:name="'+activity+'"'));
 writeFileSync(join(evidence,'build.log'),await run(['bash',join(project,'build-apk.sh')],180000));
 await run([join(java,'bin/keytool'),'-genkeypair','-keystore',join(temp,'test.jks'),'-storepass','android','-keypass','android','-alias','test','-keyalg','RSA','-validity','1','-dname','CN=Temporary PocketJS Test']);
 await run([join(sdk,'build-tools/36.0.0/apksigner'),'sign','--ks',join(temp,'test.jks'),'--ks-pass','pass:android','--out',join(temp,'test.apk'),join(project,'build/Mini-unsigned.apk')]);
 await run(adb('install',join(temp,'test.apk')));installed=true;
 const open=()=>run(adb('shell','am','start','-W','-n',bundle+'/'+activity));await open();
 const xml=async()=>{await run(adb('shell','uiautomator','dump',xmlPath));return run(adb('shell','cat',xmlPath));};
 async function proof(path:string,count:number,name:string){const value=await wait(xml,value=>value.includes('package="'+bundle+'"') && value.includes('navigation path='+path+' count='+count+' item='+(path==='/detail'?'42':'null')) && / network=(none|wifi|cellular|ethernet|other) events=/.test(value));writeFileSync(join(evidence,name+'.xml'),value);return value;}
 const mediaUi=process.env.PJM_MEDIA_UI_CASE;
 async function tapConsent(value:string,allow:boolean){const id=allow?'android:id/button1':'android:id/button2';const node=[...value.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(node=>node.includes('resource-id="'+id+'"'));assert.ok(node,'Missing native consent '+id);const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(bounds);const [left,top,right,bottom]=bounds.slice(1).map(Number);await run(adb('shell','input','tap',String(Math.round((left+right)/2)),String(Math.round((top+bottom)/2))));}
 async function mediaBeforeNavigation(cold=false){if(!mediaUi)return;
  if(!cold){const consent=await wait(xml,value=>value.includes('text="Image access"'));writeFileSync(join(evidence,'media-consent.xml'),consent);await tapConsent(consent,mediaUi!=='deny');}
  if(mediaUi==='cancel'){const picker=await wait(xml,value=>value.includes('package="com.google.android.documentsui"')||value.includes('package="com.android.documentsui"'));writeFileSync(join(evidence,cold?'media-cold-picker.xml':'media-picker.xml'),picker);await run(adb('shell','input','keyevent','KEYCODE_BACK'));}
  const expected=mediaUi==='deny'?'DENIED':'CANCELLED';const result=await wait(xml,value=>value.includes('package="'+bundle+'"')&&value.includes(' media='+expected));writeFileSync(join(evidence,cold?'media-cold-result.xml':'media-result.xml'),result);
 }
 await mediaBeforeNavigation();
 const home=await proof('/',0,'home');await screenshot('home.png');
 if(process.env.PJM_NETWORK_TOGGLE==='1'){
  assert.ok(serial.startsWith('emulator-'),'Connectivity toggles require a disposable emulator');
  const wifi=await run(adb('shell','settings','get','global','wifi_on')),data=await run(adb('shell','settings','get','global','mobile_data'));
  assert.ok(['0','1'].includes(wifi)&&['0','1'].includes(data),'Cannot safely restore emulator connectivity');
  restoreConnectivity=async()=>{await run(adb('shell','svc','wifi',wifi==='1'?'enable':'disable'));await run(adb('shell','svc','data',data==='1'?'enable':'disable'));};
  assert.match(home,/ network=(wifi|cellular|ethernet|other) events=/,'Transition acceptance requires an initially connected emulator');
  const initial=Number(home.match(/ network=\w+ events=(\d+)/)?.[1]);assert.ok(Number.isInteger(initial));
  await run(adb('shell','svc','wifi','disable'));await run(adb('shell','svc','data','disable'));
  const offline=await wait(xml,value=>value.includes('package="'+bundle+'"')&&/ network=none events=/.test(value));writeFileSync(join(evidence,'network-offline.xml'),offline);
  assert.ok(Number(offline.match(/ network=none events=(\d+)/)?.[1])>initial,'Offline SDK event did not reach storage');
  await restoreConnectivity();
  const online=await wait(xml,value=>value.includes('package="'+bundle+'"')&&/ network=(wifi|cellular|ethernet|other) events=/.test(value));writeFileSync(join(evidence,'network-restored.xml'),online);
  assert.ok(Number(online.match(/ network=\w+ events=(\d+)/)?.[1])>Number(offline.match(/ network=none events=(\d+)/)?.[1]),'Restored SDK event did not reach storage');
  networkTransitions=true;
 }
 const surface=[...home.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(node=>node.includes('package="'+bundle+'"') && node.includes('content-desc="signed='+fixture.metadata.appId+' version='+fixture.metadata.version+' frames='));assert.ok(surface,'Missing authenticated surface');
 const bounds=surface.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(bounds);const [left,top,right,bottom]=bounds.slice(1).map(Number);
 const {width,height}=fixture.points,scale=Math.min((right-left)/width,(bottom-top)/height),x0=left+((right-left)-width*scale)/2,y0=top+((bottom-top)-height*scale)/2;
 const tap=(point:number[])=>run(adb('shell','input','tap',String(Math.round(x0+point[0]*scale)),String(Math.round(y0+point[1]*scale))));
 await tap(fixture.points.increment);await proof('/',1,'incremented-home');
 await tap(fixture.points.detail);await proof('/detail',1,'detail');await screenshot('detail.png');
 await tap(fixture.points.back);await proof('/',1,'button-home');
 await tap(fixture.points.detail);await proof('/detail',1,'detail-again');
 await run(adb('shell','input','keyevent','KEYCODE_HOME'));await open();await proof('/detail',1,'resumed-detail');
 await run(adb('shell','input','keyevent','KEYCODE_BACK'));await proof('/',1,'back-home');await screenshot('back-home.png');
 await run(adb('shell','input','keyevent','KEYCODE_BACK'));writeFileSync(join(evidence,'back-exit.xml'),await wait(xml,value=>!value.includes('package="'+bundle+'"')));
 await open();await mediaBeforeNavigation(true);await proof('/',0,'cold-home');await screenshot('cold-home.png');
 for(const name of ['main.pocket','manifest.json','publisher.key','input-points.json'])cpSync(join(temp,name),join(evidence,name));
 writeFileSync(join(evidence,'result.json'),JSON.stringify({signedPackage:true,developmentUrlUsed:false,productionInstalledHost:true,testOnlyStorageObserver:true,realTsx:true,nativeNetworkSnapshot:true,networkTransitions,mediaUiCase:mediaUi??null,buttonNavigation:true,queryRetained:true,counterRetained:true,backgroundResume:true,systemBack:true,rootExit:true,coldReset:true,physicalAcceptance:false},null,2));
 console.log('Signed Android TSX navigation passed through the installed host: authenticated offline package, route/query/counter state, background/resume, system Back, root exit and cold reset.');
}finally{if(restoreConnectivity)await restoreConnectivity();if(installed)await run(adb('uninstall',bundle)).catch(()=>{});await run(adb('shell','rm','-f',xmlPath)).catch(()=>{});rmSync(temp,{recursive:true,force:true});}
