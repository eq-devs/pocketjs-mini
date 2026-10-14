package dev.pjm.android;

import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONArray;
import android.util.Base64;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Real shared resource registry, contested by independent owner threads. No pool replacement. */
public final class NativeResourceProcessActivity extends Activity {
  private static final int OWNERS=8,ROUNDS=64;
  private static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
  private static void await(CyclicBarrier gate)throws Exception{gate.await(10,TimeUnit.SECONDS);}
  private static JSONObject read(String handle)throws Exception{return new JSONObject().put("handle",handle).put("offset",0).put("count",1);}
  private static void denied(ManagedResources registry,String identity,long generation,String handle)throws Exception{
    try{registry.read(identity,generation,read(handle));throw new AssertionError("Foreign or retired resource remained readable");}catch(SecurityException expected){}
  }
  private static void deniedRelease(ManagedResources registry,String identity,long generation,String handle)throws Exception{
    try{registry.release(identity,generation,new JSONObject().put("handle",handle));throw new AssertionError("Foreign resource was released");}catch(SecurityException expected){}
  }
  private String[] authenticatedIdentities()throws Exception{
    byte[] data;try(InputStream input=getAssets().open("cases.json");ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int size;while((size=input.read(buffer))!=-1){require(bytes.size()+size<=4*1024*1024,"Fixture size bound");bytes.write(buffer,0,size);}data=bytes.toByteArray();
    }
    JSONObject base=new JSONArray(new String(data,"UTF-8")).getJSONObject(0);JSONArray peers=base.getJSONArray("peers");require(peers.length()==3,"Missing signed peers");
    byte[] key=Base64.decode(base.getString("key"),Base64.DEFAULT);String[] identities=new String[4];Set<String> unique=new HashSet<>();
    for(int index=0;index<4;index++){
      JSONObject item=index==0?base:peers.getJSONObject(index-1);
      VerifiedPackage value=new VerifiedPackage(Base64.decode(item.getString("payload"),Base64.DEFAULT),item.getJSONObject("manifest").toString().getBytes("UTF-8"),key);
      require(unique.add(value.identity),"Signed identities are not distinct");identities[index]=value.identity;
    }
    return identities;
  }
  private static final class Owner {
    ManagedResources registry;String identity;long generation;
    final ArrayList<ManagedResources.Slot> slots=new ArrayList<>();
  }
  private JSONObject stress()throws Exception{
    final String[] identities=authenticatedIdentities();
    final CyclicBarrier gate=new CyclicBarrier(OWNERS+1);
    final Owner[] owners=new Owner[OWNERS];final AtomicReference<Throwable> failure=new AtomicReference<>();
    ExecutorService executor=Executors.newFixedThreadPool(OWNERS);ArrayList<Future<?>> tasks=new ArrayList<>();
    for(int index=0;index<OWNERS;index++){
      final int ownerIndex=index;final Owner owner=new Owner();owners[index]=owner;
      tasks.add(executor.submit(()->{
        try{
          for(int round=0;round<ROUNDS;round++){
            owner.identity=identities[ownerIndex%identities.length];owner.generation=round*OWNERS+ownerIndex+1;
            owner.registry=new ManagedResources();owner.slots.clear();
            try{
              await(gate);
              for(int attempt=0;attempt<4;attempt++){ManagedResources.Slot slot=owner.registry.reserve(owner.identity,owner.generation);if(slot!=null)owner.slots.add(slot);}
              await(gate);await(gate);
              for(int slotIndex=0;slotIndex<owner.slots.size();slotIndex++){
                ManagedResources.Slot slot=owner.slots.get(slotIndex);
                denied(owner.registry,owner.identity,owner.generation,slot.handle);
                if(slotIndex%2==0){slot.bytes[0]=(byte)(ownerIndex+1);slot.finish(1);
                  require(owner.registry.read(owner.identity,owner.generation,read(slot.handle)).getInt("size")==1,"Lost completed resource");
                  denied(owner.registry,"dev.pjm.foreign",owner.generation,slot.handle);denied(owner.registry,owner.identity,owner.generation+10000,slot.handle);
                  String foreign=identities[(ownerIndex+1)%identities.length];denied(owner.registry,foreign,owner.generation,slot.handle);deniedRelease(owner.registry,foreign,owner.generation,slot.handle);
                  require(owner.registry.read(owner.identity,owner.generation,read(slot.handle)).getString("bodyBase64").equals(Base64.encodeToString(new byte[]{(byte)(ownerIndex+1)},Base64.NO_WRAP)),"Foreign release changed owner bytes");
                }
              }
              for(Owner other:owners)if(other!=owner)for(ManagedResources.Slot slot:other.slots){denied(owner.registry,owner.identity,owner.generation,slot.handle);deniedRelease(owner.registry,owner.identity,owner.generation,slot.handle);}
              owner.registry.retire(owner.generation);
              for(ManagedResources.Slot slot:owner.slots)denied(owner.registry,owner.identity,owner.generation,slot.handle);
              await(gate);await(gate);
              // A cancelled producer owns its bytes until its actual callback finishes.
              for(int slotIndex=1;slotIndex<owner.slots.size();slotIndex+=2){ManagedResources.Slot slot=owner.slots.get(slotIndex);slot.finish(-1);slot.finish(-1);}
              await(gate);
            }finally{owner.registry.close();for(ManagedResources.Slot slot:owner.slots){slot.cancel();slot.finish(-1);}}
          }
        }catch(Throwable problem){failure.compareAndSet(null,problem);gate.reset();throw new IllegalStateException(problem);}
      }));
    }
    int allocations=0,pendingChecks=0;
    try{
      for(int round=0;round<ROUNDS;round++){
        await(gate);await(gate);
        Set<String> handles=new HashSet<>();int pending=0;
        for(Owner owner:owners){require(owner.slots.size()<=4,"Per-generation capacity exceeded");pending+=owner.slots.size()/2;
          for(ManagedResources.Slot slot:owner.slots)require(handles.add(slot.handle),"Duplicate process handle");
          try{owner.registry.reserve(owner.identity,owner.generation);throw new AssertionError("Foreign owner accepted");}catch(IllegalStateException expected){}
        }
        require(handles.size()==16,"Concurrent process admission did not stop at sixteen");allocations+=handles.size();
        try(ManagedResources probe=new ManagedResources()){require(probe.reserve("dev.pjm.probe",10000)==null,"Seventeenth process resource admitted");}
        await(gate);await(gate);
        require(pending>0,"No delayed producers exercised");pendingChecks+=pending;
        try(ManagedResources probe=new ManagedResources()){
          for(int i=0;i<16-pending;i++){ManagedResources.Slot slot=probe.reserve("dev.pjm.probe",10000+i);require(slot!=null,"Completed resource capacity leaked");slot.finish(0);}
          require(probe.reserve("dev.pjm.probe",20000)==null,"Retirement freed a producer that is still running");
        }
        await(gate);await(gate);
        try(ManagedResources probe=new ManagedResources()){
          for(int i=0;i<16;i++){ManagedResources.Slot slot=probe.reserve("dev.pjm.probe",30000+i);require(slot!=null,"Late producer completion leaked a permit");slot.finish(0);}
          require(probe.reserve("dev.pjm.probe",40000)==null,"Process capacity changed after recovery");
        }
      }
      for(Future<?> task:tasks)task.get(10,TimeUnit.SECONDS);
      require(failure.get()==null,"Owner failed");
      try(ManagedResources probe=new ManagedResources()){
        for(int i=0;i<4;i++){ManagedResources.Slot slot=probe.reserve("dev.pjm.probe",50000);require(slot!=null,"Generation refill failed");slot.finish(0);}
        require(probe.reserve("dev.pjm.probe",50000)==null,"Fifth generation resource admitted");
        probe.retire(50000);ManagedResources.Slot recovered=probe.reserve("dev.pjm.probe",50001);require(recovered!=null,"Final generation retirement leaked");recovered.finish(0);
      }
      return new JSONObject().put("authenticatedIdentities",identities.length).put("owners",OWNERS).put("rounds",ROUNDS).put("contendedAdmissions",allocations).put("delayedProducerChecks",pendingChecks).put("processCap",16).put("perGenerationCap",4);
    }finally{gate.reset();executor.shutdownNow();require(executor.awaitTermination(10,TimeUnit.SECONDS),"Owner threads did not stop");}
  }
  @Override public void onCreate(Bundle state){
    super.onCreate(state);TextView receipt=new TextView(this);receipt.setText("Concurrent native resource checks running");setContentView(receipt);
    new Thread(()->{String result;try{result="native-resource-process PASS "+stress();}catch(Throwable problem){android.util.Log.e("PocketJS","Resource process stress failed",problem);result="native-resource-process FAIL "+problem;}final String proof=result;runOnUiThread(()->{receipt.setText(proof);receipt.setContentDescription(proof);});},"pjm-resource-coordinator").start();
  }
}
