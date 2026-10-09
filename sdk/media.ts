import {ServiceError} from './runtime.ts';
import {checkedResourceHandle,type ResourceHandle} from './http.ts';
export interface MediaOptions {readonly source?:'library'|'camera';readonly maxDimension?:number;readonly quality?:number;}
export interface MediaImage {readonly resource:ResourceHandle;readonly mime:'image/jpeg';readonly width:number;readonly height:number;}
function invalid():never{throw new ServiceError('PROTOCOL','Invalid media service record');}
/** Native providers normalize a single image; encoded bytes stay outside JSON. */
export function checkedMediaOptions(value:MediaOptions):Required<MediaOptions>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['source','maxDimension','quality'].includes(key)))invalid();
 const source=Object.hasOwn(value,'source')?value.source:'library',maxDimension=Object.hasOwn(value,'maxDimension')?value.maxDimension:1024,quality=Object.hasOwn(value,'quality')?value.quality:80;
 if((source!=='library'&&source!=='camera')||typeof maxDimension!=='number'||!Number.isInteger(maxDimension)||maxDimension<64||maxDimension>1024||typeof quality!=='number'||!Number.isInteger(quality)||quality<25||quality>90)invalid();
 return Object.freeze({source,maxDimension,quality});
}
export function checkedMediaImage(value:unknown,options:Required<MediaOptions>):Readonly<MediaImage>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const data=value as Record<string,unknown>;
 if(Object.keys(data).sort().join(',')!=='height,mime,resource,width'||data.mime!=='image/jpeg')invalid();
 for(const field of ['width','height'])if(typeof data[field]!=='number'||!Number.isInteger(data[field])||(data[field] as number)<1||(data[field] as number)>options.maxDimension)invalid();
 const resource=data.resource as ResourceHandle;if(!resource||typeof resource!=='object'||Array.isArray(resource)||Object.keys(resource).sort().join(',')!=='handle,size'||!Number.isInteger(resource.size)||resource.size<1||resource.size>1048576)invalid();
 return Object.freeze({mime:'image/jpeg',width:data.width as number,height:data.height as number,resource:Object.freeze({handle:checkedResourceHandle(resource.handle),size:resource.size})});
}
