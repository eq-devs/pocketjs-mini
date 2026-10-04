package dev.pjm.android;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.UUID;
import org.json.JSONObject;

/** Host-owned signed cache. Updates are promoted only on a cold start. */
final class PackageStore {
  private final File root;private final byte[] key;private final Thread owner=Thread.currentThread();
  private Exception lastCleanupError;
  static final class Busy extends IOException {Busy(){super("Package store is busy");}}
  PackageStore(File root,byte[] trustedKey)throws Exception{
    if(root==null || trustedKey==null || trustedKey.length!=32)throw new IOException("Private root and publisher key required");
    this.root=root.getAbsoluteFile();key=trustedKey.clone();directory(this.root);
  }
  private void owner(){if(Thread.currentThread()!=owner)throw new IllegalStateException("Package store owner thread required");}
  private static void real(File value)throws IOException{if(!value.getAbsoluteFile().equals(value.getCanonicalFile()))throw new IOException("Package path contains symbolic links");}
  private static void directory(File value)throws IOException{real(value);PackageFiles.directory(PackageFiles.path(value));real(value);}
  private static void identity(String value)throws IOException{if(value==null || value.length()>128 || !value.matches("[a-zA-Z][a-zA-Z0-9_-]*(\\.[a-zA-Z][a-zA-Z0-9_-]*)+"))throw new IOException("Invalid package identity");}
  private static boolean slot(String value){return value!=null && value.length()<=192 && value.matches("[0-9]+\\.[0-9]+\\.[0-9]+-[a-f0-9]{64}");}
  private interface Work<T>{T run()throws Exception;}
  private <T>T locked(Work<T> work)throws Exception{
    owner();real(root);int descriptor=PackageFiles.lock(PackageFiles.path(root));if(descriptor<0)throw new Busy();
    try{return work.run();}finally{PackageFiles.unlock(descriptor);}
  }
  private static byte[] read(File path,int maximum,boolean missing)throws Exception{return PackageFiles.read(PackageFiles.path(path),maximum,missing);}
  private static void sync(File folder)throws Exception{PackageFiles.sync(PackageFiles.path(folder));}
  private static void write(File path,byte[] bytes)throws Exception{PackageFiles.write(PackageFiles.path(path),bytes,(".write-"+UUID.randomUUID()).getBytes(StandardCharsets.UTF_8));}
  private JSONObject state(File app)throws Exception{
    byte[] bytes=read(new File(app,"state.json"),2048,true);JSONObject state=bytes==null?new JSONObject():new JSONObject(StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(bytes)).toString());
    Iterator<String> names=state.keys();while(names.hasNext()){String name=names.next();Object value=state.get(name);if(!(name.equals("current") || name.equals("previous") || name.equals("pending")) || !(value instanceof String) || !slot((String)value))throw new IOException("Invalid package state");}return state;
  }
  private static String digest(byte[] payload)throws Exception{StringBuilder text=new StringBuilder();for(byte value:MessageDigest.getInstance("SHA-256").digest(payload))text.append(String.format(java.util.Locale.ROOT,"%02x",value&255));return text.toString();}
  private VerifiedPackage load(File app,String name,String identity)throws Exception{
    if(!slot(name))throw new IOException("Package is not installed");File folder=new File(app,name);real(folder);if(!folder.isDirectory())throw new IOException("Invalid package slot");
    byte[] payload=read(new File(folder,"main.pocket"),64*1024*1024,false),envelope=read(new File(folder,"manifest.json"),65536,false);
    VerifiedPackage result=new VerifiedPackage(payload,envelope,key);if(!identity.equals(result.identity) || !name.equals(result.version+"-"+digest(payload)))throw new IOException("Installed package identity mismatch");return result;
  }
  private void commit(File app,JSONObject state)throws Exception{write(new File(app,"state.json"),state.toString().getBytes(StandardCharsets.UTF_8));}
  Exception lastCleanupError(){owner();return lastCleanupError;}
  private static boolean temporary(String name,String prefix){return name.matches(java.util.regex.Pattern.quote(prefix)+"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}");}
  private void prune(File app,JSONObject state){
    lastCleanupError=null;
    try{real(app);File[] entries=app.listFiles();if(entries==null)throw new IOException("Package cache scan failed");
      for(File entry:entries){String name=entry.getName();if(temporary(name,".write-")){real(entry);PackageFiles.remove(PackageFiles.path(entry),false);continue;}
        if(!slot(name) && !temporary(name,".install-"))continue;
        if(name.equals(state.optString("current")) || name.equals(state.optString("previous")) || name.equals(state.optString("pending")))continue;
        real(entry);if(!entry.isDirectory())throw new IOException("Invalid stale package directory");File[] files=entry.listFiles();if(files==null)throw new IOException("Package slot scan failed");
        for(File file:files){String child=file.getName();if(!child.equals("main.pocket") && !child.equals("manifest.json") && !temporary(child,".write-"))throw new IOException("Unexpected stale package contents");real(file);if(!file.isFile())throw new IOException("Invalid stale package file");}
        for(File file:files)PackageFiles.remove(PackageFiles.path(file),false);PackageFiles.remove(PackageFiles.path(entry),true);
      }sync(app);
    }catch(Exception error){lastCleanupError=error;}
  }
  void seed(byte[] payload,byte[] envelope)throws Exception{stage(payload,envelope,true);}
  void stage(byte[] payload,byte[] envelope)throws Exception{stage(payload,envelope,false);}
  private void stage(byte[] payload,byte[] envelope,boolean seed)throws Exception{
    owner();if(payload==null || payload.length<1 || payload.length>64*1024*1024 || envelope==null || envelope.length>65536)throw new IOException("Package inputs outside bounds");byte[] source=payload.clone(),manifest=envelope.clone();VerifiedPackage admitted=new VerifiedPackage(source,manifest,key);
    identity(admitted.identity);String name=admitted.version+"-"+digest(source);if(!slot(name))throw new IOException("Invalid signed package version");
    locked(()->{File app=new File(root,admitted.identity);directory(app);JSONObject state=state(app);if(seed && (state.has("current") || state.has("pending")))return null;
      File destination=new File(app,name);real(destination);
      if(destination.exists()){
        load(app,name,admitted.identity);JSONObject saved=new JSONObject(new String(read(new File(destination,"manifest.json"),65536,false),StandardCharsets.UTF_8));JSONObject fresh=new JSONObject(new String(manifest,StandardCharsets.UTF_8));
        if(!PackageVerifier.canonical(saved).equals(PackageVerifier.canonical(fresh)))throw new IOException("Existing slot has different signed metadata");
      }else{
        File temporary=new File(app,".install-"+UUID.randomUUID());directory(temporary);
        try{write(new File(temporary,"main.pocket"),source);write(new File(temporary,"manifest.json"),manifest);real(app);real(destination);PackageFiles.rename(PackageFiles.path(temporary),PackageFiles.path(destination));sync(app);}finally{if(temporary.exists()){PackageFiles.remove(PackageFiles.path(new File(temporary,"main.pocket")),false);PackageFiles.remove(PackageFiles.path(new File(temporary,"manifest.json")),false);PackageFiles.remove(PackageFiles.path(temporary),true);}}
      }
      state.put("pending",name);commit(app,state);prune(app,state);return null;
    });
  }
  VerifiedPackage coldStart(String identity)throws Exception{
    identity(identity);return locked(()->{File app=new File(root,identity);real(app);JSONObject state=state(app);String name=state.optString("pending",state.optString("current",null));VerifiedPackage result=load(app,name,identity);
      if(!name.equals(state.optString("current",null))){if(state.has("current"))state.put("previous",state.get("current"));state.put("current",name);}state.remove("pending");commit(app,state);prune(app,state);return result;
    });
  }
  void rollback(String identity)throws Exception{
    identity(identity);locked(()->{File app=new File(root,identity);real(app);JSONObject state=state(app);String previous=state.optString("previous",null);load(app,previous,identity);state.put("pending",previous);commit(app,state);return null;});
  }
}
