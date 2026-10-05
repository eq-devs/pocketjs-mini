package dev.pjm.android;

import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.Iterator;

/** Host-bound identity; guest keys remain JSON data, never path components. */
final class AppStorage {
  static final class Busy extends IOException { Busy(){super("Application storage is busy");} }
  private final File directory;
  AppStorage(File root,String appId) throws Exception {
    if(appId==null || appId.length()>128 || !appId.matches("[a-zA-Z][a-zA-Z0-9_-]*(\\.[a-zA-Z][a-zA-Z0-9_-]*)+")) throw new IOException("Invalid host app identity");
    directory=new File(root.getCanonicalFile(),"mini-data/"+appId);
    real(directory);
    PackageFiles.directory(PackageFiles.path(directory));
    real(directory);
  }
  private static void real(File file) throws IOException {
    if(!file.getAbsoluteFile().equals(file.getCanonicalFile()))throw new IOException("Storage path must not contain symbolic links");
  }
  private void key(Object key) throws Exception {
    if(!(key instanceof String) || ((String)key).isEmpty() || ((String)key).getBytes("UTF-8").length>128)throw new IllegalArgumentException("Storage key must contain 1..128 UTF-8 bytes");
  }
  private int bytes(Object value) throws Exception {
    String encoded=new JSONArray().put(value).toString();
    if(encoded==null)throw new IllegalArgumentException("Invalid storage value");
    return encoded.getBytes("UTF-8").length-2;
  }
  synchronized Object dispatch(String kind,Object arguments) throws Exception {
    real(directory);
    int lock=PackageFiles.lockFile(PackageFiles.path(directory),".storage-lock".getBytes("UTF-8"));if(lock<0)throw new Busy();
    try{return dispatchLocked(kind,arguments);}finally{PackageFiles.unlock(lock);}
  }

  private Object dispatchLocked(String kind,Object arguments) throws Exception {
    if(!(arguments instanceof JSONObject))throw new IllegalArgumentException("Storage arguments must be an object");
    JSONObject args=(JSONObject)arguments;Object key=args.opt("key");key(key);
    real(directory);if(!directory.isDirectory())throw new IOException("Storage directory unavailable");
    File[] stale=directory.listFiles();if(stale==null)throw new IOException("Storage directory scan failed");
    for(File candidate:stale)if(candidate.getName().matches("\\.write-[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}")){real(candidate);PackageFiles.remove(PackageFiles.path(candidate),false);}
    File path=new File(directory,"storage.json");real(path);
    // Preserve legacy AtomicFile recovery while rejecting symbolic replacements.
    real(new File(path+".new"));real(new File(path+".bak"));
    File backup=new File(path+".bak"),pending=new File(path+".new");
    byte[] saved=PackageFiles.read(PackageFiles.path(backup),1048576,true);boolean recovered=saved!=null;
    if(saved==null)saved=PackageFiles.read(PackageFiles.path(path),1048576,true);
    JSONObject values=new JSONObject();
    if(saved!=null){
      values=BoundedJson.object(saved,1048576);
      if(values.length()>256)throw new IOException("Invalid storage contents");
      Iterator<String> keys=values.keys();while(keys.hasNext()){String stored=keys.next();key(stored);if(bytes(values.get(stored))>2048)throw new IOException("Invalid stored value");}
    }
    if(recovered){PackageFiles.write(PackageFiles.path(path),saved,(".write-"+java.util.UUID.randomUUID()).getBytes("UTF-8"));PackageFiles.remove(PackageFiles.path(backup),false);}
    PackageFiles.remove(PackageFiles.path(pending),false);
    if(kind.equals("storage.get.v1"))return values.has((String)key)?values.get((String)key):JSONObject.NULL;
    if(kind.equals("storage.set.v1")) {
      if(!args.has("value"))throw new IllegalArgumentException("Storage value is required");
      Object value=args.get("value");if(bytes(value)>2048)throw new IllegalArgumentException("Storage value exceeds quota");values.put((String)key,value);
    }else if(kind.equals("storage.remove.v1"))values.remove((String)key);
    else throw new IllegalArgumentException("Unknown storage operation");
    byte[] encoded=values.toString().getBytes("UTF-8");
    if(values.length()>256 || encoded.length>1048576)throw new IllegalArgumentException("Application storage quota exceeded");
    PackageFiles.write(PackageFiles.path(path),encoded,(".write-"+java.util.UUID.randomUUID()).getBytes("UTF-8"));
    return JSONObject.NULL;
  }
}
