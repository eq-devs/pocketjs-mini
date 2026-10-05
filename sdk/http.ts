import { ServiceError, utf8Bytes } from "./runtime.ts";

export interface HttpRequest {
  readonly url: string;
  readonly responseMode?: "inline" | "resource";
  readonly method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly headers?: Readonly<Record<string, string>>;
  /** Canonical base64; at most 1536 decoded bytes. */
  readonly bodyBase64?: string;
}
export interface ResourceHandle { readonly handle: string; readonly size: number; }
export type HttpResponse = { readonly status: number; readonly bodyBase64: string; readonly resource?: never } | { readonly status: number; readonly resource: ResourceHandle; readonly bodyBase64?: never };
export interface ResourceRead { readonly handle: string; readonly offset: number; readonly count: number; }
export interface ResourceChunk { readonly bodyBase64: string; readonly offset: number; readonly nextOffset: number; readonly size: number; readonly eof: boolean; }
function invalid(message: string): never { throw new ServiceError("PROTOCOL", message); }
// QuickJS guests need not provide atob, Buffer or URL. Validate padding bits
// directly, so equivalent noncanonical encodings cannot cross the protocol.
function body(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) invalid("Invalid inline HTTP body");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if ((value.endsWith("==") && (alphabet.indexOf(value[value.length - 3]) & 15) !== 0)
    || (!value.endsWith("==") && value.endsWith("=") && (alphabet.indexOf(value[value.length - 2]) & 3) !== 0)) invalid("Noncanonical HTTP base64");
  return value;
}
export function checkedHttpRequest(value: HttpRequest): HttpRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["url", "method", "headers", "bodyBase64", "responseMode"].includes(key))) invalid("Invalid HTTP arguments");
  if (typeof value.url !== "string" || !/^https:\/\//i.test(value.url) || /[\u0000-\u0020\u007f]/.test(value.url)
    || utf8Bytes(value.url) > 2048) invalid("Invalid HTTP URL");
  // Native authenticated policy remains authoritative for host/port/redirects.
  const method = value.method === undefined ? "GET" : value.method, encoded = body(value.bodyBase64 === undefined ? "" : value.bodyBase64);
  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method)
    || ((method === "GET" || method === "HEAD") && encoded.length)) invalid("Invalid HTTP method or body");
  if(value.responseMode !== undefined && value.responseMode !== "inline" && value.responseMode !== "resource") invalid("Invalid HTTP response mode");
  const source = value.headers === undefined ? {} : value.headers;
  if (!source || typeof source !== "object" || Array.isArray(source) || Object.keys(source).length > 16) invalid("Invalid HTTP headers");
  const headers: Record<string, string> = {}, names = new Set<string>();
  let bytes = 0;
  for (const [name, field] of Object.entries(source)) {
    const lower = name.toLowerCase();
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || typeof field !== "string" || utf8Bytes(field) > 256
      || /[^\x20-\x7e]/.test(field) || names.has(lower)
      || ["host", "cookie", "content-length", "connection", "transfer-encoding", "proxy-authorization"].includes(lower)) invalid("Invalid HTTP header");
    bytes += utf8Bytes(name) + utf8Bytes(field);
    if (bytes > 1024) invalid("HTTP headers exceed limit");
    names.add(lower); headers[name] = field;
  }
  return Object.freeze({ url: value.url, method, headers: Object.freeze(headers), bodyBase64: encoded, ...(value.responseMode === undefined ? {} : {responseMode: value.responseMode}) });
}
export function checkedHttpResponse(value: unknown, mode: "inline" | "resource" = "inline"): HttpResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Invalid HTTP response");
  const data = value as Record<string, unknown>;
  if(Object.keys(data).some(key=>!(mode === "resource"?["status","resource"]:["status","bodyBase64"]).includes(key))) invalid("Unexpected HTTP response field");
  if (typeof data.status !== "number" || !Number.isInteger(data.status) || data.status < 100 || data.status > 599) invalid("Invalid HTTP status");
  if(mode === "resource") {
    if(data.bodyBase64 !== undefined || !data.resource || typeof data.resource !== "object" || Array.isArray(data.resource)) invalid("Invalid HTTP resource");
    const resource=data.resource as Record<string,unknown>;
    if(Object.keys(resource).length!==2 || Object.keys(resource).some(key=>!["handle","size"].includes(key))) invalid("Unexpected resource descriptor field");
    checkedResourceHandle(resource.handle);boundedInteger(resource.size,0,1048576);
    return Object.freeze({status:data.status,resource:Object.freeze({handle:resource.handle as string,size:resource.size as number})});
  }
  if(data.resource !== undefined) invalid("Unexpected HTTP resource");
  return Object.freeze({ status: data.status, bodyBase64: body(data.bodyBase64) });
}

function boundedInteger(value: unknown, low: number, high: number): number {
  if(typeof value !== "number" || !Number.isInteger(value) || value < low || value > high) invalid("Invalid resource range");
  return value;
}
export function checkedResourceHandle(value: unknown): string {
  if(typeof value !== "string" || !/^r_[a-f0-9]{32}$/.test(value)) invalid("Invalid resource handle");
  return value;
}
export function checkedResourceRead(value: ResourceRead): ResourceRead {
  if(!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key=>!["handle","offset","count"].includes(key))) invalid("Invalid resource read");
  return Object.freeze({handle:checkedResourceHandle(value.handle),offset:boundedInteger(value.offset,0,1048576),count:boundedInteger(value.count,1,1536)});
}
export function checkedResourceChunk(value: unknown, request: ResourceRead): ResourceChunk {
  if(!value || typeof value !== "object" || Array.isArray(value)) invalid("Invalid resource chunk");
  const data=value as Record<string,unknown>;
  if(Object.keys(data).length!==5 || Object.keys(data).some(key=>!["bodyBase64","offset","nextOffset","size","eof"].includes(key))) invalid("Unexpected resource chunk field");
  const encoded=body(data.bodyBase64);
  const size=boundedInteger(data.size,0,1048576),offset=boundedInteger(data.offset,0,size),nextOffset=boundedInteger(data.nextOffset,offset,size);
  const decoded=encoded.length/4*3-(encoded.endsWith("==")?2:encoded.endsWith("=")?1:0);
  if(offset!==request.offset || nextOffset-offset!==decoded || decoded!==Math.min(request.count,size-offset) || typeof data.eof!=="boolean" || data.eof!==(nextOffset===size)) invalid("Inconsistent resource chunk");
  return Object.freeze({bodyBase64:encoded,offset,nextOffset,size,eof:data.eof});
}
