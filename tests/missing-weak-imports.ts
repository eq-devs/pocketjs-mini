// Test-only ELF fixture: make the two optional system imports unresolvable.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2];assert.ok(path);
const bytes=readFileSync(path);
assert.equal(bytes.subarray(0,4).toString('hex'),'7f454c46');
assert.equal(bytes[4],2);assert.equal(bytes[5],1);
const start=Number(bytes.readBigUInt64LE(40)),size=bytes.readUInt16LE(58),count=bytes.readUInt16LE(60);
assert.ok(size>=64&&count>0&&start+size*count<=bytes.length);
const section=(index:number)=>{assert.ok(index>=0&&index<count);return start+index*size;};
const changes=new Map([['getrandom','pjm_randx'],['gettid','pjmtid']]);
const patched=new Set<string>();
for(let index=0;index<count;index++){
 const header=section(index);if(bytes.readUInt32LE(header+4)!==11)continue;
 const strings=section(bytes.readUInt32LE(header+40));
 const stringStart=Number(bytes.readBigUInt64LE(strings+24)),stringSize=Number(bytes.readBigUInt64LE(strings+32));
 const symbols=Number(bytes.readBigUInt64LE(header+24)),length=Number(bytes.readBigUInt64LE(header+32)),entry=Number(bytes.readBigUInt64LE(header+56));
 assert.ok(entry>=24&&symbols+length<=bytes.length&&stringStart+stringSize<=bytes.length);
 for(let offset=symbols;offset<symbols+length;offset+=entry){
  const nameOffset=bytes.readUInt32LE(offset);assert.ok(nameOffset<stringSize);
  const begin=stringStart+nameOffset,end=bytes.indexOf(0,begin);assert.ok(end>=begin&&end<stringStart+stringSize);
  const name=bytes.toString('utf8',begin,end),replacement=changes.get(name);if(!replacement)continue;
  assert.equal(bytes[offset+4]>>4,2,'Only weak bindings may be changed');
  assert.equal(bytes.readUInt16LE(offset+6),0,'Only undefined imports may be changed');
  assert.equal(Buffer.byteLength(replacement),end-begin);assert.ok(!patched.has(name));
  bytes.write(replacement,begin,'utf8');patched.add(name);
 }
}
assert.deepEqual([...patched].sort(),[...changes.keys()].sort());
writeFileSync(path,bytes);
console.log('Test fixture renamed only weak undefined imports: getrandom → pjm_randx; gettid → pjmtid.');
