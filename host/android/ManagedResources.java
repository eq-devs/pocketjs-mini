package dev.pjm.android;
import java.util.*;
import android.util.Base64;
import org.json.JSONObject;

/** Host-owned memory handles, never guest-selected filesystem paths. */
final class ManagedResources implements AutoCloseable {
  static final int CAPACITY=1024*1024;
  private static int allocated;
  private static synchronized boolean reserveGlobal(){if(allocated>=16)return false;allocated++;return true;}
  private static synchronized void releaseGlobal(){if(--allocated<0)throw new AssertionError("Resource accounting underflow");}
  static final class Slot {
    final String handle="r_"+UUID.randomUUID().toString().replace("-","");
    final String identity;final long generation;
    byte[] bytes=new byte[CAPACITY];volatile int length;volatile boolean ready;
    private boolean inFlight=true,closed,released;
    Slot(String identity,long generation){this.identity=identity;this.generation=generation;}
    synchronized void finish(int size){if(size < -1 || size>CAPACITY)throw new IllegalArgumentException("Invalid resource size");inFlight=false;if(size<0)closed=true;else if(!closed){length=size;ready=true;}releaseIfClosed();}
    synchronized void cancel(){closed=true;ready=false;releaseIfClosed();}
    private void releaseIfClosed(){if(closed && !inFlight && !released){released=true;bytes=null;releaseGlobal();}}
  }
  private final Thread owner=Thread.currentThread();private final HashMap<String,Slot> slots=new HashMap<>();private boolean closed;
  private void check(){if(Thread.currentThread()!=owner || closed)throw new IllegalStateException("Resources require their live owner thread");}
  Slot reserve(String identity,long generation){check();int count=0;for(Slot slot:slots.values())if(slot.generation==generation)count++;if(count>=4 || !reserveGlobal())return null;
    try{Slot slot=new Slot(identity,generation);slots.put(slot.handle,slot);return slot;}catch(Throwable failure){releaseGlobal();throw failure;}
  }
  void discard(Slot slot){check();if(slot!=null){slots.remove(slot.handle);slot.cancel();}}
  private Slot lookup(String identity,long generation,Object handle){Slot slot=handle instanceof String?slots.get(handle):null;if(slot==null || !slot.identity.equals(identity) || slot.generation!=generation || !slot.ready)throw new SecurityException("Resource unavailable for this guest");return slot;}
  JSONObject read(String identity,long generation,Object arguments)throws Exception {check();if(!(arguments instanceof JSONObject))throw new IllegalArgumentException("Invalid resource arguments");JSONObject args=(JSONObject)arguments;
    if(args.length()!=3 || !args.has("handle") || !args.has("offset") || !args.has("count"))throw new IllegalArgumentException("Invalid resource arguments");
    int offset=integer(args.opt("offset"),0,CAPACITY),count=integer(args.opt("count"),1,1536);Slot slot=lookup(identity,generation,args.opt("handle"));if(offset>slot.length)throw new IllegalArgumentException("Resource offset exceeds length");int size=Math.min(count,slot.length-offset);
    byte[] data=Arrays.copyOfRange(slot.bytes,offset,offset+size);return new JSONObject().put("bodyBase64",Base64.encodeToString(data,Base64.NO_WRAP)).put("offset",offset).put("nextOffset",offset+size).put("size",slot.length).put("eof",offset+size==slot.length);
  }
  Object release(String identity,long generation,Object arguments)throws Exception {check();if(!(arguments instanceof JSONObject) || ((JSONObject)arguments).length()!=1 || !((JSONObject)arguments).has("handle"))throw new IllegalArgumentException("Invalid resource arguments");discard(lookup(identity,generation,((JSONObject)arguments).opt("handle")));return JSONObject.NULL;}
  private static int integer(Object value,int low,int high){double number=value instanceof Number?((Number)value).doubleValue():Double.NaN;if(Double.isNaN(number) || number<low || number>high || Math.floor(number)!=number)throw new IllegalArgumentException("Invalid resource range");return (int)number;}
  void retire(long generation){check();for(Slot slot:new ArrayList<>(slots.values()))if(slot.generation==generation)discard(slot);}
  public void close(){if(closed)return;check();for(Slot slot:new ArrayList<>(slots.values()))discard(slot);closed=true;}
}
