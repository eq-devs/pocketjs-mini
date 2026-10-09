package dev.pjm.android;
import android.os.CancellationSignal;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import org.json.JSONObject;

/** GL-owner admission/drain; one UI operation and one bounded decode worker. */
final class VerifiedMedia implements AutoCloseable {
 interface Source {InputStream open(CancellationSignal cancellation)throws Exception;}
 interface Completion {void complete(Source source,String error);}
 interface UI {void execute(Runnable work);Runnable select(VerifiedPackage value,MediaContract.Options options,Completion completion)throws Exception;}
 interface Delivery {boolean post(VerifiedPackage value,long generation,byte[] reply);}
 private final Thread owner=Thread.currentThread();private final ManagedResources resources;private final UI ui;
 private final android.os.Handler timer=new android.os.Handler(android.os.Looper.getMainLooper());
 private final ThreadPoolExecutor worker=new ThreadPoolExecutor(0,1,20,TimeUnit.SECONDS,new SynchronousQueue<Runnable>(),work->{Thread thread=new Thread(work,"pjm-media");thread.setDaemon(true);return thread;});
 private Task task;private boolean closed;
 private static final HashMap<String,ArrayDeque<Long>> rates=new HashMap<>();
 private static synchronized boolean admit(String identity){long now=System.nanoTime(),cutoff=now-TimeUnit.SECONDS.toNanos(60);Iterator<Map.Entry<String,ArrayDeque<Long>>> entries=rates.entrySet().iterator();while(entries.hasNext()){ArrayDeque<Long> values=entries.next().getValue();while(!values.isEmpty()&&values.peekFirst()<=cutoff)values.removeFirst();if(values.isEmpty())entries.remove();}ArrayDeque<Long> values=rates.get(identity);if(values==null){if(rates.size()>=64)return false;values=new ArrayDeque<>();rates.put(identity,values);}if(values.size()>=8)return false;values.addLast(now);return true;}

 private static final class Task {
  final VerifiedPackage value;final long generation,id;final MediaContract.Options options;final ManagedResources.Slot slot;final CancellationSignal cancellation=new CancellationSignal();
  volatile boolean cancelled;volatile byte[] reply;boolean accepted,running,finished;Runnable stop,expire;
  Task(VerifiedPackage value,long generation,long id,MediaContract.Options options,ManagedResources.Slot slot){this.value=value;this.generation=generation;this.id=id;this.options=options;this.slot=slot;}
 }
 VerifiedMedia(ManagedResources resources,UI ui){this.resources=Objects.requireNonNull(resources);this.ui=Objects.requireNonNull(ui);}
 private void owner(){if(Thread.currentThread()!=owner||closed)throw new IllegalStateException("Media requires its live owner");}
 private static JSONObject failure(long id,String code){try{return new JSONObject().put("v",1).put("id",id).put("ok",false).put("error",new JSONObject().put("code",code).put("message","Media selection failed"));}catch(Exception impossible){throw new IllegalStateException(impossible);}}
 private static byte[] bytes(JSONObject reply){return reply.toString().getBytes(StandardCharsets.UTF_8);}
 JSONObject start(VerifiedPackage value,long generation,long id,Object arguments){owner();MediaContract.Options options;
  try{if(!(arguments instanceof JSONObject)||value==null||generation<=0||id<1||id>9007199254740991L)throw new IllegalArgumentException();Map<String,Object> fields=new HashMap<>();Iterator<String> keys=((JSONObject)arguments).keys();while(keys.hasNext()){String key=keys.next();fields.put(key,((JSONObject)arguments).get(key));}options=MediaContract.options(fields);}catch(Exception malformed){return failure(id,"PROTOCOL");}
  try{value.policy.authorizePermission("media",true);}catch(Exception denied){return failure(id,"DENIED");}
  if(task!=null||!admit(value.identity))return failure(id,"BUSY");ManagedResources.Slot slot=resources.reserve(value.identity,generation);if(slot==null)return failure(id,"BUSY");
  Task bound=new Task(value,generation,id,options,slot);task=bound;bound.expire=()->finishFailure(bound,"TIMEOUT");
  if(!timer.postDelayed(bound.expire,120000)){finishFailure(bound,"FAILED");return null;}
  try{ui.execute(()->{synchronized(bound){if(bound.cancelled||bound.finished)return;}try{Runnable stop=Objects.requireNonNull(ui.select(value,options,(source,error)->accept(bound,source,error)));boolean dispose;synchronized(bound){bound.stop=stop;dispose=bound.cancelled||bound.finished;}if(dispose)stop.run();}catch(java.util.concurrent.RejectedExecutionException busy){finishFailure(bound,"BUSY");}catch(Exception failed){finishFailure(bound,"FAILED");}});}catch(RuntimeException failed){finishFailure(bound,"FAILED");}
  return null;
 }
 private void accept(Task bound,Source source,String error){synchronized(bound){if(bound.cancelled||bound.finished||bound.accepted)return;bound.accepted=true;if(error==null&&source!=null)bound.running=true;}
  if(error!=null||source==null){finishFailure(bound,error==null?"FAILED":error);return;}
  try{worker.execute(()->decode(bound,source));}catch(RejectedExecutionException busy){synchronized(bound){bound.running=false;}finishFailure(bound,"BUSY");}
 }
 private void decode(Task bound,Source source){MediaImage image=null;String error=null;
  try{byte[] encoded=MediaInput.read(source.open(bound.cancellation),()->bound.cancelled||bound.cancellation.isCanceled());image=MediaImage.decode(encoded,bound.options);}catch(java.util.concurrent.CancellationException|android.os.OperationCanceledException cancelled){error="CANCELLED";}catch(Exception failed){error="FAILED";}
  synchronized(bound){bound.running=false;if(bound.cancelled||bound.finished){bound.slot.finish(-1);return;}
   bound.finished=true;try{if(image!=null){System.arraycopy(image.jpeg,0,bound.slot.bytes,0,image.jpeg.length);bound.slot.finish(image.jpeg.length);bound.reply=bytes(new JSONObject().put("v",1).put("id",bound.id).put("ok",true).put("data",new JSONObject().put("mime","image/jpeg").put("width",image.width).put("height",image.height).put("resource",new JSONObject().put("handle",bound.slot.handle).put("size",image.jpeg.length))));}else{bound.slot.finish(-1);bound.reply=bytes(failure(bound.id,error==null?"FAILED":error));}}catch(Exception failed){bound.slot.cancel();bound.reply=bytes(failure(bound.id,"FAILED"));}
  }
  stopUi(bound);
 }
 private void finishFailure(Task bound,String code){synchronized(bound){if(bound.cancelled||bound.finished)return;bound.finished=true;if(!bound.running)bound.slot.finish(-1);bound.reply=bytes(failure(bound.id,code));}bound.cancellation.cancel();stopUi(bound);}
 private void stopUi(Task bound){timer.removeCallbacks(bound.expire);Runnable stop;synchronized(bound){stop=bound.stop;bound.stop=null;}if(stop!=null)try{ui.execute(stop);}catch(RuntimeException ignored){/* Activity teardown is already terminal. */}}
 void drain(Delivery delivery){owner();Task bound=task;if(bound==null||bound.reply==null)return;if(delivery.post(bound.value,bound.generation,bound.reply)){task=null;if(!bound.slot.ready)resources.discard(bound.slot);stopUi(bound);}}
 private void discard(Task bound){synchronized(bound){bound.cancelled=true;if(!bound.running&&!bound.finished){bound.finished=true;bound.slot.finish(-1);}bound.reply=null;}bound.cancellation.cancel();resources.discard(bound.slot);stopUi(bound);}
 void cancel(long generation,long id){owner();if(task!=null&&task.generation==generation&&task.id==id){Task bound=task;task=null;discard(bound);}}
 void retire(long generation){owner();if(task!=null&&task.generation==generation){Task bound=task;task=null;discard(bound);}}
 void suspend(){owner();if(task!=null)finishFailure(task,"BUSY");}
 public void close(){if(closed)return;owner();if(task!=null){discard(task);task=null;}closed=true;worker.shutdownNow();}
}
