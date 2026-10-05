package dev.pjm.android;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import android.content.Context;
import android.util.Base64;
import org.json.JSONObject;
import okhttp3.*;

/** Owner-thread admission/drain; workers never enter a guest or queue UI work. */
final class VerifiedHttp implements AutoCloseable {
  interface Sink {boolean post(VerifiedPackage source,long generation,byte[] reply);}
  private final Thread owner=Thread.currentThread();
  // Process-wide, so reopening or replacing a generation cannot reset a quota.
  private static final HashMap<String,ArrayDeque<Long>> rates=new HashMap<>();
  static synchronized boolean admitRate(String identity,long now){
    long cutoff=now-TimeUnit.SECONDS.toNanos(60);
    Iterator<Map.Entry<String,ArrayDeque<Long>>> entries=rates.entrySet().iterator();
    while(entries.hasNext()){ArrayDeque<Long> times=entries.next().getValue();while(!times.isEmpty() && times.peekFirst()<=cutoff)times.removeFirst();if(times.isEmpty())entries.remove();}
    ArrayDeque<Long> times=rates.get(identity);
    if(times==null){if(rates.size()>=64)return false;times=new ArrayDeque<>();rates.put(identity,times);}
    if(times.size()>=32)return false;times.addLast(now);return true;
  }
  private final ManagedResources resources=new ManagedResources();
  private final HashMap<String,Task> tasks=new HashMap<>();
  private final ThreadPoolExecutor workers=new ThreadPoolExecutor(0,8,20,TimeUnit.SECONDS,new SynchronousQueue<Runnable>(),work->{Thread thread=new Thread(work,"pjm-http");thread.setDaemon(true);return thread;});
  private final OkHttpClient client;private boolean closed;
  private static final class Task {
    final VerifiedPackage source;final long generation,id;final Request request;final ManagedResources.Slot resource;
    volatile boolean cancelled;volatile byte[] reply;Call call;
    Task(VerifiedPackage source,long generation,long id,Request request,ManagedResources.Slot resource){this.source=source;this.generation=generation;this.id=id;this.request=request;this.resource=resource;}
    synchronized void cancel(){cancelled=true;if(call!=null)call.cancel();reply=null;}
  }
  VerifiedHttp(Context context){this(initialized(context));}
  private static OkHttpClient initialized(Context context){OkHttp.INSTANCE.initialize(context.getApplicationContext());return new OkHttpClient();}
  // Injected client is host-owned; permits deterministic native transport tests.
  VerifiedHttp(OkHttpClient source){client=source.newBuilder().cookieJar(CookieJar.NO_COOKIES).cache(null).authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE).followRedirects(false).followSslRedirects(false).callTimeout(15,TimeUnit.SECONDS).connectTimeout(15,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).writeTimeout(15,TimeUnit.SECONDS).connectionPool(new ConnectionPool(0,1,TimeUnit.SECONDS)).build();}
  private void check(){if(Thread.currentThread()!=owner || closed)throw new IllegalStateException("HTTP requires its live owner thread");}
  private static JSONObject failure(long id,String code,String message){try{return new JSONObject().put("v",1).put("id",id).put("ok",false).put("error",new JSONObject().put("code",code).put("message",message));}catch(Exception impossible){throw new IllegalStateException(impossible);}}
  private static String key(long generation,long id){return generation+":"+id;}
  JSONObject start(VerifiedPackage source,long generation,long id,Object arguments){
    check();if(source==null || generation<=0 || id<1 || id>9007199254740991L)return failure(id,"PROTOCOL","Invalid HTTP binding");
    Request request;boolean resourceMode;
    try{
      if(!(arguments instanceof JSONObject))throw new IllegalArgumentException();JSONObject args=(JSONObject)arguments;
      Iterator<String> fields=args.keys();while(fields.hasNext())if(!Arrays.asList("url","method","headers","bodyBase64","responseMode").contains(fields.next()))throw new IllegalArgumentException();
      Object mode=args.has("responseMode")?args.opt("responseMode"):"inline";if(!Arrays.asList("inline","resource").contains(mode))throw new IllegalArgumentException();resourceMode=mode.equals("resource");
      Object address=args.opt("url"),method=args.has("method")?args.opt("method"):"GET",headers=args.has("headers")?args.opt("headers"):new JSONObject(),encoded=args.has("bodyBase64")?args.opt("bodyBase64"):"";
      if(!(address instanceof String) || ((String)address).isEmpty() || ((String)address).getBytes(StandardCharsets.UTF_8).length>2048 || !Arrays.asList("GET","HEAD","POST","PUT","PATCH","DELETE").contains(method) || !(headers instanceof JSONObject) || ((JSONObject)headers).length()>16 || !(encoded instanceof String) || ((String)encoded).length()>2048)throw new IllegalArgumentException();
      byte[] body=Base64.decode((String)encoded,Base64.NO_WRAP);if(body.length>1536 || !Base64.encodeToString(body,Base64.NO_WRAP).equals(encoded) || ((method.equals("GET") || method.equals("HEAD")) && body.length!=0))throw new IllegalArgumentException();
      try{source.policy.authorizeUrl((String)address);}catch(Exception denied){return failure(id,"DENIED","HTTP URL denied by package policy");}
      Request.Builder builder=new Request.Builder().url((String)address);Set<String> names=new HashSet<>();int bytes=0;JSONObject values=(JSONObject)headers;
      Iterator<String> iterator=values.keys();while(iterator.hasNext()){String name=iterator.next(),lower=name.toLowerCase(Locale.ROOT);Object field=values.opt(name);
        if(!name.matches("[A-Za-z0-9-]{1,64}") || !(field instanceof String) || ((String)field).getBytes(StandardCharsets.UTF_8).length>256 || !names.add(lower) || Arrays.asList("host","cookie","content-length","connection","transfer-encoding","proxy-authorization").contains(lower))throw new IllegalArgumentException();
        for(int i=0;i<((String)field).length();i++)if(Character.isISOControl(((String)field).charAt(i)))throw new IllegalArgumentException();
        bytes+=name.getBytes(StandardCharsets.UTF_8).length+((String)field).getBytes(StandardCharsets.UTF_8).length;if(bytes>1024)throw new IllegalArgumentException();builder.header(name,(String)field);
      }
      RequestBody payload=method.equals("GET") || method.equals("HEAD") || (method.equals("DELETE") && body.length==0)?null:RequestBody.create(body);
      request=builder.method((String)method,payload).build();
    }catch(Exception malformed){return failure(id,"PROTOCOL","Invalid HTTP arguments");}
    int count=0;for(Task task:tasks.values())if(task.generation==generation)count++;
    String key=key(generation,id);if(tasks.containsKey(key) || tasks.size()>=8 || count>=4)return failure(id,"BUSY","Too many HTTP requests");
    if(!admitRate(source.identity,System.nanoTime()))return failure(id,"BUSY","Application HTTP rate limit exceeded");
    ManagedResources.Slot slot=resourceMode?resources.reserve(source.identity,generation):null;if(resourceMode && slot==null)return failure(id,"BUSY","Resource capacity exceeded");
    Task task=new Task(source,generation,id,request,slot);tasks.put(key,task);
    try{workers.execute(()->run(task));}catch(RejectedExecutionException busy){tasks.remove(key);if(slot!=null){slot.finish(-1);resources.discard(slot);}return failure(id,"BUSY","HTTP workers are busy");}return null;
  }
  private void run(Task task){
    JSONObject result=null;int resourceLength=-1;long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(15);Request request=task.request;
    try{
      for(int redirects=0;;){
        if(task.cancelled)return;if(System.nanoTime()>=deadline)throw new InterruptedIOException();
        try{task.source.policy.authorizeUrl(request.url().toString());}catch(Exception denied){result=failure(task.id,"DENIED","HTTP redirect denied");break;}
        Call call; synchronized(task){if(task.cancelled)return;call=client.newCall(request);call.timeout().deadlineNanoTime(deadline);task.call=call;}
        try(Response response=call.execute()){
          int status=response.code();String location=response.header("Location");
          if(Arrays.asList(301,302,303,307,308).contains(status) && location!=null){
            HttpUrl next=request.url().resolve(location);if(next==null || ++redirects>5){result=failure(task.id,"DENIED","HTTP redirect denied");break;}
            try{task.source.policy.authorizeUrl(next.toString());}catch(Exception denied){result=failure(task.id,"DENIED","HTTP redirect denied");break;}
            Request.Builder builder=request.newBuilder().url(next).removeHeader("Authorization").removeHeader("Cookie");
            if(status==303 && !request.method().equals("HEAD") || ((status==301 || status==302) && request.method().equals("POST")))builder.method("GET",null).removeHeader("Content-Type");
            request=builder.build();continue;
          }
          ResponseBody body=response.body();ByteArrayOutputStream bytes=task.resource==null?new ByteArrayOutputStream():null;int size=0,limit=task.resource==null?1536:ManagedResources.CAPACITY;
          if(body!=null){if(body.contentLength()>limit)throw new IOException("response overflow");try(InputStream input=body.byteStream()){byte[] buffer=new byte[512];int n;while((n=input.read(buffer))!=-1){if(task.cancelled)return;if(n>limit-size)throw new IOException("response overflow");if(bytes!=null)bytes.write(buffer,0,n);else System.arraycopy(buffer,0,task.resource.bytes,size,n);size+=n;}}}
          JSONObject data=new JSONObject().put("status",status);if(bytes!=null)data.put("bodyBase64",Base64.encodeToString(bytes.toByteArray(),Base64.NO_WRAP));else{data.put("resource",new JSONObject().put("handle",task.resource.handle).put("size",size));resourceLength=size;}
          result=new JSONObject().put("v",1).put("id",task.id).put("ok",true).put("data",data);break;
        }finally{synchronized(task){if(task.call==call)task.call=null;}}
      }
    }catch(Exception failed){result=failure(task.id,failed instanceof InterruptedIOException?"TIMEOUT":"FAILED","HTTP request failed");}finally{if(task.resource!=null)task.resource.finish(resourceLength);}
    if(!task.cancelled && result!=null){byte[] bytes=result.toString().replace("\\/","/").getBytes(StandardCharsets.UTF_8);task.reply=bytes.length<=4096?bytes:failure(task.id,"FAILED","HTTP reply exceeds limit").toString().getBytes(StandardCharsets.UTF_8);}
  }
  void drain(Sink sink){check();for(String key:new ArrayList<>(tasks.keySet())){Task task=tasks.get(key);byte[] reply=task.reply;if(reply!=null && sink.post(task.source,task.generation,reply)){tasks.remove(key);if(task.resource!=null && !task.resource.ready)resources.discard(task.resource);}}}
  void cancel(long generation,long id){check();Task task=tasks.remove(key(generation,id));if(task!=null){task.cancel();resources.discard(task.resource);}}
  void retire(long generation){check();for(String key:new ArrayList<>(tasks.keySet())){Task task=tasks.get(key);if(task.generation==generation){tasks.remove(key);task.cancel();resources.discard(task.resource);}}resources.retire(generation);}
  Object resourceRead(String identity,long generation,Object args)throws Exception{return resources.read(identity,generation,args);}
  Object resourceRelease(String identity,long generation,Object args)throws Exception{return resources.release(identity,generation,args);}
  int pending(){check();return tasks.size();}
  public void close(){if(closed)return;check();for(Task task:tasks.values())task.cancel();tasks.clear();resources.close();closed=true;workers.shutdownNow();client.connectionPool().evictAll();}
}
