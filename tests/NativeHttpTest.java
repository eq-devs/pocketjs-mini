package dev.pjm.android;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import android.util.Base64;
import org.json.*;
import okhttp3.*;

/** Controlled transport tests the real Android provider without TLS bypass. */
public final class NativeHttpTest {
  private static void require(boolean value){if(!value)throw new AssertionError("HTTP fixture failed");}
  private static JSONObject args(String path)throws Exception{return new JSONObject().put("url","https://example.com"+path);}
  public static void main(String[] arguments)throws Exception{
    JSONObject fixture=new JSONArray(new String(Files.readAllBytes(Paths.get(arguments[0])),StandardCharsets.UTF_8)).getJSONObject(0);
    VerifiedPackage source=new VerifiedPackage(Base64.decode(fixture.getString("payload"),Base64.DEFAULT),fixture.getJSONObject("manifest").toString().getBytes(StandardCharsets.UTF_8),Base64.decode(fixture.getString("key"),Base64.DEFAULT));
    CountDownLatch holds=new CountDownLatch(4);int[] redirects={0};
    OkHttpClient client=new OkHttpClient.Builder().addInterceptor(chain->{
      Request request=chain.request();String path=request.url().encodedPath(),location=null;int status=200;byte[] bytes="hello".getBytes(StandardCharsets.UTF_8);
      if(path.equals("/hold")){holds.countDown();while(!chain.call().isCanceled() && !Thread.currentThread().isInterrupted())try{Thread.sleep(5);}catch(InterruptedException stopped){break;}bytes=new byte[0];}
      if(path.equals("/big"))bytes=new byte[1537];
      if(path.equals("/resource-max"))bytes=new byte[ManagedResources.CAPACITY];
      if(path.equals("/resource-overflow"))bytes=new byte[ManagedResources.CAPACITY+1];
      if(path.equals("/stream-overflow"))return new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("fixture").body(new ResponseBody(){public MediaType contentType(){return null;}public long contentLength(){return -1;}public okio.BufferedSource source(){return new okio.Buffer().write(new byte[ManagedResources.CAPACITY+1]);}}).build();
      if(path.equals("/max")){bytes=new byte[1536];Arrays.fill(bytes,(byte)255);}
      if(path.equals("/denied")){status=302;location="https://denied.example/";}
      if(path.equals("/redirect")){status=302;location="https://example.com/final";}
      if(path.equals("/loop")){status=302;location="https://example.com/loop";}
      if(path.equals("/final")){require(request.header("Authorization")==null && request.header("Cookie")==null);redirects[0]++;}
      Response.Builder response=new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(status).message("fixture").body(ResponseBody.create(bytes,null));if(location!=null)response.header("Location",location);return response.build();
    }).build();
    try(VerifiedHttp http=new VerifiedHttp(client)){
      require(http.start(source,1,1,new JSONObject().put("url","https://denied.example/" )).getJSONObject("error").getString("code").equals("DENIED"));
      require(http.start(source,1,2,args("/").put("headers",new JSONObject().put("Accept","a").put("accept","b"))).getJSONObject("error").getString("code").equals("PROTOCOL"));
      require(http.start(source,1,3,args("/").put("method","POST").put("bodyBase64","Zh==")).getJSONObject("error").getString("code").equals("PROTOCOL"));
      require(http.start(source,1,10,args("/ok"))==null);require(http.start(source,1,11,args("/big"))==null);require(http.start(source,1,12,args("/denied"))==null);
      require(http.start(source,1,13,args("/redirect").put("headers",new JSONObject().put("Authorization","secret")))==null);
      require(http.start(source,1,14,args("/ok")).getJSONObject("error").getString("code").equals("BUSY"));
      Map<Long,JSONObject> replies=new HashMap<>();long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
      while(replies.size()<4 && System.nanoTime()<deadline){http.drain((bound,generation,reply)->{require(bound==source && generation==1);try{JSONObject value=new JSONObject(new String(reply,StandardCharsets.UTF_8));replies.put(value.getLong("id"),value);}catch(Exception invalid){throw new AssertionError(invalid);}return true;});Thread.sleep(5);}
      require(replies.size()==4 && replies.get(10L).getJSONObject("data").getString("bodyBase64").equals("aGVsbG8="));require(replies.get(11L).getJSONObject("error").getString("code").equals("FAILED"));require(replies.get(12L).getJSONObject("error").getString("code").equals("DENIED"));require(replies.get(13L).getBoolean("ok") && redirects[0]==1);
      require(http.start(source,2,19,args("/max"))==null);deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean[] maximum={false},maximumSeen={false};while(!maximum[0] && System.nanoTime()<deadline){http.drain((bound,generation,reply)->{try{JSONObject value=new JSONObject(new String(reply,StandardCharsets.UTF_8));require(reply.length<4096 && value.getBoolean("ok") && value.getJSONObject("data").getString("bodyBase64").length()==2048);if(!maximumSeen[0]){maximumSeen[0]=true;return false;}maximum[0]=true;}catch(Exception invalid){throw new AssertionError(invalid);}return true;});Thread.sleep(5);}require(maximum[0]);
      require(http.start(source,2,20,args("/loop"))==null);deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean[] denied={false};while(!denied[0] && System.nanoTime()<deadline){http.drain((bound,generation,reply)->{try{denied[0]=new JSONObject(new String(reply,StandardCharsets.UTF_8)).getJSONObject("error").getString("code").equals("DENIED");}catch(Exception invalid){throw new AssertionError(invalid);}return true;});Thread.sleep(5);}require(denied[0]);
      for(long id=30;id<34;id++)require(http.start(source,3,id,args("/hold"))==null);require(holds.await(5,TimeUnit.SECONDS));require(http.pending()==4);http.retire(999);require(http.pending()==4);http.cancel(3,30);http.cancel(3,30);require(http.pending()==3);http.retire(3);require(http.pending()==0);
      require(http.start(source,4,40,args("/ok"))==null);deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);boolean[] delivered={false};while(!delivered[0] && System.nanoTime()<deadline){http.drain((bound,generation,reply)->{require(bound==source && generation==4);delivered[0]=true;return true;});Thread.sleep(5);}require(delivered[0]);
      require(http.start(source,8,80,args("/big").put("responseMode","resource"))==null);
      final JSONObject[] resource={null};deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
      while(resource[0]==null && System.nanoTime()<deadline){http.drain((bound,generation,reply)->{try{JSONObject value=new JSONObject(new String(reply,StandardCharsets.UTF_8));require(generation==8 && value.getBoolean("ok"));resource[0]=value.getJSONObject("data").getJSONObject("resource");}catch(Exception invalid){throw new AssertionError(invalid);}return true;});Thread.sleep(5);}
      require(resource[0]!=null && resource[0].getInt("size")==1537);String handle=resource[0].getString("handle");require(handle.matches("r_[a-f0-9]{32}"));
      JSONObject range=new JSONObject().put("handle",handle).put("offset",0).put("count",1536);
      JSONObject chunk=(JSONObject)http.resourceRead(source.identity,8,range);require(chunk.getInt("nextOffset")==1536 && !chunk.getBoolean("eof") && Base64.decode(chunk.getString("bodyBase64"),Base64.NO_WRAP).length==1536);
      chunk=(JSONObject)http.resourceRead(source.identity,8,range.put("offset",1536));require(chunk.getInt("nextOffset")==1537 && chunk.getBoolean("eof") && chunk.getString("bodyBase64").equals("AA=="));
      chunk=(JSONObject)http.resourceRead(source.identity,8,range.put("offset",1537));require(chunk.getString("bodyBase64").isEmpty() && chunk.getBoolean("eof"));
      try{http.resourceRead(source.identity,9,range);throw new AssertionError("cross-generation handle");}catch(SecurityException expected){}
      try{http.resourceRead("dev.pjm.other",8,range);throw new AssertionError("cross-identity handle");}catch(SecurityException expected){}
      try{http.resourceRead(source.identity,8,range.put("offset",1538));throw new AssertionError("invalid range");}catch(IllegalArgumentException expected){}
      require(http.resourceRelease(source.identity,8,new JSONObject().put("handle",handle))==JSONObject.NULL);
      try{http.resourceRead(source.identity,8,range);throw new AssertionError("released handle");}catch(SecurityException expected){}
      for(int i=0;i<3;i++){
        String path=i==0?"/resource-max":i==1?"/resource-overflow":"/stream-overflow";require(http.start(source,9,90+i,args(path).put("responseMode","resource"))==null);
        final JSONObject[] response={null};deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(response[0]==null && System.nanoTime()<deadline){http.drain((bound,generation,reply)->{try{response[0]=new JSONObject(new String(reply,StandardCharsets.UTF_8));}catch(Exception invalid){throw new AssertionError(invalid);}return true;});Thread.sleep(5);}
        require(response[0]!=null);if(i==0){require(response[0].getBoolean("ok") && response[0].getJSONObject("data").getJSONObject("resource").getInt("size")==ManagedResources.CAPACITY);http.retire(9);try{http.resourceRead(source.identity,9,new JSONObject().put("handle",response[0].getJSONObject("data").getJSONObject("resource").getString("handle")).put("offset",0).put("count",1));throw new AssertionError("retired handle");}catch(SecurityException expected){}}else require(response[0].getJSONObject("error").getString("code").equals("FAILED"));
      }
      try(ManagedResources registry=new ManagedResources()){
        ManagedResources.Slot[] slots=new ManagedResources.Slot[4];for(int i=0;i<4;i++){slots[i]=registry.reserve(source.identity,10);require(slots[i]!=null);slots[i].finish(0);}require(registry.reserve(source.identity,10)==null);
        registry.retire(11);require(registry.reserve(source.identity,10)==null);registry.retire(10);
        ManagedResources.Slot slot=registry.reserve(source.identity,10);require(slot!=null);registry.discard(slot);slot.finish(-1);
      }
      long now=System.nanoTime();while(VerifiedHttp.admitRate(source.identity,now)){}
      JSONObject limited=http.start(source,5,50,args("/ok"));require(limited.getJSONObject("error").getString("message").contains("rate limit"));http.retire(5);require(http.start(source,6,60,args("/ok")).getJSONObject("error").getString("message").contains("rate limit"));
      http.close();http.close();
    }
    try(VerifiedHttp reopened=new VerifiedHttp(client)){require(reopened.start(source,7,70,args("/ok")).getJSONObject("error").getString("message").contains("rate limit"));}
    try(ManagedResources first=new ManagedResources();ManagedResources second=new ManagedResources()){
      ManagedResources.Slot[] slots=new ManagedResources.Slot[16];for(int i=0;i<16;i++){slots[i]=first.reserve(source.identity,100+i);require(slots[i]!=null);}
      require(second.reserve(source.identity,200)==null);first.discard(slots[0]);require(second.reserve(source.identity,200)==null);
      slots[0].finish(-1);ManagedResources.Slot replacement=second.reserve(source.identity,200);require(replacement!=null);replacement.finish(0);
      for(int i=1;i<16;i++)slots[i].finish(0);first.retire(101);ManagedResources.Slot fresh=second.reserve(source.identity,201);require(fresh!=null);fresh.finish(0);
    }
    long now=System.nanoTime();for(int i=0;i<32;i++)require(VerifiedHttp.admitRate("dev.pjm.rate",now));require(!VerifiedHttp.admitRate("dev.pjm.rate",now));require(!VerifiedHttp.admitRate("dev.pjm.rate",now+TimeUnit.SECONDS.toNanos(60)-1));require(VerifiedHttp.admitRate("dev.pjm.rate",now+TimeUnit.SECONDS.toNanos(60)));
    now+=TimeUnit.SECONDS.toNanos(121);for(int i=0;i<64;i++)require(VerifiedHttp.admitRate("dev.pjm.slot"+i,now));require(!VerifiedHttp.admitRate("dev.pjm.overflow",now));require(VerifiedHttp.admitRate("dev.pjm.slot0",now));require(VerifiedHttp.admitRate("dev.pjm.overflow",now+TimeUnit.SECONDS.toNanos(60)));
    System.out.println("Native Android HTTP: bounded responses, redirects, capacity, generation ownership, cancellation resource handles, chunk ranges, process accounting and rolling app rate limits passed");
  }
}
