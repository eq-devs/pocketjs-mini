package dev.pjm.android;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.*;
import java.util.concurrent.*;
import javax.net.ssl.*;
import org.json.*;
import android.util.Base64;
import okhttp3.*;

/** Real TLS transport with an explicitly trusted, temporary test CA only. */
public final class NativePackageDownloadTlsTest {
 private static void delivery(ConcurrentLinkedQueue<Runnable> queue)throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(40);while(System.nanoTime()<end){Runnable work=queue.poll();if(work!=null){work.run();return;}Thread.sleep(5);}throw new AssertionError("TLS completion missing");}
 private static boolean handshake(Throwable error){for(Throwable value=error;value!=null;value=value.getCause())if(value instanceof SSLHandshakeException)return true;return false;}
 public static void main(String[] args)throws Exception {
  JSONObject item=new JSONArray(new String(Files.readAllBytes(Paths.get(args[0])),"UTF-8")).getJSONObject(0);
  byte[] payload=Base64.decode(item.getString("payload"),Base64.DEFAULT),envelope=item.getJSONObject("manifest").toString().getBytes("UTF-8"),key=Base64.decode(item.getString("key"),Base64.DEFAULT);
  File root=new File(new File(args[0]).getParentFile(),"tls-cache");PackageStore store=new PackageStore(root,key);store.seed(payload,envelope);VerifiedPackage running=store.coldStart("dev.pjm.fixture");
  ConcurrentLinkedQueue<Runnable> queue=new ConcurrentLinkedQueue<>();Exception[] failure={null};String[] version={null};
  PackageDownload.Listener result=(value,error)->{version[0]=value;failure[0]=error;};
  PackageDownload system=new PackageDownload(store,queue::offer);system.start(args[1]+"/latest.json",running.identity,result);delivery(queue);system.close();
  if(!handshake(failure[0]))throw new AssertionError("System trust did not reject the test certificate",failure[0]);
  java.security.cert.Certificate certificate;try(InputStream input=new FileInputStream(args[2])){certificate=CertificateFactory.getInstance("X.509").generateCertificate(input);}
  KeyStore trust=KeyStore.getInstance(KeyStore.getDefaultType());trust.load(null,null);trust.setCertificateEntry("owned-test-ca",certificate);
  TrustManagerFactory factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());factory.init(trust);X509TrustManager manager=null;for(TrustManager value:factory.getTrustManagers())if(value instanceof X509TrustManager)manager=(X509TrustManager)value;if(manager==null)throw new AssertionError("Test trust manager unavailable");
  SSLContext context=SSLContext.getInstance("TLS");context.init(null,new TrustManager[]{manager},null);
  OkHttpClient client=new OkHttpClient.Builder().sslSocketFactory(context.getSocketFactory(),manager).build();
  PackageDownload download=new PackageDownload(store,queue::offer,client);failure[0]=null;download.start(args[1]+"/latest.json",running.identity,result);delivery(queue);
  if(failure[0]!=null||!"2.0.0".equals(version[0])||!"1.0.0".equals(running.version))throw new AssertionError("TLS update failed or replaced running snapshot",failure[0]);
  if(!"2.0.0".equals(new PackageStore(root,key).coldStart(running.identity).version))throw new AssertionError("TLS update not promoted after cache reopen");
  store.rollback(running.identity);if(!"1.0.0".equals(store.coldStart(running.identity).version))throw new AssertionError("TLS rollback failed");
  Path state=new File(new File(root,running.identity),"state.json").toPath();byte[] before=Files.readAllBytes(state);
  for(String path:new String[]{"/tamper/latest.json","/redirect/latest.json","/duplicate/latest.json","/oversize/latest.json"}){
   failure[0]=null;download.start(args[1]+path,running.identity,result);delivery(queue);
   if(failure[0]==null||!java.util.Arrays.equals(before,Files.readAllBytes(state)))throw new AssertionError("Invalid TLS download changed selection: "+path);
  }
  download.close();
  System.out.println("PACKAGE_DOWNLOAD_TLS passed system-trust-rejected explicit-test-ca cold-update rollback tamper redirect duplicate streamed-limit");
 }
}
