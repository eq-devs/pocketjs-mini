package dev.pjm.android;
import java.util.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

/** Signed service wrapper. UI adapter owns native approval and provider operations. */
final class VerifiedLocation {
  private static final LocationRate rates=new LocationRate(android.os.SystemClock::elapsedRealtime);
  interface Completion {void finish(LocationContract.Position position,LocationMailbox.Error error);}
  interface Decision {
    void finish(boolean approved,Runnable persist);
    default void fail(){finish(false,()->{throw new IllegalStateException("Native location approval failed");});}
  }
  interface UI {
    void execute(Runnable work);boolean foreground();
    /** Must check persisted app approval and current OS grant, never just declaration. */
    boolean authorized(VerifiedPackage value,LocationContract.Options options)throws Exception;
    /** Native adapter respects saved denial; may prompt and request OS permission.
     * Pass host persistence as an action; the wrapper runs it only while live. */
    Runnable requestApproval(VerifiedPackage value,LocationContract.Options options,Decision decision)throws Exception;
    Runnable start(LocationContract.Options options,Completion completion)throws Exception;
  }
  interface Delivery {boolean post(VerifiedPackage value,long generation,byte[] reply);}
  private final UI ui;private final LocationMailbox<VerifiedPackage> mailbox;
  private final android.os.Handler timeouts=new android.os.Handler(android.os.Looper.getMainLooper());
  VerifiedLocation(UI ui){this.ui=Objects.requireNonNull(ui);mailbox=new LocationMailbox<>(android.os.SystemClock::elapsedRealtime);}
  private static JSONObject reply(long id,String code,LocationContract.Position position)throws JSONException {
    JSONObject record=new JSONObject().put("v",1).put("id",id).put("ok",code==null);
    if(code!=null)return record.put("error",new JSONObject().put("code",code).put("message","Location request rejected"));
    return record.put("data",new JSONObject().put("latitude",position.latitude).put("longitude",position.longitude).put("accuracyMeters",position.accuracyMeters).put("timestampMs",position.timestampMs));
  }
  JSONObject start(VerifiedPackage value,long generation,long id,Object arguments)throws JSONException {
    LocationContract.Options options;
    try{if(!(arguments instanceof JSONObject))throw new IllegalArgumentException();JSONObject object=(JSONObject)arguments;Map<String,Object> fields=new HashMap<>();Iterator<String> keys=object.keys();while(keys.hasNext()){String key=keys.next();fields.put(key,object.get(key));}options=LocationContract.options(fields);}
    catch(Exception invalid){return reply(id,"PROTOCOL",null);}
    try{value.policy.authorizePermission("location",true);}catch(Exception denied){return reply(id,"DENIED",null);}
    final LocationMailbox.Task<VerifiedPackage> task;
    try{task=mailbox.reserve(value,generation,id,options);}catch(IllegalStateException closed){return reply(id,"CLOSED",null);}
    if(task==null)return reply(id,"BUSY",null);
    try{if(!rates.admit(value.identity)){mailbox.cancel(generation,id);return reply(id,"BUSY",null);}}
    catch(RuntimeException failure){mailbox.cancel(generation,id);return reply(id,"FAILED",null);}
    LocationStops stops=new LocationStops();boolean[] providerStarted={false},decisionDelivered={false};
    mailbox.attachStop(task,()->ui.execute(stops::close));
    Runnable expire=()->mailbox.complete(task,null,LocationMailbox.Error.TIMEOUT);
    stops.add(()->timeouts.removeCallbacks(expire));
    if(!timeouts.postDelayed(expire,Math.max(0,task.deadline-android.os.SystemClock.elapsedRealtime()))){mailbox.complete(task,null,LocationMailbox.Error.FAILED);return null;}
    Runnable begin=()->{
      try{
        if(providerStarted[0])return;
        if(!ui.foreground()){mailbox.complete(task,null,LocationMailbox.Error.BUSY);return;}
        if(!ui.authorized(value,options)){mailbox.complete(task,null,LocationMailbox.Error.DENIED);return;}
        providerStarted[0]=true;
        Runnable stop=Objects.requireNonNull(ui.start(options,(position,error)->{
          try{ui.execute(()->mailbox.runIfActive(task,()->{
            try{
              if(error!=null){mailbox.complete(task,null,error);return;}
              if(!ui.foreground()){mailbox.complete(task,null,LocationMailbox.Error.BUSY);return;}
              if(!ui.authorized(value,options)){mailbox.complete(task,null,LocationMailbox.Error.DENIED);return;}
              LocationContract.Position checked=LocationContract.position(position.latitude,position.longitude,position.accuracyMeters,position.timestampMs);
              mailbox.complete(task,checked,null);
            }catch(Exception failure){mailbox.complete(task,null,LocationMailbox.Error.FAILED);}
          }));}catch(RuntimeException failure){mailbox.complete(task,null,LocationMailbox.Error.FAILED);}
        }));
        stops.add(stop);
      }catch(Exception failure){mailbox.complete(task,null,LocationMailbox.Error.FAILED);}
    };
    try{ui.execute(()->mailbox.runIfActive(task,()->{
      try{
        if(!ui.foreground()){mailbox.complete(task,null,LocationMailbox.Error.BUSY);return;}
        if(ui.authorized(value,options)){begin.run();return;}
        stops.add(ui.requestApproval(value,options,(approved,persist)->{
          try{ui.execute(()->mailbox.runIfActive(task,()->{if(decisionDelivered[0])return;decisionDelivered[0]=true;if(!ui.foreground()){mailbox.complete(task,null,LocationMailbox.Error.BUSY);return;}Objects.requireNonNull(persist).run();if(approved)begin.run();else mailbox.complete(task,null,LocationMailbox.Error.DENIED);}));}
          catch(RuntimeException failure){mailbox.complete(task,null,LocationMailbox.Error.FAILED);}
        }));
      }catch(java.util.concurrent.RejectedExecutionException busy){mailbox.complete(task,null,LocationMailbox.Error.BUSY);}
      catch(Exception failure){mailbox.complete(task,null,LocationMailbox.Error.FAILED);}
    }));}catch(RuntimeException failure){mailbox.complete(task,null,LocationMailbox.Error.FAILED);}
    return null;
  }
  void drain(Delivery delivery){mailbox.drain((value,generation,id,position,error)->{try{return delivery.post(value,generation,reply(id,error==null?null:error.name(),position).toString().getBytes(StandardCharsets.UTF_8));}catch(JSONException impossible){throw new IllegalStateException(impossible);}});}
  void cancel(long generation,long id){mailbox.cancel(generation,id);}
  void retire(long generation){mailbox.retire(generation);}
  void suspend(){mailbox.suspend();}
  void resume(){mailbox.resume();}
  void close(){mailbox.close();}
}
