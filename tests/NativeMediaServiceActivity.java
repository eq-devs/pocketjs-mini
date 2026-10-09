package dev.pjm.android;
import android.app.Activity;
import android.os.Bundle;
import android.graphics.*;
import android.widget.TextView;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public final class NativeMediaServiceActivity extends Activity {
 private static void require(boolean value){if(!value)throw new AssertionError("Native media service assertion");}
 private JSONObject args()throws Exception{return new JSONObject().put("source","library").put("maxDimension",64).put("quality",80);}
 private byte[] asset(String name)throws Exception{try(InputStream input=getAssets().open(name);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int size;while((size=input.read(buffer))!=-1)bytes.write(buffer,0,size);return bytes.toByteArray();}}
 private static byte[] png(){Bitmap bitmap=Bitmap.createBitmap(320,160,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.RED);ByteArrayOutputStream bytes=new ByteArrayOutputStream();require(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes));bitmap.recycle();return bytes.toByteArray();}
 private static JSONObject drain(VerifiedMedia media)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicReference<JSONObject> reply=new AtomicReference<>();while(System.nanoTime()<end){media.drain((value,generation,bytes)->{try{reply.set(new JSONObject(new String(bytes,"UTF-8")));return true;}catch(Exception failed){throw new IllegalStateException(failed);}});if(reply.get()!=null)return reply.get();Thread.sleep(5);}throw new AssertionError("Media completion timed out");}
 private void test()throws Exception{
  JSONObject fixture=new JSONArray(new String(asset("cases.json"),"UTF-8")).getJSONObject(0);VerifiedPackage value=new VerifiedPackage(Base64.decode(fixture.getString("payload"),Base64.DEFAULT),fixture.getJSONObject("manifest").toString().getBytes("UTF-8"),Base64.decode(fixture.getString("key"),Base64.DEFAULT));
  ManagedResources resources=new ManagedResources();AtomicReference<VerifiedMedia.Completion> callback=new AtomicReference<>();AtomicInteger stops=new AtomicInteger();
  VerifiedMedia media=new VerifiedMedia(resources,new VerifiedMedia.UI(){public void execute(Runnable work){runOnUiThread(work);}public Runnable select(VerifiedPackage source,MediaContract.Options options,VerifiedMedia.Completion completion){callback.set(completion);return stops::incrementAndGet;}});
  ManagedResources.Slot[] held=new ManagedResources.Slot[3];for(int i=0;i<3;i++){held[i]=resources.reserve(value.identity,1);held[i].bytes[0]=42;held[i].finish(1);}
  require(media.start(value,1,1,args())==null);require(media.start(value,1,2,args()).getJSONObject("error").getString("code").equals("BUSY"));require(resources.reserve(value.identity,1)==null);
  long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(callback.get()==null&&System.nanoTime()<deadline)Thread.sleep(5);require(callback.get()!=null);byte[] image=png();callback.get().complete(cancellation->new ByteArrayInputStream(image),null);
  JSONObject reply=drain(media);require(reply.getBoolean("ok"));JSONObject data=reply.getJSONObject("data"),resource=data.getJSONObject("resource");require(data.getInt("width")==64&&data.getInt("height")==32&&data.getString("mime").equals("image/jpeg"));String handle=resource.getString("handle");JSONObject read=new JSONObject().put("handle",handle).put("offset",0).put("count",1536);require(resources.read(value.identity,1,read).getString("bodyBase64").startsWith("/9j/"));
  try{resources.read(value.identity,2,read);throw new AssertionError("Generation crossed");}catch(SecurityException expected){}try{resources.read("dev.pjm.other",1,read);throw new AssertionError("Identity crossed");}catch(SecurityException expected){}
  media.close();require(resources.read(value.identity,1,new JSONObject().put("handle",held[0].handle).put("offset",0).put("count",1)).getString("bodyBase64").equals("Kg=="));resources.release(value.identity,1,new JSONObject().put("handle",handle));
  callback.set(null);media=new VerifiedMedia(resources,new VerifiedMedia.UI(){public void execute(Runnable work){runOnUiThread(work);}public Runnable select(VerifiedPackage source,MediaContract.Options options,VerifiedMedia.Completion completion){callback.set(completion);return stops::incrementAndGet;}});
  require(media.start(value,1,3,args())==null);deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(callback.get()==null&&System.nanoTime()<deadline)Thread.sleep(5);require(callback.get()!=null);VerifiedMedia.Completion late=callback.get();media.cancel(1,3);AtomicInteger opened=new AtomicInteger();late.complete(cancellation->{opened.incrementAndGet();return new ByteArrayInputStream(image);},null);Thread.sleep(30);require(opened.get()==0);
  callback.set(null);require(media.start(value,1,4,args())==null);deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(callback.get()==null&&System.nanoTime()<deadline)Thread.sleep(5);require(callback.get()!=null);
  callback.get().complete(cancellation->new InputStream(){int left=MediaContract.SOURCE_BYTES+1;public int read(){return left-->0?1:-1;}public int read(byte[] bytes,int offset,int count){if(left<=0)return -1;int size=Math.min(left,count);left-=size;return size;}},null);require(drain(media).getJSONObject("error").getString("code").equals("FAILED"));
  media.close();resources.close();deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(stops.get()<3&&System.nanoTime()<deadline)Thread.sleep(5);require(stops.get()>=3);
 }
 @Override public void onCreate(Bundle state){super.onCreate(state);TextView status=new TextView(this);status.setText("Native media service checks running");setContentView(status);new Thread(()->{String result;try{test();result="native-media-image PASS shared quota isolation cancellation overflow JPEG";}catch(Throwable failure){android.util.Log.e("PocketJS","Native media service test failed",failure);result="native-media-image FAIL "+failure;}final String proof=result;runOnUiThread(()->{status.setText(proof);status.setContentDescription(proof);});},"pjm-media-service-test").start();}
}
