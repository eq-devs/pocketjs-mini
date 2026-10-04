package dev.pjm.android;

import android.util.AtomicFile;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.util.Iterator;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;

/** Host-bound identity; guest keys remain JSON data, never path components. */
final class AppStorage {
  static final class Busy extends IOException { Busy(){super("Application storage is busy");} }
  private final File directory;
  AppStorage(File root,String appId) throws Exception {
    if(appId==null || appId.length()>128 || !appId.matches("[a-zA-Z][a-zA-Z0-9_-]*(\\.[a-zA-Z][a-zA-Z0-9_-]*)+")) throw new IOException("Invalid host app identity");
    directory=new File(root.getCanonicalFile(),"mini-data/"+appId);
    real(directory);
    if(!directory.mkdirs() && !directory.isDirectory())throw new IOException("Storage directory unavailable");
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
    File lockPath=new File(directory,".storage-lock");real(lockPath);
    // Keep the inode in place: unlinking a lock file would split lock owners.
    try(RandomAccessFile lockFile=new RandomAccessFile(lockPath,"rw")) {
      FileLock lock;
      try {lock=lockFile.getChannel().tryLock();}catch(OverlappingFileLockException overlap){throw new Busy();}
      if(lock==null)throw new Busy();
      try {return dispatchLocked(kind,arguments);}finally{lock.release();}
    }
  }
  private Object dispatchLocked(String kind,Object arguments) throws Exception {
    if(!(arguments instanceof JSONObject))throw new IllegalArgumentException("Storage arguments must be an object");
    JSONObject args=(JSONObject)arguments;Object key=args.opt("key");key(key);
    real(directory);if(!directory.isDirectory())throw new IOException("Storage directory unavailable");
    File path=new File(directory,"storage.json");real(path);
    // AtomicFile owns .new/.bak recovery files; reject replacements there too.
    real(new File(path+".new"));real(new File(path+".bak"));
    AtomicFile file=new AtomicFile(path);JSONObject values=new JSONObject();
    if(path.exists() || new File(path+".bak").exists()) {
      try(InputStream input=file.openRead()) {
        ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;
        while((count=input.read(buffer))!=-1){if(output.size()+count>1048576)throw new IOException("Storage file exceeds quota");output.write(buffer,0,count);}
        values=new JSONObject(new String(output.toByteArray(),"UTF-8"));
      }
      if(values.length()>256)throw new IOException("Invalid storage contents");
      Iterator<String> keys=values.keys();while(keys.hasNext()){String stored=keys.next();key(stored);if(bytes(values.get(stored))>2048)throw new IOException("Invalid stored value");}
    }
    if(kind.equals("storage.get.v1"))return values.has((String)key)?values.get((String)key):JSONObject.NULL;
    if(kind.equals("storage.set.v1")) {
      if(!args.has("value"))throw new IllegalArgumentException("Storage value is required");
      Object value=args.get("value");if(bytes(value)>2048)throw new IllegalArgumentException("Storage value exceeds quota");values.put((String)key,value);
    }else if(kind.equals("storage.remove.v1"))values.remove((String)key);
    else throw new IllegalArgumentException("Unknown storage operation");
    byte[] encoded=values.toString().getBytes("UTF-8");
    if(values.length()>256 || encoded.length>1048576)throw new IllegalArgumentException("Application storage quota exceeded");
    FileOutputStream output=null;
    try {output=file.startWrite();output.write(encoded);file.finishWrite(output);}
    catch(Exception error){if(output!=null)file.failWrite(output);throw error;}
    return JSONObject.NULL;
  }
}
