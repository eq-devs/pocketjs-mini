import {ServiceError} from './runtime.ts';
export interface LocationOptions {timeoutMs?:number;maximumAgeMs?:number;highAccuracy?:boolean;}
export interface LocationPosition {latitude:number;longitude:number;accuracyMeters:number;timestampMs:number;}
const fail=()=>{throw new ServiceError('PROTOCOL','Invalid location service record');};
export function checkedLocationOptions(value:LocationOptions={}):Required<LocationOptions> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['timeoutMs','maximumAgeMs','highAccuracy'].includes(key)))return fail();
 const timeoutMs=value.timeoutMs===undefined?15000:value.timeoutMs,maximumAgeMs=value.maximumAgeMs===undefined?0:value.maximumAgeMs,highAccuracy=value.highAccuracy===undefined?false:value.highAccuracy;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000||!Number.isSafeInteger(maximumAgeMs)||maximumAgeMs<0||maximumAgeMs>60000||typeof highAccuracy!=='boolean')return fail();
 return {timeoutMs,maximumAgeMs,highAccuracy};
}
export function checkedLocationPosition(value:unknown):Readonly<LocationPosition> {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='accuracyMeters,latitude,longitude,timestampMs')return fail();
 const {latitude,longitude,accuracyMeters,timestampMs}=value as LocationPosition;
 if(![latitude,longitude,accuracyMeters,timestampMs].every(item=>typeof item==='number'&&Number.isFinite(item))||latitude< -90||latitude>90||longitude< -180||longitude>180||accuracyMeters<0||accuracyMeters>10000000||!Number.isSafeInteger(timestampMs)||timestampMs<0)return fail();
 return Object.freeze({latitude,longitude,accuracyMeters,timestampMs});
}
