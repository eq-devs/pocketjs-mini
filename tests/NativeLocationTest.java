package dev.pjm.android;
import android.os.Looper;
import java.util.ArrayDeque;
import org.json.JSONObject;

/** Actual Android wrapper/JSON/Handler with a controlled provider; no location or OS consent access. */
final class NativeLocationTest {
  private static final class UI implements VerifiedLocation.UI {
    final ArrayDeque<Runnable> queue=new ArrayDeque<>();boolean foreground=true,authorized=true;
    int starts,approvalStops,providerStops,persisted;VerifiedLocation.Completion completion;VerifiedLocation.Decision decision;
    public void execute(Runnable action){queue.addLast(action);}
    public boolean foreground(){return foreground;}
    public boolean authorized(VerifiedPackage value,LocationContract.Options options){return authorized;}
    public Runnable requestApproval(VerifiedPackage value,LocationContract.Options options,VerifiedLocation.Decision callback){decision=callback;return ()->approvalStops++;}
    public Runnable start(LocationContract.Options options,VerifiedLocation.Completion callback){starts++;completion=callback;return ()->providerStops++;}
    void flush(){int count=0;while(!queue.isEmpty()){if(++count>128)throw new AssertionError("UI queue did not settle");queue.removeFirst().run();}}
  }
  private static void error(JSONObject reply,String code)throws Exception{if(reply==null||reply.getBoolean("ok")||!reply.getJSONObject("error").getString("code").equals(code))throw new AssertionError("Expected "+code);}
  private static JSONObject drain(VerifiedLocation service,VerifiedPackage value,long generation,long id)throws Exception{
    JSONObject[] result={null};service.drain((bound,gen,bytes)->{try{JSONObject reply=new JSONObject(new String(bytes,"UTF-8"));if(bound!=value||gen!=generation||reply.getLong("id")!=id||result[0]!=null)throw new AssertionError("Location original ownership lost");result[0]=reply;return true;}catch(Exception failure){throw new AssertionError(failure);}});
    if(result[0]==null)throw new AssertionError("Location reply missing");return result[0];
  }
  static void verify(VerifiedPackage value)throws Exception{
    if(Looper.getMainLooper()==null)Looper.prepareMainLooper();
    value.policy.authorizePermission("location",true);
    UI ui=new UI();VerifiedLocation service=new VerifiedLocation(ui);
    JSONObject options=new JSONObject().put("timeoutMs",15000).put("maximumAgeMs",0).put("highAccuracy",false);
    error(service.start(value,1,1,new JSONObject().put("extra",true)),"PROTOCOL");
    error(service.start(value,1,2,new JSONObject().put("timeoutMs",JSONObject.NULL).put("maximumAgeMs",0).put("highAccuracy",false)),"PROTOCOL");
    if(service.start(value,1,3,options)!=null)throw new AssertionError("Location did not queue");service.cancel(1,3);ui.flush();if(ui.starts!=0)throw new AssertionError("Cancelled provider started");
    service.start(value,2,4,options);service.retire(2);ui.flush();if(ui.starts!=0)throw new AssertionError("Retired provider started");
    service.start(value,3,5,options);ui.foreground=false;ui.flush();error(drain(service,value,3,5),"BUSY");ui.foreground=true;
    ui.authorized=false;service.start(value,4,6,options);ui.flush();VerifiedLocation.Decision stale=ui.decision;service.cancel(4,6);stale.finish(true,()->ui.persisted++);ui.flush();if(ui.persisted!=0||ui.starts!=0||ui.approvalStops!=1)throw new AssertionError("Cancelled consent persisted or leaked");
    service.start(value,5,7,options);ui.flush();ui.decision.finish(false,()->ui.persisted++);ui.flush();error(drain(service,value,5,7),"DENIED");
    service.start(value,6,8,options);ui.flush();ui.decision.finish(true,()->{ui.persisted++;ui.authorized=true;});ui.flush();
    if(ui.starts!=1||ui.persisted!=2)throw new AssertionError("Approved provider not started once");
    ui.completion.finish(LocationContract.position(12.5,-73.25,4,1700000000000L),null);ui.flush();
    int[] attempts={0};service.drain((bound,gen,bytes)->{if(bound!=value||gen!=6)throw new AssertionError("Backpressure ownership lost");attempts[0]++;return false;});
    JSONObject accepted=drain(service,value,6,8);if(!accepted.getBoolean("ok")||accepted.getJSONObject("data").getDouble("latitude")!=12.5||attempts[0]!=1||ui.providerStops!=1)throw new AssertionError("Position or backpressure cleanup mismatch");
    service.drain((bound,gen,bytes)->{throw new AssertionError("Location delivered twice");});
    service.start(value,7,9,options);ui.flush();ui.authorized=false;ui.completion.finish(LocationContract.position(1,2,3,4),null);ui.flush();error(drain(service,value,7,9),"DENIED");
    ui.authorized=true;service.start(value,8,10,options);ui.flush();VerifiedLocation.Completion stopped=ui.completion;service.suspend();ui.flush();stopped.finish(LocationContract.position(1,2,3,4),null);ui.flush();error(drain(service,value,8,10),"BUSY");
    error(service.start(value,9,11,options),"BUSY");service.resume();
    service.start(value,9,12,options);ui.flush();VerifiedLocation.Completion closed=ui.completion;service.close();ui.flush();closed.finish(LocationContract.position(1,2,3,4),null);ui.flush();service.drain((bound,gen,bytes)->{throw new AssertionError("Closed location delivered");});error(service.start(value,10,13,options),"CLOSED");
    System.out.println("Android signed location wrapper: protocol, queued cancellation/retirement, consent fencing, frame backpressure, revoke, suspend and close passed with a controlled provider; no sensor/OS dialog/deadline firing executed");
  }
}
