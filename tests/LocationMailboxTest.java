package dev.pjm.android;
final class LocationMailboxTest {
  private static int checks;
  private static void check(boolean value){checks++;if(!value)throw new AssertionError();}
  public static void main(String[] args)throws Exception{
    long[] time={0};LocationMailbox<Object> box=new LocationMailbox<>(()->time[0]);Object value=new Object();int[] stopped={0};
    LocationContract.Options options=new LocationContract.Options(10,0,false);LocationContract.Position position=LocationContract.position(0,0,0,0);
    LocationMailbox.Task<Object> cancelled=box.reserve(value,1,1,options);box.attachStop(cancelled,()->stopped[0]++);box.cancel(1,1);box.complete(cancelled,position,null);box.drain((p,g,id,result,error)->{throw new AssertionError("Cancelled completion delivered");});check(stopped[0]==1);
    LocationMailbox.Task<Object> work=box.reserve(value,2,2,options);box.complete(work,position,null);box.attachStop(work,()->stopped[0]++);check(stopped[0]==2);
    int[] posts={0};box.drain((p,g,id,result,error)->{check(p==value&&g==2&&id==2&&result==position&&error==null);posts[0]++;return false;});box.drain((p,g,id,result,error)->{posts[0]++;return true;});box.drain((p,g,id,result,error)->{throw new AssertionError("Duplicate delivery");});check(posts[0]==2);
    LocationMailbox.Task<Object> late=box.reserve(value,3,3,options);time[0]=10;box.complete(late,position,null);box.drain((p,g,id,result,error)->{check(result==null&&error==LocationMailbox.Error.TIMEOUT);return true;});
    for(int id=1;id<=4;id++)check(box.reserve(value,4,id,options)!=null);check(box.reserve(value,4,5,options)==null);check(box.reserve(value,4,1,options)==null);box.retire(4);
    LocationMailbox.Task<Object> retired=box.reserve(value,5,1,options);box.retire(5);box.attachStop(retired,()->stopped[0]++);box.complete(retired,position,null);check(stopped[0]==3);
    LocationMailbox.Task<Object> threaded=box.reserve(value,7,1,options);boolean[] ownerDenied={false};Thread provider=new Thread(()->{try{box.reserve(value,7,2,options);}catch(IllegalStateException expected){ownerDenied[0]=true;}box.complete(threaded,position,null);});provider.start();provider.join();check(ownerDenied[0]);box.drain((p,g,id,result,error)->{check(g==7&&result==position);return true;});
    LocationMailbox.Task<Object> closing=box.reserve(value,6,1,options);box.attachStop(closing,()->{throw new IllegalStateException("Cleanup fixture");});box.close();box.complete(closing,position,null);
    box.drain((p,g,id,result,error)->{throw new AssertionError("Retired completion delivered");});
    LocationMailbox<Object> reentrant=new LocationMailbox<>(()->time[0]);LocationMailbox.Task<Object> first=reentrant.reserve(value,8,1,options);reentrant.complete(first,position,null);
    reentrant.drain((p,g,id,result,error)->{reentrant.cancel(g,id);LocationMailbox.Task<Object> replacement=reentrant.reserve(value,g,id,options);check(replacement!=null);reentrant.complete(replacement,position,null);return true;});
    int[] fresh={0};reentrant.drain((p,g,id,result,error)->{fresh[0]++;return true;});check(fresh[0]==1);
    LocationMailbox.Task<Object> one=reentrant.reserve(value,9,1,options),two=reentrant.reserve(value,9,2,options);reentrant.attachStop(one,()->reentrant.cancel(9,2));reentrant.attachStop(two,()->stopped[0]++);reentrant.retire(9);check(stopped[0]==4);reentrant.close();
    int[] starts={0};check(!box.runIfActive(cancelled,()->starts[0]++));check(!box.runIfActive(retired,()->starts[0]++));
    LocationMailbox<Object> startup=new LocationMailbox<>(()->time[0]);LocationMailbox.Task<Object> expired=startup.reserve(value,10,1,options);time[0]+=10;check(!startup.runIfActive(expired,()->starts[0]++));startup.drain((p,g,id,result,error)->{check(error==LocationMailbox.Error.TIMEOUT);return true;});check(starts[0]==0);
    LocationMailbox.Task<Object> failing=startup.reserve(value,10,2,options);check(startup.runIfActive(failing,()->{throw new IllegalStateException("Provider fixture");}));startup.drain((p,g,id,result,error)->{check(error==LocationMailbox.Error.FAILED);return true;});startup.close();
    LocationMailbox<Object> lifecycle=new LocationMailbox<>(()->time[0]);LocationMailbox.Task<Object> waiting=lifecycle.reserve(value,11,1,options);int[] pausedStops={0};lifecycle.attachStop(waiting,()->{pausedStops[0]++;check(lifecycle.reserve(value,11,2,options)==null);});lifecycle.suspend();check(pausedStops[0]==1);check(lifecycle.reserve(value,11,2,options)==null);check(!lifecycle.runIfActive(waiting,()->starts[0]++));lifecycle.complete(waiting,position,null);
    lifecycle.resume();lifecycle.drain((p,g,id,result,error)->{check(error==LocationMailbox.Error.BUSY&&result==null);return true;});LocationMailbox.Task<Object> resumed=lifecycle.reserve(value,11,2,options);check(resumed!=null);lifecycle.complete(resumed,position,null);lifecycle.suspend();lifecycle.resume();lifecycle.drain((p,g,id,result,error)->{check(result==position&&error==null);return true;});lifecycle.close();
    System.out.println("Android location mailbox JVM checks passed: "+checks+"; no provider/permission/device execution.");
  }
}
