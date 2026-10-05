import {test,expect} from 'bun:test';
import {closeReplayResources} from '../devtools/cleanup.ts';
test('replay cleanup attempts every resource and preserves the original failure',()=>{
 const calls:string[]=[],original=Error('destroy failed');
 expect(()=>closeReplayResources([()=>{calls.push('engine');throw original;},()=>{calls.push('inspector');throw Error('second');},()=>{calls.push('library');}])).toThrow(original);
 expect(calls).toEqual(['engine','inspector','library']);
 closeReplayResources([]);
 // A thrown undefined must still propagate rather than being mistaken for success.
 let threw=false;try{closeReplayResources([()=>{throw undefined;}]);}catch{threw=true;}
 expect(threw).toBe(true);
});
