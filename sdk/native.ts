import { FrameRuntime, ServiceError, utf8Bytes, type Limits } from "./runtime.ts";
import { Navigation } from "./navigation.ts";

export interface NativeMailbox {
  svcOpen?(namespace: string): boolean;
  svcSend?(line: string): void;
  svcPoll?(): string | undefined;
}
export type LifecycleEvent = "launch" | "show" | "hide" | "unload" | "memoryWarning";
export interface LaunchOptions { source: string; path: string; query: Readonly<Record<string,string>>; }
export interface FrameHost { frame?: (...args: any[]) => unknown; ui?: NativeMailbox; __miniLifecycle?: (event: LifecycleEvent, data?: unknown) => void; }
export interface DeviceInfo {
  platform: "ios" | "android"; model: string; width: number; height: number; density: number;
  safeTop: number; safeBottom: number; safeLeft: number; safeRight: number;
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
  if (runtime.limits.maxMessageBytes > 4096 || runtime.limits.maxPending > 32) throw new ServiceError("PROTOCOL", "SDK limits exceed the native mailbox contract");
  let closed = false;
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
      launchOptions=snapshot;
      state.launch=snapshot;
      navigation.reset(path,{...snapshot.query});
    }
    previousLifecycle?.call(host,event,data);
    for(const listener of [...(lifecycleListeners.get(event) ?? [])])listener(event==="launch"?launchOptions:undefined);
  };
  host.__miniLifecycle=lifecycle;
  const pump = () => {
    if (!closed) {
      const lines = mailbox ? ops?.svcPoll?.() ?? "" : "";
      for (const line of lines.split("\n")) if (line) runtime.enqueue(line);
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
    deviceInfo: () => runtime.request<DeviceInfo>("device.info.v1"),
    storage: {
      get: <T = unknown>(key: string) => runtime.request<T | null>("storage.get.v1", { key }),
      set: (key: string, value: unknown) => runtime.request<null>("storage.set.v1", { key, value }),
      remove: (key: string) => runtime.request<null>("storage.remove.v1", { key }),
    },
    request: runtime.request.bind(runtime),
    after: runtime.after.bind(runtime),
    on: runtime.on.bind(runtime),
    get launchOptions() { return launchOptions; },
    onLifecycle(event: LifecycleEvent, listener: (data: LaunchOptions | undefined) => void) {
      if(closed)throw new ServiceError("CLOSED","Runtime destroyed");
      if(!["launch","show","hide","unload","memoryWarning"].includes(event))throw new ServiceError("PROTOCOL","Invalid lifecycle event");
      const listeners=lifecycleListeners.get(event) ?? new Set<(data: LaunchOptions | undefined) => void>();
      lifecycleListeners.set(event,listeners);listeners.add(listener);
      return ()=>{listeners.delete(listener);if(!listeners.size)lifecycleListeners.delete(event);};
    },
    dispose() {
      if (closed) return;
      closed = true;runtime.dispose();owners.delete(host);
      lifecycleListeners.clear();if(host.__miniLifecycle===lifecycle)host.__miniLifecycle=previousLifecycle;
      if(anchor.pump===pump)anchor.pump=undefined;
    },
  };
}
