export interface BuildRecord { readonly revision:number; readonly outcome:"published"|"superseded"|"failed"|"stopped"; readonly durationMs:number; readonly finishedAt:string; readonly message?:string; readonly stages?:Readonly<Record<string,number>>; }
/** Fixed entry and message limits keep diagnostic polling bounded. */
export class BuildHistory {
  private records:BuildRecord[]=[];
  record(revision:number,outcome:BuildRecord["outcome"],durationMs:number,message?:string,stages?:Readonly<Record<string,number>>):void {
    if(!Number.isSafeInteger(revision) || revision<1 || !Number.isFinite(durationMs) || durationMs<0)throw Error("Invalid build diagnostic");
    // Error messages are diagnostic text, never markup. Bound UTF-8 without
    // cutting a multi-byte character in the middle.
    let bounded="",bytes=0;
    if(message)for(const character of message){const length=new TextEncoder().encode(character).length;if(bytes+length>2048)break;bounded+=character;bytes+=length;}
    if(stages && (Object.keys(stages).length>5 || Object.entries(stages).some(([key,value])=>!["resolveMs","typeCheckMs","prepareMs","compilerMs","packageMs"].includes(key) || !Number.isFinite(value) || value<0)))throw Error("Invalid compiler stages");
    this.records.push(Object.freeze({revision,outcome,durationMs:Math.round(durationMs),finishedAt:new Date().toISOString(),...(bounded?{message:bounded}:{}),...(stages?{stages:Object.freeze({...stages})}:{})}));
    if(this.records.length>32)this.records.shift();
  }
  snapshot():readonly BuildRecord[]{return Object.freeze([...this.records]);}
}
