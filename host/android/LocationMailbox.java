package dev.pjm.android;
import java.util.*;

/** Host-owned request state; provider callbacks retain the original request token. */
final class LocationMailbox<P> {
  interface Clock {long now();}
  enum Error {DENIED,BUSY,TIMEOUT,FAILED}
  interface Delivery<P> {boolean post(P value,long generation,long id,LocationContract.Position position,Error error);}
  static final class Task<P> {
    final P value;final long generation,id,deadline;final LocationContract.Options options;
    private boolean completed;private LocationContract.Position position;private Error error;private Runnable stop;
    Task(P value,long generation,long id,long deadline,LocationContract.Options options){this.value=value;this.generation=generation;this.id=id;this.deadline=deadline;this.options=options;}
  }
  private final Thread owner=Thread.currentThread();private final Clock clock;
  private final Map<String,Task<P>> pending=new LinkedHashMap<>();private boolean closed,suspended;
  LocationMailbox(Clock clock){this.clock=Objects.requireNonNull(clock);}
  private void owner(){if(Thread.currentThread()!=owner)throw new IllegalStateException("Location mailbox owner required");}
  private String key(long generation,long id){return generation+":"+id;}
  private void stop(Task<P> task){Runnable action=task.stop;task.stop=null;if(action!=null)try{action.run();}catch(RuntimeException ignored){}}
  synchronized Task<P> reserve(P value,long generation,long id,LocationContract.Options options){
    owner();if(closed)throw new IllegalStateException("Location mailbox closed");Objects.requireNonNull(value);Objects.requireNonNull(options);
    if(generation<1||id<1||id>9007199254740991L)throw new IllegalArgumentException("Invalid location request ownership");
    if(suspended||pending.size()>=4||pending.containsKey(key(generation,id)))return null;
    long now=clock.now();if(now<0||now>Long.MAX_VALUE-options.timeoutMs)throw new IllegalStateException("Invalid location clock");
    Task<P> task=new Task<>(value,generation,id,now+options.timeoutMs,options);pending.put(key(generation,id),task);return task;
  }
  /** Adapter supplies a stop action that dispatches onto its own provider thread. */
  synchronized void attachStop(Task<P> task,Runnable action){
    Objects.requireNonNull(action);if(pending.get(key(task.generation,task.id))!=task||task.completed){try{action.run();}catch(RuntimeException ignored){}return;}
    if(task.stop!=null)throw new IllegalStateException("Location provider already attached");task.stop=action;
  }
  /** A queued UI callback enters the provider only while its original token is live.
   * The action must start asynchronous work and return without waiting. */
  synchronized boolean runIfActive(Task<P> task,Runnable action){
    Objects.requireNonNull(action);if(closed||pending.get(key(task.generation,task.id))!=task||task.completed)return false;
    if(clock.now()>=task.deadline){complete(task,null,Error.TIMEOUT);return false;}
    try{action.run();}catch(RuntimeException failure){complete(task,null,Error.FAILED);}return true;
  }
  synchronized void complete(Task<P> task,LocationContract.Position position,Error error){
    if(closed||pending.get(key(task.generation,task.id))!=task||task.completed)return;
    if((position==null)==(error==null))throw new IllegalArgumentException("Location result must be position or error");
    if(clock.now()>=task.deadline){position=null;error=Error.TIMEOUT;}
    task.position=position;task.error=error;task.completed=true;stop(task);
  }
  synchronized void drain(Delivery<P> delivery){
    owner();long now=clock.now();
    for(Task<P> task:new ArrayList<>(pending.values())){String key=key(task.generation,task.id);if(pending.get(key)!=task)continue;
      if(!task.completed&&now>=task.deadline){task.completed=true;task.error=Error.TIMEOUT;stop(task);}
      if(pending.get(key)==task&&task.completed&&delivery.post(task.value,task.generation,task.id,task.position,task.error)){pending.remove(key,task);stop(task);}}
  }
  synchronized void cancel(long generation,long id){owner();Task<P> task=pending.remove(key(generation,id));if(task!=null)stop(task);}
  synchronized void retire(long generation){owner();for(Task<P> task:new ArrayList<>(pending.values()))if(task.generation==generation&&pending.remove(key(task.generation,task.id),task))stop(task);}
  synchronized void suspend(){owner();suspended=true;for(Task<P> task:new ArrayList<>(pending.values()))if(!task.completed)complete(task,null,Error.BUSY);}
  synchronized void resume(){owner();if(closed)throw new IllegalStateException("Location mailbox closed");suspended=false;}
  synchronized void close(){owner();closed=true;List<Task<P>> tasks=new ArrayList<>(pending.values());pending.clear();for(Task<P> task:tasks)stop(task);}
}
