package dev.pjm.android;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.JSONObject;

/** Owner-thread mailbox, UI-thread clipboard adapter; original package retained. */
final class VerifiedClipboard {
  interface UI {
    void execute(Runnable action);boolean foreground();void write(String text)throws Exception;
    default PermissionGate.Status permission(VerifiedPackage value)throws Exception{return PermissionGate.Status.DENIED;}
    default PermissionGate.Status decide(VerifiedPackage value,boolean approved)throws Exception{return PermissionGate.Status.DENIED;}
    default Runnable prompt(VerifiedPackage value,java.util.function.Consumer<Boolean> decision)throws Exception{throw new UnsupportedOperationException();}
    default String read()throws Exception{throw new UnsupportedOperationException();}
  }
  interface Clock {long now();}
  interface Delivery {boolean post(VerifiedPackage value,long generation,byte[] reply);}
  private static final Map<String,ArrayDeque<Long>> rates=new HashMap<>();
  private final Thread owner=Thread.currentThread();private final UI ui;private final Clock clock;
  private final Map<String,Task> pending=new LinkedHashMap<>();private boolean closed;
  private static final class Task {VerifiedPackage value;long generation,id,started;byte[] reply;Runnable dismiss;}
  VerifiedClipboard(UI ui){this(ui,android.os.SystemClock::elapsedRealtime);}
  VerifiedClipboard(UI ui,Clock clock){this.ui=Objects.requireNonNull(ui);this.clock=Objects.requireNonNull(clock);}
  private void owner(){if(Thread.currentThread()!=owner)throw new IllegalStateException("Clipboard owner required");}
  private long now(){return clock.now();}
  private static boolean rate(String identity,long time){synchronized(rates){
    Iterator<ArrayDeque<Long>> all=rates.values().iterator();while(all.hasNext()){ArrayDeque<Long> times=all.next();while(!times.isEmpty()&&times.peekFirst()<=time-60000)times.removeFirst();if(times.isEmpty())all.remove();}
    ArrayDeque<Long> times=rates.get(identity);if(times==null){if(rates.size()>=64)return false;times=new ArrayDeque<>();rates.put(identity,times);}if(times.size()>=16)return false;times.addLast(time);return true;
  }}
  private static JSONObject result(long id,String code)throws org.json.JSONException{return code==null?new JSONObject().put("v",1).put("id",id).put("ok",true).put("data",JSONObject.NULL):new JSONObject().put("v",1).put("id",id).put("ok",false).put("error",new JSONObject().put("code",code).put("message","Clipboard request rejected"));}
  private static String key(long generation,long id){return generation+":"+id;}
  JSONObject start(VerifiedPackage value,long generation,long id,Object arguments)throws org.json.JSONException{
    owner();if(!(arguments instanceof JSONObject))return result(id,"PROTOCOL");JSONObject args=(JSONObject)arguments;Object raw=args.opt("text");
    if(args.length()!=1||!(raw instanceof String))return result(id,"PROTOCOL");String text=(String)raw;
    for(int index=0;index<text.length();index++){char c=text.charAt(index);if(Character.isHighSurrogate(c)){if(++index>=text.length()||!Character.isLowSurrogate(text.charAt(index)))return result(id,"PROTOCOL");}else if(Character.isLowSurrogate(c))return result(id,"PROTOCOL");}
    if(text.getBytes(StandardCharsets.UTF_8).length>2048||JSONObject.quote(text).replace("\\/","/").getBytes(StandardCharsets.UTF_8).length>3072)return result(id,"PROTOCOL");
    synchronized(pending){if(closed)return result(id,"CLOSED");if(pending.size()>=4||pending.containsKey(key(generation,id)))return result(id,"BUSY");if(!rate(value.identity,now()))return result(id,"BUSY");
      Task task=new Task();task.value=value;task.generation=generation;task.id=id;task.started=now();String key=key(generation,id);pending.put(key,task);
      try{ui.execute(()->{synchronized(pending){if(closed||pending.get(key)!=task)return;String code=null;
        try{if(now()-task.started>=15000)code="TIMEOUT";else if(!ui.foreground())code="BUSY";else ui.write(text);}catch(Exception failure){code="FAILED";}
        try{task.reply=result(task.id,code).toString().getBytes(StandardCharsets.UTF_8);}catch(Exception failure){pending.remove(key);}
      }});}catch(Exception failure){pending.remove(key);return result(id,"FAILED");}return null;
    }
  }
  private boolean live(Task task,String key){return !closed&&pending.get(key)==task&&task.reply==null;}
  private void dismiss(Task task){Runnable action=task.dismiss;task.dismiss=null;if(action!=null){
    // Cleanup must not lose a completed reply or strand other retired tasks.
    try{ui.execute(()->{try{action.run();}catch(RuntimeException ignored){}});}catch(RuntimeException ignored){}
  }}
  private void finishRead(Task task,String key,String code,String text){
    if(!live(task,key))return;dismiss(task);
    try{JSONObject reply=result(task.id,code);if(code==null)reply.put("data",new JSONObject().put("text",text));task.reply=reply.toString().replace("\\/","/").getBytes(StandardCharsets.UTF_8);}catch(org.json.JSONException impossible){throw new IllegalStateException(impossible);}
  }
  private void read(Task task,String key){
    if(!live(task,key))return;
    try{
      if(now()-task.started>=15000){finishRead(task,key,"TIMEOUT",null);return;}
      if(!ui.foreground()){finishRead(task,key,"BUSY",null);return;}
      if(ui.permission(task.value)!=PermissionGate.Status.GRANTED){finishRead(task,key,"DENIED",null);return;}
      String text=ui.read();if(text==null){finishRead(task,key,"DENIED",null);return;}
      for(int index=0;index<text.length();index++){char c=text.charAt(index);if(Character.isHighSurrogate(c)){if(++index>=text.length()||!Character.isLowSurrogate(text.charAt(index))){finishRead(task,key,"FAILED",null);return;}}else if(Character.isLowSurrogate(c)){finishRead(task,key,"FAILED",null);return;}}
      if(text.getBytes(StandardCharsets.UTF_8).length>2048||JSONObject.quote(text).replace("\\/","/").getBytes(StandardCharsets.UTF_8).length>3072){finishRead(task,key,"FAILED",null);return;}
      finishRead(task,key,null,text);
    }catch(Exception failure){finishRead(task,key,"FAILED",null);}
  }
  JSONObject startRead(VerifiedPackage value,long generation,long id,Object arguments)throws org.json.JSONException{
    owner();if(!(arguments instanceof JSONObject)||((JSONObject)arguments).length()!=0)return result(id,"PROTOCOL");
    try{value.policy.authorizePermission("clipboard.read",true);}catch(Exception denied){return result(id,"DENIED");}
    synchronized(pending){if(closed)return result(id,"CLOSED");String key=key(generation,id);if(pending.size()>=4||pending.containsKey(key)||!rate(value.identity,now()))return result(id,"BUSY");
      Task task=new Task();task.value=value;task.generation=generation;task.id=id;task.started=now();pending.put(key,task);
      try{ui.execute(()->{synchronized(pending){if(!live(task,key))return;
        try{if(now()-task.started>=15000){finishRead(task,key,"TIMEOUT",null);return;}if(!ui.foreground()){finishRead(task,key,"BUSY",null);return;}
          PermissionGate.Status status=ui.permission(value);if(status==PermissionGate.Status.GRANTED){read(task,key);return;}if(status==PermissionGate.Status.DENIED){finishRead(task,key,"DENIED",null);return;}
          task.dismiss=ui.prompt(value,approved->{synchronized(pending){if(!live(task,key))return;try{if(now()-task.started>=15000){finishRead(task,key,"TIMEOUT",null);return;}if(!ui.foreground()){finishRead(task,key,"BUSY",null);return;}if(ui.decide(value,approved)==PermissionGate.Status.GRANTED)read(task,key);else finishRead(task,key,"DENIED",null);}catch(Exception failure){finishRead(task,key,"FAILED",null);}}});
          // An adapter may deliver its decision before returning the dismiss handle.
          if(!live(task,key))dismiss(task);
        }catch(Exception failure){finishRead(task,key,"FAILED",null);}
      }});}catch(Exception failure){pending.remove(key);return result(id,"FAILED");}return null;
    }
  }
  void drain(Delivery delivery)throws org.json.JSONException{owner();synchronized(pending){Iterator<Task> tasks=pending.values().iterator();while(tasks.hasNext()){Task task=tasks.next();if(task.reply==null&&now()-task.started>=15000){task.reply=result(task.id,"TIMEOUT").toString().getBytes(StandardCharsets.UTF_8);dismiss(task);}if(task.reply!=null&&delivery.post(task.value,task.generation,task.reply)){tasks.remove();dismiss(task);}}}}
  void cancel(long generation,long id){owner();synchronized(pending){Task task=pending.remove(key(generation,id));if(task!=null)dismiss(task);}}
  void retire(long generation){owner();synchronized(pending){Iterator<Task> tasks=pending.values().iterator();while(tasks.hasNext()){Task task=tasks.next();if(task.generation==generation){tasks.remove();dismiss(task);}}}}
  void close(){owner();synchronized(pending){closed=true;for(Task task:pending.values())dismiss(task);pending.clear();}}
}
