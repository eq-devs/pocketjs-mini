/** Frame-owned SDK state. Native completions enqueue; only beginFrame delivers. */
import {strictJsonText} from './json.ts';
export type ErrorCode = "UNSUPPORTED" | "DENIED" | "FAILED" | "TIMEOUT" | "BUSY" | "CANCELLED" | "PROTOCOL" | "CLOSED";
export class ServiceError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; this.name = "ServiceError"; }
}
export interface Transport { send(line: string): void; }
export interface Limits { maxMessageBytes: number; maxPending: number; timeoutFrames: number; maxQueued: number; maxTimers:number; maxListeners:number; }
const defaults: Limits = { maxMessageBytes: 65536, maxPending: 32, timeoutFrames: 600, maxQueued: 128, maxTimers:256, maxListeners:256 };
type Pending = { resolve(value: unknown): void; reject(error: ServiceError): void; deadline: number; };
type Reply = { v: 1; id: number; ok: boolean; data?: unknown; error?: { code: ErrorCode; message: string }; };
const codes = new Set<ErrorCode>(["UNSUPPORTED", "DENIED", "FAILED", "TIMEOUT", "BUSY", "CANCELLED", "PROTOCOL", "CLOSED"]);

// QuickJS need not provide TextEncoder. Count encoded UTF-8 bytes, including
// lone surrogates (which encode as replacement characters).
export function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

export class FrameRuntime {
  readonly limits: Limits;
  private pending = new Map<number, Pending>();
  private inbox: Array<Reply | { v: 1; event: string; data?: unknown }> = [];
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private timers = new Map<number, { deadline: number; callback: () => void }>();
  private nextId = 1;
  private lastId = 0;
  private idSource?: () => number;
  private nextTimer = 1;
  private disposed = false;
  private ticking = false;
  private transport: Transport;
  private cancelNative(id: number): void {
    // Cancellation must not prevent local teardown if the host mailbox is full
    // or has already retired. Native retirement remains the final cleanup gate.
    try { this.transport.send(JSON.stringify({ v: 1, id, kind: "cancel.v1", args: {} }) + "\n"); } catch {}
  }
  private frameNumber = 0;
  get currentFrame():number {return this.frameNumber;}
  constructor(transport: Transport, limits: Partial<Limits> = {}, idSource?: () => number) {
    this.transport = transport;
    this.idSource = idSource;
    this.limits = Object.freeze({ ...defaults, ...limits });
    for (const value of Object.values(this.limits)) if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("SDK limits must be positive integers");
  }
  request<T>(kind: string, args: unknown = {}, timeoutFrames = this.limits.timeoutFrames): { promise: Promise<T>; cancel(): void } {
    if (this.disposed) throw new ServiceError("CLOSED", "Runtime destroyed");
    if (!/^[a-z][a-zA-Z0-9.]*\.v[1-9][0-9]*$/.test(kind)) throw new ServiceError("PROTOCOL", "Service kind requires a version suffix");
    if (!Number.isSafeInteger(timeoutFrames) || timeoutFrames < 1) throw new RangeError("Timeout must be a positive frame count");
    const deadline=this.currentFrame+timeoutFrames;
    if(!Number.isSafeInteger(deadline))throw new ServiceError('PROTOCOL','Request deadline exceeds frame range');
    if (this.pending.size >= this.limits.maxPending) throw new ServiceError("BUSY", "Too many native requests");
    const id = this.idSource ? this.idSource() : this.nextId++;
    if (!Number.isSafeInteger(id) || id <= this.lastId) throw new ServiceError("BUSY", "Request identifiers exhausted or reused");
    this.lastId = id;
    let line:string;
    try{line=JSON.stringify({ v: 1, id, kind, args },(_key,value)=>{
      if(value===undefined||typeof value==='function'||typeof value==='symbol'||typeof value==='bigint'||(typeof value==='number'&&!Number.isFinite(value)))throw Error('Non-JSON request value');
      return value;
    });}catch{throw new ServiceError('PROTOCOL','Native request must contain JSON values');}
    if (utf8Bytes(line) > this.limits.maxMessageBytes) throw new ServiceError("PROTOCOL", "Native message exceeds byte limit; use a resource handle");
    try{strictJsonText(line,{maxTokens:8192});}catch{throw new ServiceError('PROTOCOL','Invalid native request JSON');}
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject, deadline });
      try { this.transport.send(line + "\n"); }
      catch (error) {
        this.pending.delete(id);
        const native = error as { code?: ErrorCode; message?: unknown } | null;
        reject(error instanceof ServiceError ? error : native && codes.has(native.code as ErrorCode) && typeof native.message === "string"
          ? new ServiceError(native.code!, native.message) : new ServiceError("FAILED", String(error)));
      }
    });
    return { promise, cancel: () => {
      const work = this.pending.get(id);
      if (!work) return;
      this.pending.delete(id);
      work.reject(new ServiceError("CANCELLED", "Request cancelled"));
      this.cancelNative(id);
    } };
  }
  /** One complete JSON-line record per call. Invalid input never enters the frame. */
  enqueue(line: string): void {
    this.enqueueBatch([line]);
  }
  /** Admit all records together; a rejected batch cannot deliver a valid prefix. */
  enqueueBatch(lines:readonly string[]):void {
    if (this.disposed) return;
    if(!Array.isArray(lines))throw new ServiceError('PROTOCOL','Invalid completion batch');
    if(lines.length>this.limits.maxQueued-this.inbox.length)throw new ServiceError('BUSY','Native completion queue is full');
    const batch:typeof this.inbox=[];
    for(const line of lines)batch.push(this.decodeReply(line));
    for(const reply of batch)this.inbox.push(reply);
  }
  private decodeReply(line:string):Reply|{v:1;event:string;data?:unknown} {
    if (typeof line!=='string'||utf8Bytes(line) > this.limits.maxMessageBytes) throw new ServiceError("PROTOCOL", "Native reply exceeds byte limit");
    let value: any;
    try { value = strictJsonText(line,{maxTokens:8192}); } catch { throw new ServiceError("PROTOCOL", "Invalid JSON reply"); }
    if (!value || value.v !== 1 || typeof value !== "object" || Array.isArray(value)) throw new ServiceError("PROTOCOL", "Unsupported protocol version");
    const only=(names:readonly string[])=>Object.keys(value).every(key=>names.includes(key));
    if (typeof value.event === "string" && value.event.length > 0 && value.event.length <= 64 && value.id === undefined && only(['v','event','data'])) return value;
    else if (Number.isSafeInteger(value.id) && value.id > 0 && typeof value.ok === "boolean"
      && (value.ok ? only(['v','id','ok','data']) : only(['v','id','ok','error']) && value.error && !Array.isArray(value.error) && Object.keys(value.error).sort().join(',')==='code,message' && codes.has(value.error.code) && typeof value.error.message === "string")) return value;
    else throw new ServiceError("PROTOCOL", "Invalid native reply shape");
  }
  on(event: string, listener: (data: unknown) => void): () => void {
    if (this.disposed) throw new ServiceError("CLOSED", "Runtime destroyed");
    if(typeof event!=='string'||!event.length||utf8Bytes(event)>64||typeof listener!=='function')throw new ServiceError('PROTOCOL','Invalid event listener');
    const listeners = this.listeners.get(event) ?? new Set();
    if(!listeners.has(listener)){
      let count=0;for(const registered of this.listeners.values())count+=registered.size;
      if(count>=this.limits.maxListeners)throw new ServiceError('BUSY','Too many event listeners');
    }
    this.listeners.set(event, listeners); listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size && this.listeners.get(event)===listeners) this.listeners.delete(event); };
  }
  after(frames: number, callback: () => void): () => void {
    if (this.disposed) throw new ServiceError("CLOSED", "Runtime destroyed");
    if (!Number.isSafeInteger(frames) || frames < 1) throw new RangeError("after() needs a positive frame count");
    if(typeof callback!=='function'||!Number.isSafeInteger(this.currentFrame+frames))throw new ServiceError('PROTOCOL','Invalid frame timer');
    if(this.timers.size>=this.limits.maxTimers)throw new ServiceError('BUSY','Too many frame timers');
    if(!Number.isSafeInteger(this.nextTimer))throw new ServiceError('BUSY','Frame timer identifiers exhausted');
    const id = this.nextTimer++;
    this.timers.set(id, { deadline: this.currentFrame + frames, callback });
    return () => { this.timers.delete(id); };
  }
  beginFrame(): void {
    if (this.disposed) return;
    if (this.ticking) throw new ServiceError("PROTOCOL", "Reentrant frame");
    if(!Number.isSafeInteger(this.frameNumber+1)){this.dispose();throw new ServiceError('BUSY','Frame counter exhausted');}
    this.ticking = true;
    const errors: unknown[] = [];
    const invoke = (callback: () => void) => { try { callback(); } catch (error) { errors.push(error); } };
    try {
      this.frameNumber++;
      // Snapshot first: a completion produced during delivery belongs to the next frame.
      const batch = this.inbox; this.inbox = [];
      for (const reply of batch) {
        if (this.disposed) break;
        if ("event" in reply) {
          for (const listener of [...(this.listeners.get(reply.event) ?? [])]) {if(this.disposed)break;invoke(() => listener(reply.data));}
        } else {
          const work = this.pending.get(reply.id);
          if (!work) continue;
          this.pending.delete(reply.id);
          if (reply.ok) work.resolve(reply.data);
          else work.reject(new ServiceError(reply.error!.code, reply.error!.message));
        }
      }
      for (const [id, work] of this.pending) if (work.deadline <= this.currentFrame) {
        this.pending.delete(id); work.reject(new ServiceError("TIMEOUT", "Native request exceeded frame deadline"));
        this.cancelNative(id);
      }
      for (const [id, timer] of [...this.timers]) if (timer.deadline <= this.currentFrame && this.timers.has(id)) {
        this.timers.delete(id); invoke(timer.callback);
      }
    } finally { this.ticking = false; }
    if (errors.length) throw errors[0];
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pending = [...this.pending];
    this.pending.clear(); this.timers.clear(); this.listeners.clear(); this.inbox = [];
    for (const [id, work] of pending) {
      work.reject(new ServiceError("CLOSED", "Runtime destroyed"));
      this.cancelNative(id);
    }
  }
}
