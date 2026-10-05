import {strictJsonText} from '../sdk/json.ts';
/** Decode strict UTF-8, retaining BOM so the shared native grammar rejects it. */
export function strictJson(bytes:Uint8Array,limits:{maxTokens?:number}={}):unknown {
 return strictJsonText(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),limits);
}
