package dev.pjm.android;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.io.File;
import java.io.ByteArrayOutputStream;
import org.json.JSONObject;
/** Single owner-thread retained pool. Close before the owner thread exits.
 * Listener callbacks are synchronous; they must not reenter this container. */
final class VerifiedContainer implements AutoCloseable {
  static {System.loadLibrary("pocketjs");}
  interface Listener {void cleanup(VerifiedPackage packageValue,long generation,byte[] record);void retired(VerifiedPackage packageValue,long generation);}
  static final class Frame {
    final byte[] pixels;final int width,height,stride;final int[] damage;
    Frame(byte[] pixels,int width,int height,int stride,int[] damage){this.pixels=pixels;this.width=width;this.height=height;this.stride=stride;this.damage=damage;}
  }
  private final Thread owner=Thread.currentThread();private final Listener listener;private final File storageRoot;
  private final HashMap<Long,AppStorage> storages=new HashMap<>();private long activeGeneration;private Exception lastCleanupError;
  private final HashMap<Long,VerifiedPackage> packages=new HashMap<>();private long handle;private boolean busy;
  private native long create();
  private static native long generation(long handle,byte[] identity);
  private static native void activate(long handle,byte[] identity,byte[] js,byte[] pak,byte[] launch,int width,int height,int density);
  private static native Frame advance(long handle,int[] contacts,int[] hits,byte[] cancelled);
  private static native void draw(long handle,long epoch,int[] contacts,int[] hits,byte[] cancelled,int x,int y,int width,int height,int windowWidth,int windowHeight);
  private static native void contextLost(long handle,long epoch);
  private static native void releaseGpu(long handle,long epoch);
  private static native long gpuEpoch(long handle);
  private static native int hitTest(long handle,float x,float y);
  private static native boolean back(long handle);
  private static native byte[] effects(long handle);
  private static native void post(long handle,byte[] identity,long generation,byte[] record);
  private static native void control(long handle,int operation,byte[] identity);
  private static native void destroy(long handle,boolean[] consumed);
  VerifiedContainer(File storageRoot,Listener listener){if(storageRoot==null)throw new IllegalArgumentException("Host storage root required");this.storageRoot=storageRoot;if(listener==null)throw new IllegalArgumentException("Retirement listener required");this.listener=listener;handle=create();if(handle==0)throw new IllegalStateException("Native pool allocation failed");}
  private void enter(){if(Thread.currentThread()!=owner || busy || handle==0)throw new IllegalStateException("Container requires its idle live owner thread");busy=true;}
  private void leave(){busy=false;}
  long activate(VerifiedPackage candidate,byte[] launch){enter();try{
    if(candidate==null || launch==null || launch.length>4096)throw new IllegalArgumentException("Invalid launch inputs");
    byte[] id=candidate.identity.getBytes(StandardCharsets.UTF_8);long previous=generation(handle,id);VerifiedPackage bound=previous==0?candidate:packages.get(previous);
    if(bound==null)throw new IllegalStateException("Retained policy missing");
    AppStorage storage=storages.get(previous);if(previous==0){try{storage=new AppStorage(storageRoot,bound.identity);}catch(Exception failure){throw new IllegalStateException("Application storage unavailable",failure);}}
    Throwable failure=null;try{activate(handle,id,previous==0?bound.javascript():new byte[0],previous==0?bound.pak():new byte[0],launch.clone(),bound.width,bound.height,bound.density);}catch(Throwable thrown){failure=thrown;}
    long current=generation(handle,id);if(current!=0){activeGeneration=current;if(previous==0){packages.put(current,bound);storages.put(current,storage);}}if(failure!=null){if(failure instanceof Error)throw (Error)failure;if(failure instanceof RuntimeException)throw (RuntimeException)failure;throw new IllegalStateException("Retirement callback failed",failure);}if(current==0)throw new IllegalStateException("Activation generation missing");return current;
  }finally{leave();}}
  Frame frame(int[] contacts,int[] hits,byte[] cancelled){enter();try{return advance(handle,contacts,hits,cancelled);}finally{leave();}}
  void gpuFrame(long epoch,int[] contacts,int[] hits,byte[] cancelled,int x,int y,int width,int height,int windowWidth,int windowHeight){enter();try{draw(handle,epoch,contacts,hits,cancelled,x,y,width,height,windowWidth,windowHeight);}finally{leave();}}
  void gpuContextLost(long epoch){enter();try{contextLost(handle,epoch);}finally{leave();}}
  void releaseGpu(long epoch){enter();try{releaseGpu(handle,epoch);}finally{leave();}}
  long gpuEpoch(){enter();try{return gpuEpoch(handle);}finally{leave();}}
  int hitTest(float x,float y){enter();try{if(Float.isNaN(x) || Float.isInfinite(x) || Float.isNaN(y) || Float.isInfinite(y))throw new IllegalArgumentException("Invalid touch coordinate");return hitTest(handle,x,y);}finally{leave();}}
  boolean systemBack(){enter();try{return back(handle);}finally{leave();}}
  byte[] effects(){enter();try{
    byte[] records=effects(handle);ByteArrayOutputStream external=new ByteArrayOutputStream();int start=0;
    for(int index=0;index<records.length;index++)if(records[index]=='\n'){
      byte[] record=java.util.Arrays.copyOfRange(records,start,index);start=index+1;
      if(!storageRecord(activeGeneration,record,false)){external.write(record,0,record.length);external.write('\n');}
    }return external.toByteArray();
  }finally{leave();}}
  boolean dispatchStorageRecord(String identity,long generation,byte[] record){enter();try{
    VerifiedPackage bound=packages.get(generation);if(bound==null || !bound.identity.equals(identity) || record==null || record.length>4096)throw new IllegalArgumentException("Stale storage target or oversized record");return storageRecord(generation,record.clone(),false);
  }finally{leave();}}
  Exception lastCleanupError(){return lastCleanupError;}
  private boolean storageRecord(long generation,byte[] record,boolean retiring){
    JSONObject request;try{request=BoundedJson.object(record,4096);}catch(Exception malformed){return false;}
    Object kind=request.opt("kind");if(!"storage.get.v1".equals(kind) && !"storage.set.v1".equals(kind) && !"storage.remove.v1".equals(kind))return false;
    Object identifier=request.opt("id"),version=request.opt("v");double number=identifier instanceof Number?((Number)identifier).doubleValue():0;
    if(!(identifier instanceof Number) || Double.isNaN(number) || number<1 || number>9007199254740991L || Math.floor(number)!=number)return false;
    Exception failure=null;Object result=null;
    try{if(!(version instanceof Number) || ((Number)version).doubleValue()!=1)throw new IllegalArgumentException("Invalid storage protocol version");AppStorage storage=storages.get(generation);if(storage==null)throw new IllegalStateException("Storage binding unavailable");result=storage.dispatch((String)kind,request.opt("args"));}catch(Exception rejected){failure=rejected;}
    if(retiring){if(failure!=null)lastCleanupError=failure;return true;}
    VerifiedPackage bound=packages.get(generation);if(bound==null)throw new IllegalStateException("Storage reply target retired");
    try{JSONObject reply=new JSONObject().put("v",1).put("id",identifier).put("ok",failure==null);
      if(failure==null)reply.put("data",result);else reply.put("error",new JSONObject().put("code",failure instanceof AppStorage.Busy?"BUSY":failure instanceof IllegalArgumentException?"PROTOCOL":"FAILED").put("message",failure instanceof AppStorage.Busy?"Application storage is busy":failure instanceof IllegalArgumentException?failure.getMessage():"Storage operation failed"));
      byte[] encoded=reply.toString().getBytes(StandardCharsets.UTF_8);if(encoded.length>4096)throw new IllegalStateException("Storage reply exceeds budget");post(handle,bound.identity.getBytes(StandardCharsets.UTF_8),generation,encoded);
    }catch(RuntimeException rejected){throw rejected;}catch(Exception rejected){throw new IllegalStateException("Storage reply encoding failed",rejected);}return true;
  }
  void post(String identity,long generation,byte[] record){enter();try{
    VerifiedPackage bound=packages.get(generation);if(bound==null || !bound.identity.equals(identity) || record==null || record.length>4096)throw new IllegalArgumentException("Stale completion target or oversized record");
    post(handle,identity.getBytes(StandardCharsets.UTF_8),generation,record.clone());
  }finally{leave();}}
  void background(){operation(1,null);}void resume(){operation(2,null);}void memoryWarning(){operation(3,null);}void closeIdentity(String identity){operation(4,identity);}
  private void operation(int operation,String identity){enter();try{control(handle,operation,identity==null?null:identity.getBytes(StandardCharsets.UTF_8));}finally{leave();}}
  private void onNativeCleanup(byte[] identity,long generation,byte[] record){VerifiedPackage bound=packages.get(generation);if(bound!=null && bound.identity.equals(new String(identity,StandardCharsets.UTF_8))){storageRecord(generation,record,true);listener.cleanup(bound,generation,record);}}
  private void onNativeRetired(byte[] identity,long generation){VerifiedPackage bound=packages.get(generation);try{if(bound!=null && bound.identity.equals(new String(identity,StandardCharsets.UTF_8)))listener.retired(bound,generation);}finally{packages.remove(generation);storages.remove(generation);if(activeGeneration==generation)activeGeneration=0;}}
  public void close(){if(handle==0)return;enter();try{boolean[] consumed={false};try{destroy(handle,consumed);}finally{if(consumed[0]){handle=0;activeGeneration=0;packages.clear();storages.clear();}}}finally{leave();}}
}
