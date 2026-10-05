import {test,expect} from 'bun:test';
import {strictJson} from '../container/strict-json.ts';
const parse=(value:string)=>strictJson(new TextEncoder().encode(value));
test('strict JSON rejects ambiguous and non-native envelope syntax',()=>{
 expect(parse('{"a":[1,true,null,"😀"],"nested":{"a":2}}')).toEqual({a:[1,true,null,'😀'],nested:{a:2}});
 for(const value of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"a":1,}','[1,]','01','1e999','NaN','\ufeff{}','"\\ud800"','"\\udc00"','{"a":1} extra','/*x*/{}','{"x":"\\q"}','['.repeat(34)+'0'+']'.repeat(34),'1'.repeat(129)])expect(()=>parse(value)).toThrow();
 expect(()=>strictJson(new Uint8Array([0x22,0xff,0x22]))).toThrow();
 expect(parse('"\\ud83d\\ude00"')).toBe('😀');expect(parse(' \n{}\t')).toEqual({});
});
