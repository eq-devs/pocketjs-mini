/** Validate JSON text without host-only APIs before parsing loses duplicate keys. */
export function strictJsonEncode(value:unknown):string {
  const source=JSON.stringify(value,(_key,item)=>{
    if(item===undefined||typeof item==='function'||typeof item==='symbol'||typeof item==='bigint'||(typeof item==='number'&&!Number.isFinite(item)))throw Error('Non-JSON value');
    return item;
  });
  strictJsonText(source,{maxTokens:8192});return source;
}
export function strictJsonText(source:string,limits:{maxTokens?:number}={}):unknown {
  const maxTokens=limits.maxTokens??262144;if(!Number.isSafeInteger(maxTokens)||maxTokens<1||maxTokens>2500000)throw Error("Invalid JSON token budget");
  if(typeof source!=='string')throw Error('Invalid strict JSON input');let offset=0,tokens=0;
  const fail=()=>{throw Error('Invalid strict JSON input');};
  const token=()=>{if(++tokens>maxTokens)fail();};
  const space=()=>{while(/[\x20\x09\x0a\x0d]/.test(source[offset]??'') && offset<source.length)offset++;};
  function string():string {
    token();const start=offset;if(source[offset++]!=='"')return fail();
    while(offset<source.length){const character=source[offset++];if(character==='"'){
      const value=JSON.parse(source.slice(start,offset));
      for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800 && code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))fail();}else if(code>=0xdc00 && code<=0xdfff)fail();}
      return value;
    }if(character==='\\'){if(offset>=source.length)fail();offset++;}else if(character.charCodeAt(0)<32)fail();}
    return fail();
  }
  function value(depth:number):void {
    if(depth>32)fail();space();const character=source[offset];
    if(character==='"'){string();return;}token();
    if(character==='{' || character==='['){const object=character==='{',end=object?'}':']',keys=new Set<string>();offset++;space();if(source[offset]===end){offset++;return;}
      for(;;){space();if(object){const key=string();if(keys.has(key))fail();keys.add(key);space();if(source[offset++]!==':')fail();}value(depth+1);space();if(source[offset]===end){offset++;return;}if(source[offset++]!==',')fail();}
    }
    for(const literal of ['true','false','null'])if(source.startsWith(literal,offset)){offset+=literal.length;return;}
    const number=source.slice(offset).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);if(!number || number[0].length>128 || !Number.isFinite(Number(number[0])))fail();offset+=number![0].length;
  }
  value(0);space();if(offset!==source.length)fail();return JSON.parse(source);
}
