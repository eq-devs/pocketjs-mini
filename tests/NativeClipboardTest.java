package dev.pjm.android;
import java.util.*;
import org.json.JSONObject;
/** Invoked with an actual authenticated package; adapter never touches clipboard. */
final class NativeClipboardTest {
  private static final class UI implements VerifiedClipboard.UI {
    final ArrayDeque<Runnable> queued=new ArrayDeque<>();int writes,reads;String text;boolean foreground=true;
    public void execute(Runnable action){queued.addLast(action);}
    public boolean foreground(){return foreground;}
    public void write(String value){writes++;text=value;}
    public String read(){reads++;return text;}
    void flush(){while(!queued.isEmpty())queued.removeFirst().run();}
  }
  private static void developmentRead()throws Exception{
    UI ui=new UI();ui.text="read literal 😀";VerifiedClipboard service=new VerifiedClipboard(ui,()->0);
    final class Access implements VerifiedClipboard.ReadAccess {
      boolean declared=true;int decisions;PermissionGate.Status status=PermissionGate.Status.PROMPT;VerifiedClipboard.Decision callback;
      public String identity(){return "dev.pjm.clipboard.read.fixture";}
      public void authorize(){if(!declared)throw new SecurityException();}
      public PermissionGate.Status permission(){return status;}
      public PermissionGate.Status decide(boolean approved){decisions++;status=approved?PermissionGate.Status.GRANTED:PermissionGate.Status.DENIED;return status;}
      public Runnable prompt(VerifiedClipboard.Decision reply){callback=reply;return ()->{};}
    }
    Access access=new Access();access.declared=false;
    if(!service.startDevelopmentRead(access,1,1,new JSONObject()).getJSONObject("error").getString("code").equals("DENIED"))throw new AssertionError("Undeclared development read accepted");
    access.declared=true;service.startDevelopmentRead(access,1,2,new JSONObject());ui.flush();service.retire(1);access.callback.accept(true);ui.flush();if(access.decisions!=0||ui.reads!=0)throw new AssertionError("Late retired approval changed consent");
    service.startDevelopmentRead(access,2,3,new JSONObject());ui.flush();access.callback.accept(true);
    service.drain((p,g,r)->{try{JSONObject reply=new JSONObject(new String(r,"UTF-8"));if(p!=null||g!=2||!reply.getBoolean("ok")||!reply.getJSONObject("data").getString("text").equals(ui.text))throw new AssertionError("Development read ownership/text");}catch(Exception failure){throw new AssertionError(failure);}return true;});
    if(access.decisions!=1||ui.reads!=1)throw new AssertionError("Development consent did not authorize one read");
    ui.foreground=false;service.startDevelopmentRead(access,3,4,new JSONObject());ui.flush();service.drain((p,g,r)->{try{if(!new JSONObject(new String(r,"UTF-8")).getJSONObject("error").getString("code").equals("BUSY"))throw new AssertionError("Background development read accepted");}catch(Exception failure){throw new AssertionError(failure);}return true;});service.close();
  }
  static void verify(VerifiedPackage value)throws Exception{
    developmentRead();
    UI developmentUI=new UI();VerifiedClipboard development=new VerifiedClipboard(developmentUI,()->0);
    JSONObject literal=new JSONObject().put("text","development 😀");
    if(!development.startDevelopmentWrite("invalid",1,1,literal).getJSONObject("error").getString("code").equals("PROTOCOL"))throw new AssertionError("Invalid development identity");
    for(int id=1;id<=4;id++)if(development.startDevelopmentWrite("dev.pjm.clipboard.fixture",1,id,literal)!=null)throw new AssertionError("Development write admission");
    if(!development.startDevelopmentWrite("dev.pjm.clipboard.fixture",1,5,literal).getJSONObject("error").getString("code").equals("BUSY"))throw new AssertionError("Development pending cap");
    development.retire(1);developmentUI.flush();if(developmentUI.writes!=0)throw new AssertionError("Retired development write executed");
    development.startDevelopmentWrite("dev.pjm.clipboard.fixture",2,6,literal);developmentUI.flush();
    development.drain((p,g,r)->{try{if(p!=null||g!=2||!new JSONObject(new String(r,"UTF-8")).getBoolean("ok"))throw new AssertionError("Development reply ownership");}catch(Exception e){throw new AssertionError(e);}return true;});
    if(developmentUI.writes!=1||!developmentUI.text.equals("development 😀"))throw new AssertionError("Development literal changed");development.close();
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
