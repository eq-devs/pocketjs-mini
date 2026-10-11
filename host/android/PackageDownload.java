package dev.pjm.android;

import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONObject;
import okhttp3.*;

/** Host-owned update discovery/download. No guest command supplies URLs or keys.
 * Owner delivery stages an authenticated cache update; running guests stay intact. */
final class PackageDownload implements AutoCloseable {
 interface Owner {boolean post(Runnable work);}
 interface Listener {void completed(String version,Exception failure);}
 private static final Set<String> activeRoots=new HashSet<>();
 private static final ThreadPoolExecutor workers=new ThreadPoolExecutor(0,2,20,TimeUnit.SECONDS,new SynchronousQueue<Runnable>(),work->{Thread thread=new Thread(()->{try{android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_BACKGROUND);}catch(SecurityException ignored){}work.run();},"pjm-download");thread.setDaemon(true);return thread;});
 private final Thread owner=Thread.currentThread();private final PackageStore store;private final Owner delivery;private final OkHttpClient client;
 private Task task;private boolean closed;
 private static final class Task {
  final String root,identity;final HttpUrl latest;final Listener listener;final long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(30);
  volatile boolean cancelled;Call call;
  Task(String root,String identity,HttpUrl latest,Listener listener){this.root=root;this.identity=identity;this.latest=latest;this.listener=listener;}
  synchronized void cancel(){cancelled=true;if(call!=null)call.cancel();}
 }
 PackageDownload(PackageStore store,Owner delivery){this(store,delivery,new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).connectTimeout(15,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).build());}
 PackageDownload(PackageStore store,Owner delivery,OkHttpClient client){this.store=Objects.requireNonNull(store);this.delivery=Objects.requireNonNull(delivery);this.client=Objects.requireNonNull(client).newBuilder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build();}
 private void owner(){if(Thread.currentThread()!=owner)throw new IllegalStateException("Download owner thread required");}
 static HttpUrl endpoint(String address)throws IOException {
  if(address==null||address.length()>2048)throw new IOException("Invalid distribution URL");
  HttpUrl url=HttpUrl.parse(address);
  if(url==null||!url.isHttps()||!url.username().isEmpty()||!url.password().isEmpty()||url.query()!=null||url.fragment()!=null)throw new IOException("Distribution requires HTTPS without credentials, query or fragment");
  // HttpUrl normalizes empty user-info away; reject it in the original authority too.
  try{if(new java.net.URI(address).getRawAuthority()==null||new java.net.URI(address).getRawUserInfo()!=null)throw new IOException("Distribution credentials denied");}catch(java.net.URISyntaxException invalid){throw new IOException("Invalid distribution URL",invalid);}
  return url;
 }
 private static HttpUrl sibling(Task bound,String address)throws IOException {HttpUrl url=endpoint(address);if(!url.host().equals(bound.latest.host())||url.port()!=bound.latest.port())throw new IOException("Distribution origin changed");return url;}
 private static String string(JSONObject value,String key)throws IOException {Object item=value.opt(key);if(!(item instanceof String))throw new IOException("Invalid distribution field");return (String)item;}
 static String configuration(byte[] bytes)throws Exception {JSONObject value=BoundedJson.object(bytes,4096);if(value.length()!=2||!Integer.valueOf(1).equals(value.opt("format")))throw new IOException("Invalid distribution configuration");String url=string(value,"latestUrl");endpoint(url);return url;}
 void start(String address,String identity,Listener listener)throws Exception {
  owner();if(closed||task!=null)throw new IOException("Download BUSY");
  if(identity==null||identity.length()>128||!identity.matches("[a-zA-Z][a-zA-Z0-9_-]*(\\.[a-zA-Z][a-zA-Z0-9_-]*)+"))throw new IOException("Invalid distribution identity");
  Objects.requireNonNull(listener);HttpUrl latest=endpoint(address);String root=store.rootIdentity();
  synchronized(activeRoots){if(activeRoots.size()>=2||!activeRoots.add(root))throw new IOException("Download BUSY");}
  Task bound=new Task(root,identity,latest,Objects.requireNonNull(listener));task=bound;
  try{workers.execute(()->run(bound));}catch(RejectedExecutionException busy){task=null;release(bound);throw new IOException("Download BUSY",busy);}
 }
 private static void release(Task bound){synchronized(activeRoots){activeRoots.remove(bound.root);}}
 private static void running(Task bound)throws IOException {if(bound.cancelled)throw new InterruptedIOException("Download cancelled");if(System.nanoTime()>=bound.deadline)throw new InterruptedIOException("Download timed out");}
 private byte[] read(Task bound,HttpUrl url,int maximum)throws Exception {
  running(bound);Request request=new Request.Builder().url(url).header("Accept-Encoding","identity").header("Cache-Control","no-cache").build();Call call=client.newCall(request);call.timeout().deadlineNanoTime(bound.deadline);
  synchronized(bound){if(bound.cancelled){call.cancel();throw new InterruptedIOException("Download cancelled");}bound.call=call;}
  try(Response response=call.execute()){
   if(response.code()!=200||!response.request().url().equals(url))throw new IOException("Distribution response rejected");ResponseBody body=response.body();if(body==null||body.contentLength()>maximum)throw new IOException("Distribution body exceeds budget");
   try(InputStream input=body.byteStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
    byte[] buffer=new byte[8192];for(;;){running(bound);int count=input.read(buffer);if(count<0)break;if(count>maximum-output.size())throw new IOException("Distribution body exceeds budget");output.write(buffer,0,count);}
    if(output.size()==0)throw new IOException("Empty distribution body");running(bound);return output.toByteArray();
   }
  }finally{synchronized(bound){if(bound.call==call)bound.call=null;}}
 }
 private void run(Task bound){byte[] payload=null,envelope=null;String version=null;Exception failure=null;
  try{
   JSONObject latest=BoundedJson.object(read(bound,bound.latest,65536),65536);
   if(latest.length()!=4||!bound.identity.equals(string(latest,"appId")))throw new IOException("Distribution identity mismatch");
   version=string(latest,"version");if(version.length()>64||!version.matches("(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"))throw new IOException("Invalid distribution version");
   HttpUrl manifestUrl=sibling(bound,string(latest,"manifestUrl")),packageUrl=sibling(bound,string(latest,"packageUrl"));
   envelope=read(bound,manifestUrl,65536);JSONObject manifest=BoundedJson.object(envelope,65536);
   if(!bound.identity.equals(string(manifest,"appId"))||!version.equals(string(manifest,"version")))throw new IOException("Distribution manifest mismatch");
   payload=read(bound,packageUrl,64*1024*1024);
  }catch(Exception error){failure=error;}
  final byte[] downloaded=payload,manifest=envelope;final String selectedVersion=version;final Exception error=failure;
  try{if(delivery.post(()->{
    try{owner();if(closed||task!=bound||bound.cancelled)return;Exception result=error;if(result==null)try{running(bound);store.stage(downloaded,manifest);}catch(Exception rejected){result=rejected;}task=null;bound.listener.completed(result==null?selectedVersion:null,result);}
    finally{release(bound);}
   }))return;}catch(RuntimeException unavailable){/* A stopped owner cannot stage late results. */}
  release(bound);
 }
 public void close(){owner();if(closed)return;closed=true;if(task!=null){task.cancel();task=null;}}
}
