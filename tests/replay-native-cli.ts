import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {decodePocketPackage,encodePocketPackage} from '../examples/hello/.pjm/pocketjs/contracts/spec/pocket-package.ts';
import {decodeInspectorTree} from '../devtools/tree.ts';
import {decodeReplayGolden} from '../devtools/golden.ts';

// Requires the current release core. This exercises actual Bun FFI and guest execution.
const root=mkdtempSync(join(tmpdir(),'pjm-native-replay-'));
const text='quote" 😀\n<svg onload="literal">';
try{
 const fixture=spawnSync(process.execPath,[join(import.meta.dir,'package-load-fixtures.ts'),join(root,'cases.json')],{env:{...process.env,PJM_PACKAGE_REAL:'',PJM_PACKAGE_TARGET:'ios',PJM_PACKAGE_VISUAL:'1'},encoding:'utf8'});
 if(fixture.status!==0)throw Error(fixture.stderr);
 const item=JSON.parse(readFileSync(join(root,'cases.json'),'utf8'))[0],decoded=decodePocketPackage(Buffer.from(item.payload,'base64'));
 const section=decoded.variants[0].sections.find(section=>section.kind===3)!;
 const original=Buffer.from(section.bytes).toString().replace(/\0$/,'');
 section.bytes=Buffer.from(original+';const node=ui.createNode(1);ui.insertBefore(1,node,0);ui.setText(node,'+JSON.stringify(text)+');\0');
 const payload=Buffer.from(encodePocketPackage(decoded)),packagePath=join(root,'main.pocket'),tapePath=join(root,'tape.json');
 const frame=(contacts:number[]=[],hits:number[]=[],cancelled:number[]=[])=>({kind:'frame',contacts,hits,cancelled});
 const tape=Buffer.from(JSON.stringify({format:1,packageSha256:createHash('sha256').update(payload).digest('hex'),target:'pjm-ios',launchData:'{"source":"native-cli"}',window:{width:64,height:64,density:1},steps:[
  frame(),{kind:'completion',record:JSON.stringify({v:1,id:200,ok:true,data:'native-completion'})},frame([(3<<18)|(10<<9)|10],[1]),{kind:'lifecycle',event:'hide'},{kind:'lifecycle',event:'show'},frame([],[],[3])
 ]}));
 writeFileSync(packagePath,payload);writeFileSync(tapePath,tape);
 const base=['replay','--package',packagePath,'--tape',tapePath,'--app-id','dev.pjm.fixture','--version','1.0.0'];
 const run=(extra:string[])=>spawnSync(join(import.meta.dir,'../bin/pjm'),[...base,...extra],{encoding:'utf8',env:{...process.env,PATH:join(process.execPath,'..')+':'+process.env.PATH}});
 const golden=join(root,'golden.json'),png=join(root,'frame.png'),tree=join(root,'tree.json');
 const created=run(['--output',golden,'--png-frame','1','--png-output',png,'--tree-frame','1','--tree-output',tree]);
 if(created.status!==0)throw Error(created.stderr||created.stdout);
 const frames=decodeReplayGolden(readFileSync(golden),tape);
 if(frames.length!==3||frames[0].pixelsSha256===frames[1].pixelsSha256)throw Error('Native contact did not change the captured frame');
 const inspected=decodeInspectorTree(readFileSync(tree));
 if(!inspected.nodes.some(node=>node.text===text&&node.parent===1))throw Error('Native inspector lost literal guest text');
 const image=readFileSync(png);
 if(image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.readUInt32BE(16)!==64||image.readUInt32BE(20)!==64)throw Error('Native PNG dimensions/signature mismatch');
 const chunks:Buffer[]=[];for(let offset=8;offset<image.length;){const length=image.readUInt32BE(offset);if(image.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(image.subarray(offset+8,offset+8+length));offset+=length+12;}
 const rows=inflateSync(Buffer.concat(chunks));if(rows.length!==(64*4+1)*64||rows[4]!==255)throw Error('Native PNG pixel rows mismatch');
 const matched=run(['--assert',golden]);if(matched.status!==0||JSON.parse(matched.stdout).matched!==true)throw Error('Second native replay failed to match: '+matched.stderr);
 const changed=JSON.parse(readFileSync(golden,'utf8'));changed.frames[0].pixelsSha256='0'.repeat(64);const bad=join(root,'mismatch.json');writeFileSync(bad,JSON.stringify(changed));
 const mismatch=run(['--assert',bad]);if(mismatch.status!==1||!mismatch.stderr.includes('Replay diverged at frame 1'))throw Error('Changed-golden rejection mismatch: '+mismatch.stderr);
 console.log('Native public replay CLI passed: three deterministic frames, completion/lifecycle/input tape, PNG export, literal tree inspection and divergent-golden rejection. This is host-native software replay, not mobile hardware acceptance.');
}finally{rmSync(root,{recursive:true,force:true});}
