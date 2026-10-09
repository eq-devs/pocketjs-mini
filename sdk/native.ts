import { FrameRuntime, ServiceError, utf8Bytes, type Limits } from "./runtime.ts";
import { Navigation, checkedPageQuery } from "./navigation.ts";
import {strictJsonEncode,strictJsonText} from './json.ts';
import {checkedLocationOptions,checkedLocationPosition,type LocationOptions} from './location.ts';
import {checkedNetworkState,type NetworkState} from './network.ts';
import {checkedMediaOptions,checkedMediaImage,type MediaOptions} from './media.ts';
import { checkedHttpRequest, checkedHttpResponse, checkedResourceRead, checkedResourceChunk, checkedResourceHandle, type ResourceRead, type HttpRequest } from "./http.ts";

export interface NativeMailbox {
  svcOpen?(namespace: string): boolean;
  svcSend?(line: string): void;
  svcPoll?(): string | undefined;
}
export type LifecycleEvent = "launch" | "show" | "hide" | "unload" | "memoryWarning";
export interface LaunchOptions { source: string; path: string; query: Readonly<Record<string,string>>; }
export interface FrameHost { frame?: (...args: any[]) => unknown; ui?: NativeMailbox; __miniLifecycle?: (event: LifecycleEvent, data?: unknown) => void; __miniBack?: () => boolean; }
export interface DeviceInfo {
  platform: "ios" | "android"; model: string; width: number; height: number; density: number;
  safeTop: number; safeBottom: number; safeLeft: number; safeRight: number;
}
function checkedClipboardText(value:unknown):string {
  if(typeof value!=='string'||utf8Bytes(value)>2048||utf8Bytes(JSON.stringify(value))>3072)throw new ServiceError('PROTOCOL','Clipboard text exceeds record limit');
  for(let index=0;index<value.length;index++){
    const code=value.charCodeAt(index);
    if(code>=0xd800&&code<=0xdbff){const low=value.charCodeAt(++index);if(!(low>=0xdc00&&low<=0xdfff))throw new ServiceError('PROTOCOL','Invalid clipboard Unicode');}
    else if(code>=0xdc00&&code<=0xdfff)throw new ServiceError('PROTOCOL','Invalid clipboard Unicode');
  }
  return value;
}
function checkedStorageKey(key:string):string {
  if(typeof key!=='string'||!key.length||utf8Bytes(key)>128)throw new ServiceError('PROTOCOL','Storage key exceeds limit');
  try{strictJsonEncode(key);}catch{throw new ServiceError('PROTOCOL','Invalid storage key');}return key;
}
function checkedStorageValue(value:unknown):unknown {
  try{const encoded=strictJsonEncode(value);if(utf8Bytes(encoded)>2048)throw Error('Value limit');return strictJsonText(encoded);}
  catch{throw new ServiceError('PROTOCOL','Invalid storage value or value exceeds limit');}
}
function checkedDeviceInfo(value: unknown): DeviceInfo {
  if(!value || typeof value!=="object" || Array.isArray(value))throw new ServiceError("PROTOCOL","Invalid native device info");
  const data=value as Record<string,unknown>;
  if((data.platform!=="ios" && data.platform!=="android") || typeof data.model!=="string" || utf8Bytes(data.model)>256)throw new ServiceError("PROTOCOL","Invalid native device identity");
  for(const key of ["width","height","density"]){const number=data[key];if(typeof number!=="number" || !Number.isInteger(number) || number<1 || number>(key==="density"?4:1024))throw new ServiceError("PROTOCOL","Invalid native device viewport");}
  if((data.width as number)*(data.height as number)*(data.density as number)**2*4>16*1024*1024)throw new ServiceError("PROTOCOL","Native device viewport exceeds surface limit");
  for(const key of ["safeTop","safeBottom","safeLeft","safeRight"]){const number=data[key];if(typeof number!=="number" || !Number.isFinite(number) || number<0)throw new ServiceError("PROTOCOL","Invalid native safe area");}
  if((data.safeTop as number)+(data.safeBottom as number)>(data.height as number) || (data.safeLeft as number)+(data.safeRight as number)>(data.width as number))throw new ServiceError("PROTOCOL","Native safe area exceeds viewport");
  return Object.freeze({platform:data.platform,model:data.model,width:data.width as number,height:data.height as number,density:data.density as number,safeTop:data.safeTop as number,safeBottom:data.safeBottom as number,safeLeft:data.safeLeft as number,safeRight:data.safeRight as number});
}
const owners = new WeakSet<object>();
const identifiers = new WeakMap<object,{ next: number }>();
type Anchor = { frame: (...args:any[])=>unknown; pump?: ()=>void };
const anchors = new WeakMap<object,Anchor>();
type GuestState = { navigation: Navigation; pages: readonly string[]; entry: string; launch?: LaunchOptions };
const guestStates = new WeakMap<object,GuestState>();
/** Call after mount(). One guest shares one navigation stack and frame pump.
 * Native completion delivery always precedes this frame's framework handler.
 */
export function connectMiniApp(options: { host?: FrameHost; pages?: readonly string[]; entry?: string; limits?: Partial<Limits> } = {}) {
  const host = options.host ?? globalThis as unknown as FrameHost;
  if (typeof host.frame !== "function") throw new ServiceError("PROTOCOL", "Mount the application before connecting its SDK frame pump");
  if (owners.has(host)) throw new ServiceError("BUSY", "This guest already has an SDK frame pump");
  const existingAnchor = anchors.get(host);
  if(existingAnchor && host.frame!==existingAnchor.frame)throw new ServiceError("PROTOCOL","The guest frame handler changed; restart the guest before reconnecting its SDK");
  const normalFrame = host.frame, ops = host.ui;
  let mailbox = false;
  const sequence = identifiers.get(host) ?? { next: 1 };
  identifiers.set(host,sequence);
  const retainedState=guestStates.get(host);
  const pages=Object.freeze([...(options.pages ?? retainedState?.pages ?? ["/"])]);
  const entry=options.entry ?? retainedState?.entry ?? "/";
  if(retainedState && (entry!==retainedState.entry || JSON.stringify([...new Set(pages)].sort())!==JSON.stringify([...new Set(retainedState.pages)].sort())))throw new ServiceError("PROTOCOL","Page configuration changed; restart the guest");
  const state:GuestState=retainedState ?? {navigation:new Navigation(pages,entry),pages,entry};
  const navigation=state.navigation;
  const runtime = new FrameRuntime({ send(line) {
    if (!ops?.svcSend || !ops.svcPoll || !ops.svcOpen?.("mini")) throw new ServiceError("UNSUPPORTED", "Native mini services are unavailable on this host");
    mailbox = true;
    ops.svcSend(line);
  } }, { maxMessageBytes: 4096, maxPending: 32, maxQueued: 32, ...options.limits }, () => sequence.next++);
  if (runtime.limits.maxMessageBytes > 4096 || runtime.limits.maxPending > 32 || runtime.limits.maxQueued > 32 || runtime.limits.maxTimers>256 || runtime.limits.maxListeners>256) throw new ServiceError("PROTOCOL", "SDK limits exceed the native mailbox contract");
  let closed = false;
  const previousBack = host.__miniBack;
  const back = () => !closed && navigation.back();
  host.__miniBack = back;
  const lifecycleListeners = new Map<LifecycleEvent, Set<(data: LaunchOptions | undefined) => void>>();
  let launchOptions: LaunchOptions | undefined=state.launch;
  const previousLifecycle = host.__miniLifecycle;
  const lifecycle = (event: LifecycleEvent, data?: unknown) => {
    if(closed)return;
    if(event==="launch") {
      if(state.launch)throw new ServiceError("PROTOCOL","Guest was already launched");
      const value=data as Partial<LaunchOptions> | undefined;
      const source=value?.source ?? "unknown",path=value?.path ?? navigation.current.path,query=value?.query ?? {};
      if(typeof source!=="string" || source.length>128 || typeof path!=="string" || !path.startsWith("/") || path.length>1024
        || !query || typeof query!=="object" || Array.isArray(query) || Object.keys(query).length>32
        || Object.entries(query).some(([key,value])=>key.length>128 || typeof value!=="string" || value.length>1024))throw new ServiceError("PROTOCOL","Invalid launch parameters");
      const snapshot=Object.freeze({source,path,query:Object.freeze({...query})});
      if(utf8Bytes(JSON.stringify(snapshot))>4096)throw new ServiceError("PROTOCOL","Launch parameters exceed byte limit");
      // Validation happens before either launch metadata or the route changes.
      if(!state.pages.includes(path))throw new ServiceError("PROTOCOL","Undeclared launch page");
      checkedPageQuery(path, query);
      launchOptions=snapshot;
      state.launch=snapshot;
      navigation.reset(path,{...snapshot.query});
    }
    previousLifecycle?.call(host,event,data);
    for(const listener of [...(lifecycleListeners.get(event) ?? [])]){if(closed)break;listener(event==="launch"?launchOptions:undefined);}
  };
  host.__miniLifecycle=lifecycle;
  const pump = () => {
    if (!closed) {
      const lines = mailbox ? ops?.svcPoll?.() ?? "" : "";
      const maximum=32*(4096+1);
      if(typeof lines!=='string'||lines.length>maximum||utf8Bytes(lines)>maximum)throw new ServiceError('PROTOCOL','Native completion batch exceeds byte limit');
      const records=lines.split('\n').filter(Boolean);
      if(records.length>runtime.limits.maxQueued)throw new ServiceError('BUSY','Native completion batch exceeds record limit');
      runtime.enqueueBatch(records);
      runtime.beginFrame();
    }
  };
  // Native adapters cache this function at boot. Keep its identity stable
  // across SDK disposal/reconnection, while replacing only its active pump.
  const anchor: Anchor = existingAnchor ?? { frame: (...args:any[]) => {anchor.pump?.();return normalFrame.apply(host,args);} };
  owners.add(host);anchor.pump=pump;anchors.set(host,anchor);host.frame=anchor.frame;
  guestStates.set(host,state);
  return {
    runtime, navigation,
    http: (options: HttpRequest) => {const args=checkedHttpRequest(options),request=runtime.request<unknown>("request.v1",args);return {promise:request.promise.then(value=>checkedHttpResponse(value,args.responseMode)),cancel:request.cancel};},
    resources: {
      read: (options: ResourceRead) => {const args=checkedResourceRead(options),request=runtime.request<unknown>("resource.read.v1",args);return {promise:request.promise.then(value=>checkedResourceChunk(value,args)),cancel:request.cancel};},
      release: (handle: string) => {const request=runtime.request<unknown>("resource.release.v1",{handle:checkedResourceHandle(handle)});return {promise:request.promise.then(value=>{if(value!==null)throw new ServiceError("PROTOCOL","Invalid resource release reply");return null;}),cancel:request.cancel};},
    },
    deviceInfo: () => {const request=runtime.request<unknown>("device.info.v1");return {promise:request.promise.then(checkedDeviceInfo),cancel:request.cancel};},
    network: {
      get: () => {const work=runtime.request<unknown>('device.network.v1');return {promise:work.promise.then(checkedNetworkState),cancel:work.cancel};},
      watch: (listener:(state:Readonly<NetworkState>)=>void) => {
        if(typeof listener!=='function')throw new ServiceError('PROTOCOL','Invalid network listener');
        const unsubscribe=runtime.on('device.network.v1',value=>listener(checkedNetworkState(value)));
        try{const work=runtime.request<unknown>('device.network.v1');let cancelled=false;return {promise:work.promise.then(checkedNetworkState).catch(error=>{unsubscribe();throw error;}),cancel:()=>{if(cancelled)return;cancelled=true;unsubscribe();work.cancel();}};}
        catch(error){unsubscribe();throw error;}
      },
    },
    location: {get:(options:LocationOptions={})=>{const work=runtime.request<unknown>('location.get.v1',checkedLocationOptions(options));return {promise:work.promise.then(checkedLocationPosition),cancel:work.cancel};}},
    media: {select:(options:MediaOptions={})=>{const args=checkedMediaOptions(options),work=runtime.request<unknown>('media.select.v1',args,7200);return {promise:work.promise.then(value=>checkedMediaImage(value,args)),cancel:work.cancel};}},
    clipboard: {
      read:()=>{const request=runtime.request<unknown>('clipboard.read.v1');return {promise:request.promise.then(value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).join(',')!=='text')throw new ServiceError('PROTOCOL','Invalid clipboard reply');return checkedClipboardText((value as {text:unknown}).text);}),cancel:request.cancel};},
      write:(text:string)=>{const request=runtime.request<unknown>('clipboard.write.v1',{text:checkedClipboardText(text)});return {promise:request.promise.then(value=>{if(value!==null)throw new ServiceError('PROTOCOL','Invalid clipboard write reply');return null;}),cancel:request.cancel};},
    },
    storage: {
      get: <T = unknown>(key: string) => {const work=runtime.request<unknown>('storage.get.v1',{key:checkedStorageKey(key)});return {promise:work.promise.then(value=>checkedStorageValue(value) as T|null),cancel:work.cancel};},
      set: (key: string, value: unknown) => {const work=runtime.request<unknown>('storage.set.v1',{key:checkedStorageKey(key),value:checkedStorageValue(value)});return {promise:work.promise.then(value=>{if(value!==null)throw new ServiceError('PROTOCOL','Invalid storage acknowledgement');return null;}),cancel:work.cancel};},
      remove: (key: string) => {const work=runtime.request<unknown>('storage.remove.v1',{key:checkedStorageKey(key)});return {promise:work.promise.then(value=>{if(value!==null)throw new ServiceError('PROTOCOL','Invalid storage acknowledgement');return null;}),cancel:work.cancel};},
    },
    request: runtime.request.bind(runtime),
    after: runtime.after.bind(runtime),
    on: runtime.on.bind(runtime),
    get launchOptions() { return launchOptions; },
    onLifecycle(event: LifecycleEvent, listener: (data: LaunchOptions | undefined) => void) {
      if(closed)throw new ServiceError("CLOSED","Runtime destroyed");
      if(!["launch","show","hide","unload","memoryWarning"].includes(event)||typeof listener!=='function')throw new ServiceError("PROTOCOL","Invalid lifecycle event or listener");
      const listeners=lifecycleListeners.get(event) ?? new Set<(data: LaunchOptions | undefined) => void>();
      if(!listeners.has(listener)){let count=0;for(const registered of lifecycleListeners.values())count+=registered.size;if(count>=runtime.limits.maxListeners)throw new ServiceError('BUSY','Too many lifecycle listeners');}
      lifecycleListeners.set(event,listeners);listeners.add(listener);
      return ()=>{listeners.delete(listener);if(!listeners.size && lifecycleListeners.get(event)===listeners)lifecycleListeners.delete(event);};
    },
    dispose() {
      if (closed) return;
      closed = true;runtime.dispose();owners.delete(host);
      lifecycleListeners.clear();if(host.__miniLifecycle===lifecycle)host.__miniLifecycle=previousLifecycle;
      if(host.__miniBack===back)host.__miniBack=previousBack;
      if(anchor.pump===pump)anchor.pump=undefined;
    },
  };
}
