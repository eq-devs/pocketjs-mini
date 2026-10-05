package dev.pjm.android;
import org.json.*;
import java.nio.file.*;
import android.util.Base64;
public final class NativePackageLoadTest {
  public static void main(String[] args)throws Exception{
    NativeJsonTest.verify();
    JSONArray cases=new JSONArray(new String(Files.readAllBytes(Paths.get(args[0])),"UTF-8"));int count=0;boolean clipboardChecked=false;
    for(int index=0;index<cases.length();index++){
      JSONObject item=cases.getJSONObject(index);byte[] payload=Base64.decode(item.getString("payload"),Base64.DEFAULT),key=Base64.decode(item.getString("key"),Base64.DEFAULT),envelope=item.getJSONObject("manifest").toString().getBytes("UTF-8");
      VerifiedPackage packageValue=null;try{packageValue=new VerifiedPackage(payload,envelope,key);}catch(Exception failure){if(item.getBoolean("valid"))throw failure;}
      if((packageValue!=null)!=item.getBoolean("valid"))throw new AssertionError("Admission mismatch case "+index);
      if(packageValue!=null){
        if(!clipboardChecked){NativeClipboardTest.verify(packageValue);clipboardChecked=true;}
        if(packageValue.width!=64 || packageValue.height!=64 || packageValue.density!=1)throw new AssertionError("Viewport mismatch");
        byte[] js=packageValue.javascript();byte initial=js[0];js[0]^=1;payload[0]^=1;
        if(packageValue.javascript()[0]!=initial)throw new AssertionError("Caller mutation changed admitted source");
        final VerifiedPackage admitted=packageValue;final int[] cleanup={0},retired={0};
        final VerifiedContainer[] owner={null};VerifiedContainer pool=new VerifiedContainer(new java.io.File(args[0]).getParentFile(),new VerifiedContainer.Listener(){
          public void cleanup(VerifiedPackage bound,long generation,byte[] record){if(bound!=admitted)throw new AssertionError("Policy changed");if(new String(record,java.nio.charset.StandardCharsets.UTF_8).equals("cleanup"))cleanup[0]++;if(owner[0]!=null){boolean rejected=false;try{owner[0].background();}catch(IllegalStateException expected){rejected=true;}if(!rejected)throw new AssertionError("Callback reentry accepted");}}
          public void retired(VerifiedPackage bound,long generation){if(bound!=admitted || cleanup[0]!=1)throw new AssertionError("Retirement order");retired[0]++;}
        });
        owner[0]=pool;byte[] launch="{\"source\":\"test\",\"query\":{}}".getBytes("UTF-8");long generation=pool.activate(admitted,launch);
        VerifiedContainer.Frame frame=pool.frame(new int[0],new int[0],new byte[0]);if(frame.width!=64 || frame.height!=64 || frame.stride!=256 || frame.pixels.length!=16384 || frame.damage.length!=4)throw new AssertionError("Native frame mismatch");
        if(!new String(pool.effects(),"UTF-8").equals("verified:1:1\n"))throw new AssertionError("Launch/frame mismatch");
        byte[] ambiguous="{\"v\":1,\"id\":124,\"kind\":\"storage.set.v1\",\"args\":{\"key\":\"forbidden\",\"value\":\"first\",\"value\":\"last\"}}".getBytes("UTF-8");
        if(pool.dispatchStorageRecord(admitted.identity,generation,ambiguous))throw new AssertionError("Ambiguous storage request dispatched");
        if(new AppStorage(new java.io.File(args[0]).getParentFile(),admitted.identity).dispatch("storage.get.v1",new JSONObject().put("key","forbidden"))!=JSONObject.NULL)throw new AssertionError("Rejected request changed storage");
        String duplicate="{\"appId\":\"dev.pjm.fixture\","+new String(envelope,"UTF-8").substring(1);boolean duplicateDenied=false;
        byte[] restored=payload.clone();restored[0]^=1;try{new VerifiedPackage(restored,duplicate.getBytes("UTF-8"),key);}catch(Exception expected){duplicateDenied=true;}if(!duplicateDenied)throw new AssertionError("Ambiguous signed envelope admitted");
        byte[] storageRequest=new JSONObject().put("v",1).put("id",123).put("kind","storage.set.v1").put("args",new JSONObject().put("key","live-proof").put("value","live")).toString().getBytes("UTF-8");
        pool.background();if(!pool.dispatchStorageRecord(admitted.identity,generation,storageRequest))throw new AssertionError("Storage dispatch skipped");pool.post(admitted.identity,generation,"completion".getBytes("UTF-8"));
        payload[0]^=1;NativePackageStoreTest.verify(new java.io.File(new java.io.File(args[0]).getParentFile(),"packages-"+index),payload,envelope,key,item);VerifiedPackage fresh=new VerifiedPackage(payload,envelope,key);if(pool.activate(fresh,launch)!=generation)throw new AssertionError("Warm generation changed");
        pool.frame(new int[0],new int[0],new byte[0]);String reply=new String(pool.effects(),"UTF-8");if(!reply.contains("123") || !reply.contains("reply:") || !reply.contains("completion") || !reply.contains("verified:1:2"))throw new AssertionError("Retained completion mismatch");
        pool.post(admitted.identity,generation,"pump".getBytes("UTF-8"));pool.frame(new int[0],new int[0],new byte[0]);
        if(!new String(pool.effects(),"UTF-8").equals("verified:1:3\n"))throw new AssertionError("Storage request escaped automatic dispatcher");
        pool.frame(new int[0],new int[0],new byte[0]);String storageReply=new String(pool.effects(),"UTF-8");if(!storageReply.contains("456") || !storageReply.contains("live"))throw new AssertionError("Automatic storage reply missing");
        boolean staleStorage=false;try{pool.dispatchStorageRecord(admitted.identity,generation+1,storageRequest);}catch(IllegalArgumentException expected){staleStorage=true;}if(!staleStorage)throw new AssertionError("Stale storage target accepted");
        final boolean[] deniedThread={false};Thread wrong=new Thread(()->{try{pool.background();}catch(IllegalStateException expected){deniedThread[0]=true;}});wrong.start();wrong.join();if(!deniedThread[0])throw new AssertionError("Owner guard failed");
        pool.closeIdentity(admitted.identity);if(cleanup[0]!=1 || retired[0]!=1)throw new AssertionError("Cleanup missing");
        AppStorage persisted=new AppStorage(new java.io.File(args[0]).getParentFile(),admitted.identity);
        if(!"saved".equals(persisted.dispatch("storage.get.v1",new JSONObject().put("key","cleanup-proof"))))throw new AssertionError("Unload storage missing");if(pool.lastCleanupError()!=null)throw new AssertionError("Unload storage failed");
        boolean stale=false;try{pool.post(admitted.identity,generation,"stale".getBytes("UTF-8"));}catch(IllegalArgumentException expected){stale=true;}if(!stale)throw new AssertionError("Stale completion accepted");pool.close();pool.close();
        final java.util.ArrayList<String> retiredIds=new java.util.ArrayList<>();
        VerifiedContainer multiple=new VerifiedContainer(new java.io.File(args[0]).getParentFile(),new VerifiedContainer.Listener(){
          public void cleanup(VerifiedPackage bound,long generation,byte[] record){}
          public void retired(VerifiedPackage bound,long generation){retiredIds.add(bound.identity);}
        });
        long old=multiple.activate(admitted,launch);multiple.frame(new int[0],new int[0],new byte[0]);multiple.effects();
        JSONArray peers=item.getJSONArray("peers");
        for(int peerIndex=0;peerIndex<peers.length();peerIndex++){
          JSONObject entry=peers.getJSONObject(peerIndex);VerifiedPackage next=new VerifiedPackage(Base64.decode(entry.getString("payload"),Base64.DEFAULT),entry.getJSONObject("manifest").toString().getBytes("UTF-8"),key);
          if(new AppStorage(new java.io.File(args[0]).getParentFile(),next.identity).dispatch("storage.get.v1",new JSONObject().put("key","live-proof"))!=JSONObject.NULL)throw new AssertionError("Cross-app storage leak");
          multiple.activate(next,launch);multiple.frame(new int[0],new int[0],new byte[0]);if(!new String(multiple.effects(),"UTF-8").contains("verified:1:1"))throw new AssertionError("Guest isolation failed");
        }
        if(retiredIds.size()!=1 || !retiredIds.get(0).equals(admitted.identity))throw new AssertionError("LRU eviction failed");
        boolean evicted=false;try{multiple.post(admitted.identity,old,"stale".getBytes("UTF-8"));}catch(IllegalArgumentException expected){evicted=true;}if(!evicted)throw new AssertionError("Evicted target accepted");
        multiple.memoryWarning();if(retiredIds.size()!=3)throw new AssertionError("Background pressure eviction failed");multiple.close();if(retiredIds.size()!=4)throw new AssertionError("Final retirement failed");
        final int[] failedRetirements={0};
        VerifiedContainer failing=new VerifiedContainer(new java.io.File(args[0]).getParentFile(),new VerifiedContainer.Listener(){
          public void cleanup(VerifiedPackage bound,long generation,byte[] record){if(bound.identity.equals(admitted.identity))throw new IllegalStateException("expected cleanup failure");}
          public void retired(VerifiedPackage bound,long generation){failedRetirements[0]++;}
        });
        failing.activate(admitted,launch);boolean callbackFailed=false;
        for(int peerIndex=0;peerIndex<peers.length();peerIndex++){
          JSONObject entry=peers.getJSONObject(peerIndex);VerifiedPackage next=new VerifiedPackage(Base64.decode(entry.getString("payload"),Base64.DEFAULT),entry.getJSONObject("manifest").toString().getBytes("UTF-8"),key);
          try{failing.activate(next,launch);}catch(IllegalStateException expected){if(!"expected cleanup failure".equals(expected.getMessage()))throw expected;callbackFailed=true;}
        }
        if(!callbackFailed || failedRetirements[0]!=1)throw new AssertionError("Callback exception blocked retirement");
        failing.frame(new int[0],new int[0],new byte[0]);if(!new String(failing.effects(),"UTF-8").contains("verified:1:1"))throw new AssertionError("Committed guest lost after callback failure");
        failing.close();if(failedRetirements[0]!=4)throw new AssertionError("Committed policy missing after callback failure");
        packageValue.policy.authorizeUrl("https://example.com/path");
        boolean denied=false;try{packageValue.policy.authorizeUrl("https://other.com");}catch(Exception failure){denied=true;}if(!denied)throw new AssertionError("Policy bypass");
      }count++;
    }System.out.println("Android authenticated package admission and retained native execution: "+count+" cases passed");
  }
}
