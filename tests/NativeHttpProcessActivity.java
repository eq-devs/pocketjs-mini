package dev.pjm.android;

import android.app.Activity;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.graphics.*;
import android.widget.TextView;
import android.util.Base64;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.*;
import org.json.*;
import okhttp3.*;

/** Real default-trust HTTPS workers sharing the shipping process resource cap. */
public final class NativeHttpProcessActivity extends Activity {
  private static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
  private final AtomicInteger active=new AtomicInteger(),peak=new AtomicInteger(),started=new AtomicInteger(),ended=new AtomicInteger(),headers=new AtomicInteger(),tls=new AtomicInteger();
  private final Set<Long> workerThreads=Collections.synchronizedSet(new HashSet<>());
  private int nativeRetirements,cleanupRecords,verifiedGuestReplies,staleContainerPostDenials;
  private VerifiedMedia[] mixedMedia;
  private volatile MixedGate mixedGate;
  private int mixedHttpResponses,mixedJpegResponses,mixedCapacityDenials;
  private final AtomicInteger mixedStops=new AtomicInteger();
  private final Set<Long> mediaThreads=Collections.synchronizedSet(new HashSet<>());
  private static final class MixedGate {
    final CountDownLatch httpReady=new CountDownLatch(12),mediaReady=new CountDownLatch(4),release=new CountDownLatch(1);
    final Set<Call> calls=Collections.synchronizedSet(new HashSet<>());
    final Set<CancellationSignal> signals=Collections.synchronizedSet(new HashSet<>());
  }
  private volatile boolean cancellationPhase;
  private final CountDownLatch parkedHeaders=new CountDownLatch(16),releaseHeaders=new CountDownLatch(1);
  private final Set<Call> parkedCalls=Collections.synchronizedSet(new HashSet<>());
  private okhttp3.EventListener listener(){return new okhttp3.EventListener(){
    private final AtomicBoolean finished=new AtomicBoolean();
    public void callStart(Call call){require(Thread.currentThread().getName().equals("pjm-http"),"Call did not run on a production HTTP worker");workerThreads.add(Thread.currentThread().getId());started.incrementAndGet();int count=active.incrementAndGet(),old;do{old=peak.get();if(count<=old)break;}while(!peak.compareAndSet(old,count));}
    private void finish(){if(finished.compareAndSet(false,true)){active.decrementAndGet();ended.incrementAndGet();}}
    public void callEnd(Call call){finish();}
    public void callFailed(Call call,IOException failure){finish();}
    public void requestHeadersEnd(Call call,Request request){headers.incrementAndGet();}
    public void secureConnectEnd(Call call,Handshake handshake){if(handshake!=null)tls.incrementAndGet();}
    public void responseHeadersEnd(Call call,Response response){
      MixedGate gate=mixedGate;
      if(gate!=null){
        require(response.code()==200,"Mixed phase HTTPS status");gate.calls.add(call);gate.httpReady.countDown();
        try{require(gate.release.await(30,TimeUnit.SECONDS),"Mixed HTTP observer timed out");}catch(InterruptedException failure){Thread.currentThread().interrupt();throw new IllegalStateException(failure);}return;
      }
      if(!cancellationPhase)return;
      require(response.code()==200,"Cancellation phase did not reach real HTTPS 200 headers");
      parkedCalls.add(call);parkedHeaders.countDown();
      try{require(releaseHeaders.await(30,TimeUnit.SECONDS),"Cancellation observer gate timed out");}
      catch(InterruptedException failure){Thread.currentThread().interrupt();throw new IllegalStateException(failure);}
    }
  };}
  private byte[] asset(String name)throws Exception{
    try(InputStream input=getAssets().open(name);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1){require(bytes.size()+n<=4*1024*1024,"Fixture byte limit");bytes.write(buffer,0,n);}return bytes.toByteArray();
    }
  }
  private VerifiedPackage[] packages()throws Exception{
    JSONObject base=new JSONArray(new String(asset("cases.json"),StandardCharsets.UTF_8)).getJSONObject(0);JSONArray peers=base.getJSONArray("peers");require(peers.length()==3,"Three signed peers required");
    byte[] key=Base64.decode(base.getString("key"),Base64.DEFAULT);VerifiedPackage[] result=new VerifiedPackage[4];Set<String> identities=new HashSet<>();
    for(int i=0;i<4;i++){JSONObject item=i==0?base:peers.getJSONObject(i-1);result[i]=new VerifiedPackage(Base64.decode(item.getString("payload"),Base64.DEFAULT),item.getJSONObject("manifest").toString().getBytes(StandardCharsets.UTF_8),key);require(identities.add(result[i].identity),"Duplicate authenticated identity");}
    return result;
  }
  private static JSONObject arguments()throws Exception{return new JSONObject().put("url","https://example.com/").put("responseMode","resource");}
  private static JSONObject read(String handle,int offset,int count)throws Exception{return new JSONObject().put("handle",handle).put("offset",offset).put("count",count);}
  private static void denied(ManagedResources owner,String identity,long generation,String handle)throws Exception{
    try{owner.read(identity,generation,read(handle,0,1));throw new AssertionError("Foreign or retired handle readable");}catch(SecurityException expected){}
    try{owner.release(identity,generation,new JSONObject().put("handle",handle));throw new AssertionError("Foreign or retired handle released");}catch(SecurityException expected){}
  }
  private static String body(ManagedResources owner,String identity,long generation,JSONObject resource)throws Exception{
    String handle=resource.getString("handle");int size=resource.getInt("size"),offset=0;require(size>0&&size<=ManagedResources.CAPACITY,"Response size outside bounds");ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    while(offset<size){JSONObject chunk=owner.read(identity,generation,read(handle,offset,1536));require(chunk.getInt("size")==size&&chunk.getInt("offset")==offset,"Resource metadata changed");byte[] data=Base64.decode(chunk.getString("bodyBase64"),Base64.DEFAULT);int next=chunk.getInt("nextOffset");require(next>offset&&next-offset==data.length&&next<=size,"Resource did not advance");bytes.write(data);offset=next;}
    return new String(bytes.toByteArray(),StandardCharsets.UTF_8);
  }
  private void stalePostDenied(VerifiedContainer container,String identity,long generation){
    try{container.post(identity,generation,"{\"v\":1,\"id\":1,\"ok\":true,\"data\":null}".getBytes(StandardCharsets.UTF_8));throw new AssertionError("Retired native container accepted completion");}catch(IllegalArgumentException expected){staleContainerPostDenials++;}
  }
  private void retireAndReopen(VerifiedContainer container,VerifiedPackage value,long[] generations,int index)throws Exception {
    long previous=generations[index];container.closeIdentity(value.identity);stalePostDenied(container,value.identity,previous);
    require(container.lastCleanupError()==null,"Guest unload storage cleanup failed");
    require(new AppStorage(getFilesDir(),value.identity).dispatch("storage.get.v1",new JSONObject().put("key","cleanup-proof")).equals("saved"),"Native guest unload did not persist cleanup record");
    generations[index]=container.activate(value,"{}".getBytes(StandardCharsets.UTF_8));require(generations[index]>previous,"Native generation did not advance");stalePostDenied(container,value.identity,previous);
  }
  private void verifyGuestReplies(VerifiedContainer container,JSONObject[] expected)throws Exception {
    container.frame(new int[0],new int[0],new byte[0]);
    String effects=new String(container.effects(),StandardCharsets.UTF_8);Set<Integer> seen=new HashSet<>();boolean framed=false;
    for(String line:effects.split("\n")){
      if(line.startsWith("verified:"))framed=true;
      else if(line.startsWith("reply:")){
        JSONObject reply=new JSONObject(line.substring(6));int id=reply.getInt("id");require(id>=1&&id<=4&&seen.add(id)&&reply.toString().equals(expected[id-1].toString()),"Native guest observed wrong HTTP completion");verifiedGuestReplies++;
      }else require(line.isEmpty(),"Unexpected native guest effect: "+line);
    }
    require(framed&&seen.size()==4,"Native guest did not consume all four HTTP responses");
  }
  @SuppressWarnings("unchecked")
  private void cancelInFlight(VerifiedPackage[] packages,ManagedResources[] resources,VerifiedHttp[] http,VerifiedHttp probe,VerifiedContainer[] containers,long[] generations)throws Exception {
    final long generation=generations[0];for(long current:generations)require(current==generation,"Cancellation generation coverage diverged");
    cancellationPhase=true;
    ArrayList<ManagedResources.Slot> held=new ArrayList<>();
    try {
      for(int i=0;i<4;i++)for(int id=1;id<=4;id++)require(http[i].start(packages[i],generation,id,arguments())==null,"Cancellation-phase request not admitted");
      require(parkedHeaders.await(25,TimeUnit.SECONDS),"Sixteen real HTTPS responses did not reach observer gate");
      require(parkedCalls.size()==16&&active.get()==16,"Cancellation did not cover sixteen active production calls");
      // Observe existing private registry tokens only; do not create substitute producers.
      java.lang.reflect.Field field=ManagedResources.class.getDeclaredField("slots");field.setAccessible(true);
      for(int i=0;i<4;i++){
        Collection<ManagedResources.Slot> slots=((Map<String,ManagedResources.Slot>)field.get(resources[i])).values();require(slots.size()==4,"Missing in-flight resource tokens");held.addAll(slots);
        retireAndReopen(containers[i],packages[i],generations,i);require(http[i].pending()==0,"Retired HTTP tasks remain pending");
      }
      for(Call call:parkedCalls)require(call.isCanceled(),"Native retirement did not cancel real HTTP call");
      for(ManagedResources.Slot slot:held){
        synchronized(slot){require(slot.bytes!=null&&!slot.ready,"Cancelled in-flight producer lost buffer accounting early");}
        for(int i=0;i<4;i++){denied(resources[i],packages[i].identity,generation,slot.handle);denied(resources[i],packages[i].identity,generations[i],slot.handle);}
      }
      JSONObject refused=probe.start(packages[0],99,90,arguments());require(refused!=null&&refused.getJSONObject("error").getString("message").equals("Resource capacity exceeded"),"Cancelled producers released process capacity before worker exit");
    }finally{releaseHeaders.countDown();}
    long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);boolean released=false;
    while(System.nanoTime()<deadline){released=held.size()==16;for(ManagedResources.Slot slot:held)synchronized(slot){if(slot.bytes!=null)released=false;}if(released&&active.get()==0)break;Thread.sleep(5);}
    require(released&&active.get()==0,"Cancelled real producers did not release all buffers after exit");
    for(VerifiedHttp owner:http)owner.drain((source,completedGeneration,bytes)->{throw new AssertionError("Retired producer posted a late completion");});
    cancellationPhase=false;
  }
  private static byte[] mixedImage(){
    Bitmap bitmap=Bitmap.createBitmap(320,160,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.RED);ByteArrayOutputStream bytes=new ByteArrayOutputStream();try{require(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes),"Synthetic provider PNG encoding failed");return bytes.toByteArray();}finally{bitmap.recycle();}
  }
  private static byte[] resourceBytes(ManagedResources owner,String identity,long generation,JSONObject resource)throws Exception {
    int size=resource.getInt("size"),offset=0;require(size>0&&size<=ManagedResources.CAPACITY,"Mixed resource size");ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    while(offset<size){JSONObject part=owner.read(identity,generation,read(resource.getString("handle"),offset,1536));byte[] chunk=Base64.decode(part.getString("bodyBase64"),Base64.DEFAULT);int next=part.getInt("nextOffset");require(next==offset+chunk.length&&next>offset&&next<=size&&part.getInt("size")==size,"Mixed bounded read changed");bytes.write(chunk);offset=next;}return bytes.toByteArray();
  }
  private void mixedProbe(VerifiedHttp probe,VerifiedPackage value,int id)throws Exception {
    JSONObject reply=probe.start(value,99,id,arguments());require(reply!=null&&reply.getJSONObject("error").getString("code").equals("BUSY")&&reply.getJSONObject("error").getString("message").equals("Resource capacity exceeded"),"Mixed process cap was not enforced");mixedCapacityDenials++;
  }
  @SuppressWarnings("unchecked")
  private void mixedStress(VerifiedPackage[] packages,ManagedResources[] resources,VerifiedHttp[] http,VerifiedHttp probe,VerifiedContainer[] containers,long[] generations)throws Exception {
    final byte[] image=mixedImage();mixedMedia=new VerifiedMedia[4];
    for(int i=0;i<4;i++){
      final int owner=i;mixedMedia[i]=new VerifiedMedia(resources[i],new VerifiedMedia.UI(){
        public void execute(Runnable work){runOnUiThread(work);}
        public Runnable select(VerifiedPackage value,MediaContract.Options options,VerifiedMedia.Completion completion){
          require(value==packages[owner],"Mixed provider crossed signed identity");final MixedGate gate=mixedGate;require(gate!=null,"Missing mixed media gate");
          completion.complete(cancellation->{
            require(Thread.currentThread().getName().equals("pjm-media"),"Image source did not run on shipping media worker");mediaThreads.add(Thread.currentThread().getId());gate.signals.add(cancellation);gate.mediaReady.countDown();
            require(gate.release.await(30,TimeUnit.SECONDS),"Mixed media source observer timed out");cancellation.throwIfCanceled();return new ByteArrayInputStream(image);
          },null);return mixedStops::incrementAndGet;
        }
      });
    }
    java.lang.reflect.Field field=ManagedResources.class.getDeclaredField("slots");field.setAccessible(true);
    for(int phase=0;phase<3;phase++){
      MixedGate gate=new MixedGate();mixedGate=gate;long generation=generations[0];for(long current:generations)require(current==generation,"Mixed generations diverged");
      try{
        for(int i=0;i<4;i++){
          for(int request=201;request<=203;request++)require(http[i].start(packages[i],generation,request,arguments())==null,"Mixed HTTP admission failed");
          require(mixedMedia[i].start(packages[i],generation,300+i,new JSONObject().put("source","library").put("maxDimension",64).put("quality",80))==null,"Mixed media admission failed");
        }
        require(gate.httpReady.await(25,TimeUnit.SECONDS)&&gate.mediaReady.await(10,TimeUnit.SECONDS),"Mixed real workers did not reach both gates");
        require(gate.calls.size()==12&&gate.signals.size()==4&&active.get()==12,"Mixed HTTP/media worker overlap incomplete");mixedProbe(probe,packages[0],500+phase*2);
        if(phase==1){
          ArrayList<ManagedResources.Slot> held=new ArrayList<>();for(int i=0;i<4;i++){Collection<ManagedResources.Slot> slots=((Map<String,ManagedResources.Slot>)field.get(resources[i])).values();require(slots.size()==4,"Mixed token quota changed");held.addAll(slots);retireAndReopen(containers[i],packages[i],generations,i);require(http[i].pending()==0,"Mixed HTTP survived native retirement");}
          for(Call call:gate.calls)require(call.isCanceled(),"Mixed real HTTP not cancelled");for(CancellationSignal signal:gate.signals)require(signal.isCanceled(),"Mixed real media worker not cancelled");
          for(ManagedResources.Slot slot:held){synchronized(slot){require(slot.bytes!=null&&!slot.ready,"Mixed cancelled producer freed its buffer early");}for(int i=0;i<4;i++){denied(resources[i],packages[i].identity,generation,slot.handle);denied(resources[i],packages[i].identity,generations[i],slot.handle);}}
          mixedProbe(probe,packages[0],501+phase*2);gate.release.countDown();
          long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);boolean released=false;
          while(System.nanoTime()<deadline){released=true;for(ManagedResources.Slot slot:held)synchronized(slot){if(slot.bytes!=null)released=false;}if(released&&active.get()==0)break;Thread.sleep(5);}
          require(released&&active.get()==0,"Mixed retired producers leaked buffers");
          for(int i=0;i<4;i++){http[i].drain((source,gen,bytes)->{throw new AssertionError("Late mixed HTTP completion");});mixedMedia[i].drain((source,gen,bytes)->{throw new AssertionError("Late mixed media completion");});}
        }else{
          gate.release.countDown();final JSONObject[][] replies=new JSONObject[4][4];final int[] count={0};long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(25);
          while(count[0]<16&&System.nanoTime()<deadline){for(int i=0;i<4;i++){
            final int owner=i;http[i].drain((source,gen,bytes)->{try{JSONObject reply=new JSONObject(new String(bytes,StandardCharsets.UTF_8));int id=reply.getInt("id"),index=id-201;require(source==packages[owner]&&gen==generation&&index>=0&&index<3&&replies[owner][index]==null&&reply.getBoolean("ok")&&reply.getJSONObject("data").getInt("status")==200,"Mixed HTTP completion binding");replies[owner][index]=reply;count[0]++;mixedHttpResponses++;return true;}catch(Exception failure){throw new IllegalStateException(failure);}});
            mixedMedia[i].drain((source,gen,bytes)->{try{JSONObject reply=new JSONObject(new String(bytes,StandardCharsets.UTF_8));require(source==packages[owner]&&gen==generation&&reply.getInt("id")==300+owner&&replies[owner][3]==null&&reply.getBoolean("ok"),"Mixed media completion binding: "+reply);JSONObject data=reply.getJSONObject("data");require(data.getString("mime").equals("image/jpeg")&&data.getInt("width")==64&&data.getInt("height")==32,"Mixed image normalization changed");replies[owner][3]=reply;count[0]++;mixedJpegResponses++;return true;}catch(Exception failure){throw new IllegalStateException(failure);}});
          }Thread.sleep(5);}require(count[0]==16,"Mixed completion timeout");mixedProbe(probe,packages[0],501+phase*2);
          Set<String> handles=new HashSet<>();for(int i=0;i<4;i++)for(int request=0;request<4;request++){
            JSONObject resource=replies[i][request].getJSONObject("data").getJSONObject("resource");String handle=resource.getString("handle");require(handles.add(handle),"Mixed resource handle collision");byte[] bytes=resourceBytes(resources[i],packages[i].identity,generation,resource);
            if(request<3)require(new String(bytes,StandardCharsets.UTF_8).contains("Example Domain"),"Mixed HTTPS body changed");
            else {require(bytes.length>=3&&(bytes[0]&255)==255&&(bytes[1]&255)==216&&(bytes[2]&255)==255,"Mixed JPEG marker missing");Bitmap decoded=BitmapFactory.decodeByteArray(bytes,0,bytes.length);require(decoded!=null,"Mixed JPEG could not decode");try{int pixel=decoded.getPixel(32,16);require(decoded.getWidth()==64&&decoded.getHeight()==32&&Color.red(pixel)>=240&&Color.green(pixel)<=15&&Color.blue(pixel)<=15,"Mixed JPEG dimensions or pixels changed");}finally{decoded.recycle();}}
            for(int other=0;other<4;other++)if(other!=i){denied(resources[i],packages[other].identity,generation,handle);denied(resources[other],packages[other].identity,generation,handle);}
            require(Arrays.equals(bytes,resourceBytes(resources[i],packages[i].identity,generation,resource)),"Foreign mixed release changed owner bytes");
          }
          for(int i=0;i<4;i++)for(int request=0;request<4;request++){String handle=replies[i][request].getJSONObject("data").getJSONObject("resource").getString("handle");resources[i].release(packages[i].identity,generation,new JSONObject().put("handle",handle));denied(resources[i],packages[i].identity,generation,handle);}
        }
      }finally{gate.release.countDown();mixedGate=null;}
    }
    long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(mixedStops.get()<12&&System.nanoTime()<deadline)Thread.sleep(5);
    require(mixedHttpResponses==24&&mixedJpegResponses==8&&mixedCapacityDenials==6&&mixedStops.get()==12&&mediaThreads.size()>=4,"Mixed worker accounting incomplete");
  }
  private JSONObject test()throws Exception{
    VerifiedContainer[] containers=new VerifiedContainer[4];long[] generations=new long[4];
    VerifiedPackage[] packages=packages();ManagedResources[] resources=new ManagedResources[4];VerifiedHttp[] http=new VerifiedHttp[4];ManagedResources probeResources=new ManagedResources();VerifiedHttp probe=null;
    // Normal platform/transport; the cancellation phase delays only an event observer.
    OkHttp.INSTANCE.initialize(getApplicationContext());
    long totalBytes=0;int successful=0,globalDenials=0;Set<String> handles=new HashSet<>();
    try{
      for(int i=0;i<4;i++){resources[i]=new ManagedResources();http[i]=new VerifiedHttp(new OkHttpClient.Builder().eventListenerFactory(call->listener()).build(),resources[i]);}
      probe=new VerifiedHttp(new OkHttpClient(),probeResources);
      for(int i=0;i<4;i++){
        final int owner=i;containers[i]=new VerifiedContainer(getFilesDir(),new VerifiedContainer.Listener(){
          public void cleanup(VerifiedPackage value,long gen,byte[] record){require(value==packages[owner],"Native cleanup crossed authenticated owner");if(new String(record,StandardCharsets.UTF_8).equals("cleanup"))cleanupRecords++;}
          public void retired(VerifiedPackage value,long gen){require(value==packages[owner]&&gen==generations[owner],"Native retirement crossed owner or generation");http[owner].retire(gen);if(mixedMedia!=null&&mixedMedia[owner]!=null)mixedMedia[owner].retire(gen);resources[owner].retire(gen);nativeRetirements++;}
        });generations[i]=containers[i].activate(packages[i],"{}".getBytes(StandardCharsets.UTF_8));require(generations[i]>0,"Native signed guest activation failed");
      }
      for(int wave=1;wave<=2;wave++){
        final long generation=generations[0];for(long current:generations)require(current==generation,"Wave native generations diverged");final JSONObject[][] replies=new JSONObject[4][4];final int[] delivered={0};
        for(int i=0;i<4;i++)for(int request=1;request<=4;request++)require(http[i].start(packages[i],generation,request,arguments())==null,"Resource request not admitted");
        JSONObject refused=probe.start(packages[0],99,10+wave,arguments());require(refused!=null&&refused.getJSONObject("error").getString("code").equals("BUSY")&&refused.getJSONObject("error").getString("message").equals("Resource capacity exceeded"),"Seventeenth process resource admitted or wrong limit tested");globalDenials++;
        long deadline=System.nanoTime()+35_000_000_000L;
        while(delivered[0]<16&&System.nanoTime()<deadline){
          for(int i=0;i<4;i++){
            final int owner=i;http[i].drain((source,actualGeneration,bytes)->{
              try{JSONObject reply=new JSONObject(new String(bytes,StandardCharsets.UTF_8));int id=reply.getInt("id");require(source==packages[owner]&&actualGeneration==generation&&id>=1&&id<=4&&replies[owner][id-1]==null,"HTTP completion crossed owner or generation");require(reply.getBoolean("ok"),"Actual HTTPS failed: "+reply);require(reply.getJSONObject("data").getInt("status")==200,"Unexpected HTTPS status");containers[owner].post(source.identity,actualGeneration,bytes);replies[owner][id-1]=reply;delivered[0]++;return true;}catch(Exception failure){throw new IllegalStateException(failure);}
            });
          }
          Thread.sleep(5);
        }
        require(delivered[0]==16,"Actual HTTPS completion timeout");
        refused=probe.start(packages[0],99,20+wave,arguments());require(refused!=null&&refused.getJSONObject("error").getString("message").equals("Resource capacity exceeded"),"Completed resources did not retain process slots");globalDenials++;
        for(int i=0;i<4;i++){
          require(http[i].pending()==0,"Completed tasks not drained");verifyGuestReplies(containers[i],replies[i]);
          for(int request=0;request<4;request++){
            JSONObject resource=replies[i][request].getJSONObject("data").getJSONObject("resource");String handle=resource.getString("handle");require(handles.add(handle),"Handle reused across live waves");
            String original=body(resources[i],packages[i].identity,generation,resource);require(original.contains("Example Domain"),"Wrong real HTTPS body");totalBytes+=resource.getInt("size");successful++;
            for(int other=0;other<4;other++)if(other!=i){denied(resources[i],packages[other].identity,generation,handle);denied(resources[other],packages[other].identity,generation,handle);}
            require(body(resources[i],packages[i].identity,generation,resource).equals(original),"Foreign release changed response");
          }
        }
        if(wave==1){for(int i=0;i<4;i++)retireAndReopen(containers[i],packages[i],generations,i);}
        else for(int i=0;i<4;i++)for(int request=0;request<4;request++){String handle=replies[i][request].getJSONObject("data").getJSONObject("resource").getString("handle");resources[i].release(packages[i].identity,generation,new JSONObject().put("handle",handle));}
        for(int i=0;i<4;i++)for(int request=0;request<4;request++){String handle=replies[i][request].getJSONObject("data").getJSONObject("resource").getString("handle");denied(resources[i],packages[i].identity,generation,handle);denied(resources[i],packages[i].identity,generation+1,handle);}
        if(wave==1)cancelInFlight(packages,resources,http,probe,containers,generations);
      }
      mixedStress(packages,resources,http,probe,containers,generations);
      require(successful==32&&started.get()==84&&ended.get()==84&&headers.get()==84&&active.get()==0&&tls.get()>0,"Actual HTTP worker accounting incomplete");require(peak.get()==16&&workerThreads.size()>=16,"Sixteen simultaneous real HTTP workers were not observed");
      require(nativeRetirements==12&&cleanupRecords==12&&verifiedGuestReplies==32&&staleContainerPostDenials==24,"Native container lifecycle coverage incomplete");
      return new JSONObject().put("nativeGenerationRetirements",nativeRetirements).put("nativeGuestCleanupRecords",cleanupRecords).put("verifiedGuestReplies",verifiedGuestReplies).put("staleContainerPostDenials",staleContainerPostDenials).put("mixedSuccessfulHttpsResponses",mixedHttpResponses).put("mixedJpegResponses",mixedJpegResponses).put("mixedInFlightHttpRetirements",12).put("mixedInFlightMediaRetirements",4).put("mixedResourceCapacityDenials",mixedCapacityDenials).put("mixedPeakHttpWorkers",12).put("mixedPeakMediaWorkers",4).put("mixedStages",3).put("syntheticMediaProvider",true).put("authenticatedIdentities",4).put("waves",2).put("actualHttpsResponses",successful).put("responseBytesRead",totalBytes).put("peakActiveHttpCalls",peak.get()).put("productionWorkerThreadsObserved",workerThreads.size()).put("tlsHandshakes",tls.get()).put("requestHeadersSent",headers.get()).put("globalResourceDenials",globalDenials).put("inFlightHttpsRetirements",16).put("cancelledProducerCapacityDenials",1).put("lateRetiredCompletions",0).put("controlledTiming",true).put("retiredGeneration",1).put("releasedResources",16).put("processCap",16).put("defaultTlsTrust",true).put("controlledTransport",false).put("foreignReadAndReleaseDenied",true);
    }finally{releaseHeaders.countDown();if(mixedGate!=null)mixedGate.release.countDown();if(probe!=null)probe.close();probeResources.close();for(int i=0;i<4;i++){if(containers[i]!=null)containers[i].close();if(mixedMedia!=null&&mixedMedia[i]!=null)mixedMedia[i].close();if(http[i]!=null)http[i].close();if(resources[i]!=null)resources[i].close();}}
  }
  @Override public void onCreate(Bundle state){super.onCreate(state);TextView receipt=new TextView(this);receipt.setText("Actual HTTPS resource contention running");setContentView(receipt);new Thread(()->{String result;try{result="native-http-process PASS "+test();}catch(Throwable failure){android.util.Log.e("PocketJS","Actual HTTP contention failed",failure);result="native-http-process FAIL "+failure;}final String proof=result;runOnUiThread(()->{receipt.setText(proof);receipt.setContentDescription(proof);});},"pjm-http-process-owner").start();}
}
