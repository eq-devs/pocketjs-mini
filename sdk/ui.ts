import { FrameRuntime, ServiceError, utf8Bytes } from './runtime.ts';
import { strictJsonEncode } from './json.ts';

export interface ToastOptions { text: string; durationFrames?: number; }
export interface DialogOptions { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; showCancel?: boolean; }
export interface ActionSheetOptions { title?: string; items: readonly string[]; cancelLabel?: string; }
export interface UIWork<T> { promise: Promise<T>; cancel(): void; }
export type ModalState = Readonly<
  { kind: 'dialog'; title: string; message: string; confirmLabel: string; cancelLabel: string; showCancel: boolean } |
  { kind: 'actionSheet'; title: string; items: readonly string[]; cancelLabel: string }
>;
export interface UISnapshot { readonly modal?: ModalState; readonly toast?: Readonly<{text: string}>; }
type Slot<T> = { resolve(value: T): void; reject(error: ServiceError): void; stop?: () => void; };
function shape(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if(!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key)))throw new ServiceError('PROTOCOL','Invalid UI options');
}
function text(value: unknown, max: number, empty = false): string {
  if(typeof value !== 'string' || (!empty && !value.trim()) || utf8Bytes(value)>max)throw new ServiceError('PROTOCOL','UI text exceeds limit or is empty');
  try { strictJsonEncode(value); } catch { throw new ServiceError('PROTOCOL','Invalid UI Unicode'); }
  return value;
}
/** Guest-local overlays. A mounted MiniOverlays renderer is required. No native mailbox traffic. */
export class MiniUI {
  private renderer?: (state: UISnapshot) => void;
  private modal?: ModalState;
  private toastState?: Readonly<{text: string}>;
  private modalWork?: Slot<{confirmed: boolean} | {index: number}>;
  private toastWork?: Slot<void>;
  private closed = false;
  constructor(private runtime: FrameRuntime) {}
  private ready() {
    if(this.closed)throw new ServiceError('CLOSED','UI session destroyed');
    if(!this.renderer)throw new ServiceError('UNSUPPORTED','Mount MiniOverlays before using mini.ui');
  }
  private publish() { this.renderer?.(Object.freeze({modal:this.modal,toast:this.toastState})); }
  /** Renderer ownership is exclusive so input cannot complete an overlay twice. */
  attach(renderer: (state: UISnapshot) => void): () => void {
    if(this.closed)throw new ServiceError('CLOSED','UI session destroyed');
    if(typeof renderer !== 'function')throw new ServiceError('PROTOCOL','Invalid UI renderer');
    if(this.renderer)throw new ServiceError('BUSY','UI renderer already mounted');
    this.renderer=renderer;
    try { this.publish(); } catch(error) { this.renderer=undefined; throw error; }
    let attached=true;
    return ()=>{if(!attached)return;attached=false;this.clear('CANCELLED');this.renderer=undefined;};
  }
  toast(options: ToastOptions): UIWork<void> {
    this.ready();shape(options,['text','durationFrames']);
    const value=text(options.text,512), frames=options.durationFrames ?? 120;
    if(!Number.isSafeInteger(frames)||frames<1||frames>3600)throw new ServiceError('PROTOCOL','Toast duration must be 1–3600 frames');
    if(this.toastWork)throw new ServiceError('BUSY','A toast is already visible');
    let work!: Slot<void>;
    const promise=new Promise<void>((resolve,reject)=>{work={resolve,reject};});
    // Timer admission can fail without exposing an overlay or an unsettled Promise.
    work.stop=this.runtime.after(frames,()=>{if(this.toastWork!==work)return;this.toastWork=undefined;this.toastState=undefined;this.publish();work.resolve();});
    this.toastWork=work;this.toastState=Object.freeze({text:value});this.publish();
    return {promise,cancel:()=>{if(this.toastWork!==work)return;work.stop?.();this.toastWork=undefined;this.toastState=undefined;this.publish();work.reject(new ServiceError('CANCELLED','Toast cancelled'));}};
  }
  dialog(options: DialogOptions): UIWork<{confirmed: boolean}> {
    this.ready();shape(options,['title','message','confirmLabel','cancelLabel','showCancel']);
    if(options.showCancel!==undefined && typeof options.showCancel!=='boolean')throw new ServiceError('PROTOCOL','Invalid dialog cancel option');
    const state: ModalState=Object.freeze({kind:'dialog',title:text(options.title,128),message:text(options.message??'',2048,true),confirmLabel:text(options.confirmLabel??'OK',64),cancelLabel:text(options.cancelLabel??'Cancel',64),showCancel:options.showCancel??true});
    return this.open<{confirmed:boolean}>(state);
  }
  actionSheet(options: ActionSheetOptions): UIWork<{index: number}> {
    this.ready();shape(options,['title','items','cancelLabel']);
    if(!Array.isArray(options.items)||options.items.length<1||options.items.length>8)throw new ServiceError('PROTOCOL','Action sheet requires 1–8 items');
    const items:string[]=[];
    // Do not let sparse arrays silently create missing actions.
    for(let index=0;index<options.items.length;index++)items.push(text(options.items[index],128));
    return this.open<{index:number}>(Object.freeze({kind:'actionSheet',title:text(options.title??'',128,true),items:Object.freeze(items),cancelLabel:text(options.cancelLabel??'Cancel',64)}));
  }
  private open<T extends {confirmed:boolean}|{index:number}>(state: ModalState): UIWork<T> {
    if(this.modalWork)throw new ServiceError('BUSY','A modal is already visible');
    let work!: Slot<T>;
    const promise=new Promise<T>((resolve,reject)=>{work={resolve,reject};});
    this.modalWork=work as Slot<{confirmed:boolean}|{index:number}>;this.modal=state;this.publish();
    return {promise,cancel:()=>{if(this.modalWork!==work)return;this.finish(undefined,'CANCELLED');}};
  }
  private finish(value?: {confirmed:boolean}|{index:number}, error?: 'CANCELLED'|'CLOSED') {
    const work=this.modalWork;if(!work)return;
    this.modalWork=undefined;this.modal=undefined;this.publish();
    if(error)work.reject(new ServiceError(error,'Overlay dismissed'));else work.resolve(value!);
  }
  /** Renderer responses carry the snapshot they were drawn from: retired buttons are inert. */
  respond(state: ModalState, index: number): void {
    if(state!==this.modal || !this.modalWork)return;
    if(!Number.isSafeInteger(index))throw new ServiceError('PROTOCOL','Invalid overlay action');
    if(state.kind==='dialog') {
      if(index!==1 && !(index===0 && state.showCancel))throw new ServiceError('PROTOCOL','Invalid dialog action');
      this.finish({confirmed:index===1});
    } else {
      if(index<0||index>=state.items.length)throw new ServiceError('PROTOCOL','Invalid action sheet selection');
      this.finish({index});
    }
  }
  dismiss(state: ModalState): void { if(state===this.modal)this.finish(undefined,'CANCELLED'); }
  back(): boolean { if(!this.modal)return false;this.finish(undefined,'CANCELLED');return true; }
  clear(code: 'CANCELLED'|'CLOSED' = 'CANCELLED'): void {
    const modal=this.modalWork,toast=this.toastWork;
    this.modalWork=undefined;this.modal=undefined;this.toastWork=undefined;this.toastState=undefined;
    toast?.stop?.();this.publish();
    modal?.reject(new ServiceError(code,'UI session ended'));toast?.reject(new ServiceError(code,'UI session ended'));
  }
  dispose(): void { if(this.closed)return;this.closed=true;this.clear('CLOSED');this.renderer=undefined; }
}
