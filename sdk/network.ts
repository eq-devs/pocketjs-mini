import {ServiceError} from './runtime.ts';
/** Availability of a native network path; this does not prove Internet access. */
export interface NetworkState {connected:boolean|null;type:'unknown'|'none'|'wifi'|'cellular'|'ethernet'|'other';expensive:boolean|null;}
export function checkedNetworkState(value:unknown):Readonly<NetworkState>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ServiceError('PROTOCOL','Invalid network state');
 const data=value as Record<string,unknown>;
 if(Object.keys(data).sort().join(',')!=='connected,expensive,type'||!(data.connected===null||typeof data.connected==='boolean')||!(data.expensive===null||typeof data.expensive==='boolean')||!['unknown','none','wifi','cellular','ethernet','other'].includes(data.type as string))throw new ServiceError('PROTOCOL','Invalid network state');
 if(data.connected===null?(data.type!=='unknown'||data.expensive!==null):data.connected===false?(data.type!=='none'||data.expensive!==null):(data.type==='none'||data.type==='unknown'||typeof data.expensive!=='boolean'))throw new ServiceError('PROTOCOL','Inconsistent network state');
 return Object.freeze({connected:data.connected as boolean|null,type:data.type as NetworkState['type'],expensive:data.expensive as boolean|null});
}
