export interface DeviceEvent {readonly revision:number;readonly platform:"android"|"ios";readonly kind:"frame-ready"|"log";readonly receivedAt:string;readonly level?:"debug"|"info"|"warn"|"error";readonly message?:string;}
export class DeviceEvents {
  private events:Readonly<DeviceEvent>[]=[];
  accept(value:unknown,active:number):void {
    if(!value || typeof value!=="object" || Array.isArray(value))throw Error("Invalid device event");const data=value as Record<string,unknown>;
    const log=data.kind==="log",keys=log?["revision","platform","kind","level","message"]:["revision","platform","kind"];
    if(Object.keys(data).length!==keys.length || Object.keys(data).some(key=>!keys.includes(key)) || !Number.isSafeInteger(data.revision) || (data.revision as number)<1 || (data.revision as number)>active || !["ios","android"].includes(data.platform as string) || !["frame-ready","log"].includes(data.kind as string))throw Error("Invalid device event");
    if(log && (!["debug","info","warn","error"].includes(data.level as string) || typeof data.message!=="string" || new TextEncoder().encode(data.message).length>2048))throw Error("Invalid device log");
    this.events.push(Object.freeze({revision:data.revision as number,platform:data.platform as "ios"|"android",kind:data.kind as DeviceEvent["kind"],receivedAt:new Date().toISOString(),...(log?{level:data.level as DeviceEvent["level"],message:data.message as string}:{})}));if(this.events.length>32)this.events.shift();
  }
  snapshot(){return Object.freeze([...this.events]);}
}
export async function boundedEvent(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw Error("Missing event body");const parts:Uint8Array[]=[];let count=0;
 try{for(;;){const next=await reader.read();if(next.done)break;count+=next.value.length;if(count>4096)throw Error("Device event exceeds limit");parts.push(next.value);}const bytes=new Uint8Array(count);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}finally{await reader.cancel();reader.releaseLock();}
}
