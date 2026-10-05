/** Development-only notifications use the existing bounded guest effect mailbox. */
export const developmentConsole=`(()=>{
const ops=globalThis.ui,output=globalThis.console;if(!ops || !output)return;
for(const [name,level] of [['log','info'],['info','info'],['debug','debug'],['warn','warn'],['error','error']]){
 const original=output[name];if(typeof original!=='function')continue;
 output[name]=(...args)=>{
   original.apply(output,args);
   try{
     let message='',bytes=0;
     for(const argument of args){const text=(message?' ':'')+String(argument);for(const character of text){const point=character.codePointAt(0),size=point<128?1:point<2048?2:point<65536?3:4;if(bytes+size>512)break;message+=character;bytes+=size;}if(bytes>=512)break;}
     if(ops.svcOpen?.('mini'))ops.svcSend(JSON.stringify({v:1,kind:'debug.log.v1',args:{level,message}}));
   }catch{}
 };
}
})();\n`;
