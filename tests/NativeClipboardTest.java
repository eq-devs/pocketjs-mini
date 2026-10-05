package dev.pjm.android;
import java.util.*;
import org.json.JSONObject;
/** Invoked with an actual authenticated package; adapter never touches clipboard. */
final class NativeClipboardTest {
  private static final class UI implements VerifiedClipboard.UI {
    final ArrayDeque<Runnable> queued=new ArrayDeque<>();int writes;String text;boolean foreground=true;
    public void execute(Runnable action){queued.addLast(action);}
    public boolean foreground(){return foreground;}
    public void write(String value){writes++;text=value;}
    void flush(){while(!queued.isEmpty())queued.removeFirst().run();}
  }
  static void verify(VerifiedPackage value)throws Exception{
    UI ui=new UI();long[] time={0};VerifiedClipboard service=new VerifiedClipboard(ui,()->time[0]);JSONObject args=new JSONObject().put("text","literal <img> 😀");
    if(!service.startRead(value,1,99,new JSONObject().put("extra",true)).getJSONObject("error").getString("code").equals("PROTOCOL"))throw new AssertionError("Read args accepted");
    if(!service.startRead(value,1,100,new JSONObject()).getJSONObject("error").getString("code").equals("DENIED"))throw new AssertionError("Undeclared read accepted");
    if(service.start(value,1,1,args)!=null)throw new AssertionError("Write not queued");service.cancel(1,1);ui.flush();if(ui.writes!=0)throw new AssertionError("Cancelled write executed");
    service.start(value,2,2,args);service.retire(2);ui.flush();if(ui.writes!=0)throw new AssertionError("Retired write executed");
    service.start(value,3,3,args);ui.flush();if(ui.writes!=1||!ui.text.equals(args.getString("text")))throw new AssertionError("Write changed text");
    int[] attempts={0};service.drain((packageValue,generation,reply)->{if(packageValue!=value||generation!=3)throw new AssertionError("Wrong reply ownership");attempts[0]++;return false;});service.drain((packageValue,generation,reply)->{attempts[0]++;return true;});service.drain((p,g,r)->{throw new AssertionError("Reply delivered twice");});if(attempts[0]!=2)throw new AssertionError("Busy reply was lost");
    service.start(value,4,4,args);time[0]=15000;service.drain((p,g,r)->{try{if(!new JSONObject(new String(r,"UTF-8")).getJSONObject("error").getString("code").equals("TIMEOUT"))throw new AssertionError("Timeout missing");}catch(Exception error){throw new AssertionError(error);}return true;});ui.flush();if(ui.writes!=1)throw new AssertionError("Expired UI write executed");
    service.start(value,5,5,args);service.close();ui.flush();if(ui.writes!=1)throw new AssertionError("Closed UI write executed");
    if(!service.start(value,6,6,args).getJSONObject("error").getString("code").equals("CLOSED"))throw new AssertionError("Closed service accepted work");
  }
}
