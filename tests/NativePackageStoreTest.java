package dev.pjm.android;
import java.io.*;
import java.nio.file.*;
import org.json.*;
import android.util.Base64;
final class NativePackageStoreTest {
  interface Action{void run()throws Exception;}
  private static void rejected(Action action)throws Exception{boolean failed=false;try{action.run();}catch(Exception expected){failed=true;}if(!failed)throw new AssertionError("Invalid package store operation accepted");}
  static void verify(File root,byte[] payload,byte[] envelope,byte[] key,JSONObject fixture)throws Exception{
    String id="dev.pjm.fixture";PackageStore store=new PackageStore(root,key);store.seed(payload,envelope);
    VerifiedPackage first=store.coldStart(id);if(!first.version.equals("1.0.0"))throw new AssertionError("Seed failed");
    JSONObject update=fixture.getJSONObject("update");byte[] next=Base64.decode(update.getString("payload"),Base64.DEFAULT),manifest=update.getJSONObject("manifest").toString().getBytes("UTF-8");
    store.stage(next,manifest);store.seed(payload,envelope);
    if(!first.version.equals("1.0.0"))throw new AssertionError("Running snapshot replaced");
    PackageStore reopened=new PackageStore(root,key);if(!reopened.coldStart(id).version.equals("2.0.0"))throw new AssertionError("Durable pending update lost");
    reopened.seed(payload,envelope);if(!reopened.coldStart(id).version.equals("2.0.0"))throw new AssertionError("Seed replaced downloaded update");
    reopened.rollback(id);if(!reopened.coldStart(id).version.equals("1.0.0"))throw new AssertionError("Rollback failed");
    byte[] changed=next.clone();changed[0]^=1;rejected(()->store.stage(changed,manifest));
    if(!store.coldStart(id).version.equals("1.0.0"))throw new AssertionError("Rejected update changed state");
    byte[] wrong=key.clone();wrong[0]^=1;rejected(()->new PackageStore(root,wrong).coldStart(id));
    final boolean[] wrongThread={false};Thread thread=new Thread(()->{try{store.coldStart(id);}catch(IllegalStateException expected){wrongThread[0]=true;}catch(Exception error){throw new RuntimeException(error);}});thread.start();thread.join();if(!wrongThread[0])throw new AssertionError("Store owner guard failed");
    File app=new File(root,id),statePath=new File(app,"state.json");byte[] state=Files.readAllBytes(statePath.toPath());JSONObject stateObject=new JSONObject(new String(state,"UTF-8"));
    File installed=new File(new File(app,stateObject.getString("current")),"main.pocket");byte[] saved=Files.readAllBytes(installed.toPath());Files.write(installed.toPath(),new byte[]{1,2,3});rejected(()->store.coldStart(id));Files.write(installed.toPath(),saved);
    if(!store.coldStart(id).version.equals("1.0.0"))throw new AssertionError("Recovery after tamper failed");
    Files.write(statePath.toPath(),"{\"pending\":\"../escape\"}".getBytes("UTF-8"));rejected(()->store.coldStart(id));Files.write(statePath.toPath(),state);
    Path link=new File(root.getParentFile(),root.getName()+"-link").toPath();Files.createSymbolicLink(link,root.toPath());rejected(()->new PackageStore(link.toFile(),key));Files.delete(link);
    File external=new File(root.getParentFile(),root.getName()+"-external");Files.write(external.toPath(),saved);Files.delete(installed.toPath());Files.createSymbolicLink(installed.toPath(),external.toPath());rejected(()->store.coldStart(id));Files.delete(installed.toPath());Files.write(installed.toPath(),saved);Files.delete(external.toPath());
    File stale=new File(app,"9.9.9-"+new String(new char[64]).replace('\0','a'));if(!stale.mkdir())throw new AssertionError("Cannot create stale slot");Files.write(new File(stale,"main.pocket").toPath(),new byte[]{1});
    File partial=new File(app,".install-00000000-0000-0000-0000-000000000000");if(!partial.mkdir())throw new AssertionError("Cannot create crash fixture");Files.write(new File(partial,"manifest.json").toPath(),new byte[]{1});
    File pendingWrite=new File(app,".write-00000000-0000-0000-0000-000000000000");Files.write(pendingWrite.toPath(),new byte[]{1});store.coldStart(id);
    if(stale.exists() || partial.exists() || pendingWrite.exists() || store.lastCleanupError()!=null)throw new AssertionError("Unreferenced cache cleanup failed");
    int held=PackageFiles.lock(PackageFiles.path(root));if(held<0)throw new AssertionError("Cannot hold package lock");try{rejected(()->store.coldStart(id));}finally{PackageFiles.unlock(held);}
    race(root);
    System.out.println("Android signed package store: update, cold promotion, rollback, tamper, owner, lock and symlink checks passed");
  }
  private static void race(File root)throws Exception{
    File live=new File(root,"race"),parked=new File(root,"race-parked"),outside=new File(root.getParentFile(),root.getName()+"-outside");
    PackageFiles.directory(PackageFiles.path(live));PackageFiles.directory(PackageFiles.path(outside));File sentinel=new File(outside,"probe");Files.write(sentinel.toPath(),"outside".getBytes("UTF-8"));
    java.util.concurrent.atomic.AtomicReference<Throwable> failure=new java.util.concurrent.atomic.AtomicReference<>();
    Thread swapper=new Thread(()->{try{for(int iteration=0;iteration<400;iteration++){
      Files.move(live.toPath(),parked.toPath());Files.createSymbolicLink(live.toPath(),outside.toPath());Thread.yield();Files.delete(live.toPath());Files.move(parked.toPath(),live.toPath());
    }}catch(Throwable error){failure.set(error);}});swapper.start();
    for(int iteration=0;iteration<400;iteration++){
      try{PackageFiles.write(PackageFiles.path(new File(live,"probe")),"inside".getBytes("UTF-8"),(".write-"+java.util.UUID.randomUUID()).getBytes("UTF-8"));}catch(IOException expected){}
      try{byte[] bytes=PackageFiles.read(PackageFiles.path(new File(live,"probe")),128,true);if(bytes!=null && !new String(bytes,"UTF-8").equals("inside"))throw new AssertionError("Read escaped held directory");}catch(IOException expected){}
    }
    swapper.join();if(failure.get()!=null)throw new AssertionError("Race fixture failed",failure.get());
    Files.move(live.toPath(),parked.toPath());Files.createSymbolicLink(live.toPath(),outside.toPath());try{rejected(()->PackageFiles.directory(PackageFiles.path(new File(live,"created"))));}finally{Files.delete(live.toPath());Files.move(parked.toPath(),live.toPath());}
    if(!new String(Files.readAllBytes(sentinel.toPath()),"UTF-8").equals("outside") || new File(outside,"created").exists())throw new AssertionError("Operation escaped through replaced parent");
    Files.delete(sentinel.toPath());Files.delete(outside.toPath());
  }

}
