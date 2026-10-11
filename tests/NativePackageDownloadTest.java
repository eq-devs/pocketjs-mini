package dev.pjm.android;
import java.io.*;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.*;
import android.util.Base64;
import okhttp3.*;

/** Controlled transport, actual native signature/structure/cache operations. */
final class NativePackageDownloadTest {
 interface Action {void run()throws Exception;}
 static void reject(Action action)throws Exception {try{action.run();}catch(Exception expected){return;}throw new AssertionError("Rejected download admitted");}
 static void deliver(ConcurrentLinkedQueue<Runnable> queue)throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);while(System.nanoTime()<end){Runnable work=queue.poll();if(work!=null){work.run();return;}Thread.sleep(5);}throw new AssertionError("Missing owner delivery");}
 static void verify(File root,byte[] payload,byte[] envelope,byte[] key,JSONObject fixture)throws Exception {
  PackageStore store=new PackageStore(root,key);store.seed(payload,envelope);VerifiedPackage running=store.coldStart("dev.pjm.fixture");
  JSONObject update=fixture.getJSONObject("update");byte[] next=Base64.decode(update.getString("payload"),Base64.DEFAULT),manifest=update.getJSONObject("manifest").toString().getBytes("UTF-8");
  ConcurrentLinkedQueue<Runnable> queue=new ConcurrentLinkedQueue<>();AtomicReference<String> mode=new AtomicReference<>("valid");
  CountDownLatch[] entered={null},release={null};
  OkHttpClient client=new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).addInterceptor(chain->{
   if(mode.get().equals("slow")){entered[0].countDown();try{if(!release[0].await(8,TimeUnit.SECONDS))throw new IOException("Blocked fixture timeout");}catch(InterruptedException stopped){throw new IOException(stopped);}}
   String path=chain.request().url().encodedPath();byte[] body;int code=200;
   try{
    if(path.equals("/latest.json")){JSONObject index=new JSONObject().put("appId","dev.pjm.fixture").put("version","2.0.0").put("manifestUrl",mode.get().equals("origin")?"https://other.example/manifest.json":"https://distribution.example/manifest.json").put("packageUrl","https://distribution.example/main.pocket");body=index.toString().getBytes("UTF-8");}
    else if(path.equals("/manifest.json"))body=manifest;
    else body=mode.get().equals("tamper")?new byte[]{1,2,3}:next;
   }catch(Exception invalid){throw new IOException(invalid);}
   if(mode.get().equals("redirect"))code=302;
   if(mode.get().equals("large-index")&&path.equals("/latest.json"))body=new byte[65537];
   return new Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(code).message("Controlled fixture").body(ResponseBody.create(body,MediaType.parse("application/octet-stream"))).build();
  }).build();
  PackageDownload download=new PackageDownload(store,queue::offer,client);String[] version={null};Exception[] failure={null};
  PackageDownload.Listener result=(value,error)->{version[0]=value;failure[0]=error;};
  reject(()->download.start("http://distribution.example/latest.json",running.identity,result));
  reject(()->PackageDownload.endpoint("https://@distribution.example/latest.json"));
  reject(()->PackageDownload.configuration("{\"format\":1,\"latestUrl\":\"https://distribution.example/latest.json\",\"key\":\"evil\"}".getBytes("UTF-8")));
  download.start("https://distribution.example/latest.json",running.identity,result);deliver(queue);
  if(failure[0]!=null||!"2.0.0".equals(version[0])||!"1.0.0".equals(running.version))throw new AssertionError("Update changed running snapshot",failure[0]);
  if(!"2.0.0".equals(store.coldStart(running.identity).version))throw new AssertionError("Downloaded version not promoted cold");
  store.rollback(running.identity);if(!"1.0.0".equals(store.coldStart(running.identity).version))throw new AssertionError("Downloaded rollback failed");
  File state=new File(new File(root,running.identity),"state.json");byte[] before=Files.readAllBytes(state.toPath());
  for(String rejected:new String[]{"tamper","origin","redirect","large-index"}){mode.set(rejected);failure[0]=null;download.start("https://distribution.example/latest.json",running.identity,result);deliver(queue);if(failure[0]==null||!java.util.Arrays.equals(before,Files.readAllBytes(state.toPath())))throw new AssertionError("Invalid download changed cache: "+rejected);}
  mode.set("slow");entered[0]=new CountDownLatch(2);release[0]=new CountDownLatch(1);
  PackageStore otherStore=new PackageStore(new File(root.getParentFile(),root.getName()+"-second"),key),thirdStore=new PackageStore(new File(root.getParentFile(),root.getName()+"-third"),key);
  PackageDownload other=new PackageDownload(otherStore,queue::offer,client),duplicate=new PackageDownload(store,queue::offer,client),third=new PackageDownload(thirdStore,queue::offer,client);
  download.start("https://distribution.example/latest.json",running.identity,result);other.start("https://distribution.example/latest.json",running.identity,result);
  if(!entered[0].await(8,TimeUnit.SECONDS))throw new AssertionError("Native workers did not start");
  reject(()->duplicate.start("https://distribution.example/latest.json",running.identity,result));reject(()->third.start("https://distribution.example/latest.json",running.identity,result));
  version[0]=null;download.close();other.close();release[0].countDown();deliver(queue);deliver(queue);
  if(version[0]!=null||!java.util.Arrays.equals(before,Files.readAllBytes(state.toPath())))throw new AssertionError("Retired owner staged late download");
  mode.set("valid");duplicate.start("https://distribution.example/latest.json",running.identity,result);deliver(queue);if(failure[0]!=null||!"2.0.0".equals(version[0]))throw new AssertionError("Admission not released",failure[0]);
  duplicate.close();third.close();
  System.out.println("PACKAGE_DOWNLOAD controlled-native passed cold-update rollback tamper origin redirect bounds quota retirement recovery");
 }
}
