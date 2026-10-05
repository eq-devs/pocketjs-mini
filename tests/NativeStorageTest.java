package dev.pjm.android;
import java.io.*;
import org.json.JSONObject;
import android.system.Os;

/** Runs against Android JSON and native directory-relative storage through dalvikvm. */
public final class NativeStorageTest {
  private static void check(boolean value){if(!value)throw new AssertionError("Native storage assertion failed");}
  private static JSONObject args(String key,Object value)throws Exception{return new JSONObject().put("key",key).put("value",value);}
  private static void remove(File file){if(file.isDirectory())for(File child:file.listFiles())remove(child);check(file.delete());}
  public static void main(String[] arguments)throws Exception {
    NativeJsonTest.verify();
    File root=new File(arguments[0]);check(root.mkdir());
    try {
      AppStorage first=new AppStorage(root,"com.example.first"),second=new AppStorage(root,"com.example.first"),other=new AppStorage(root,"com.example.other");
      File directory=new File(root,"mini-data/com.example.first"),lockPath=new File(directory,".storage-lock");
      int held=PackageFiles.lockFile(PackageFiles.path(directory),".storage-lock".getBytes("UTF-8"));check(held>=0);try {
        try{first.dispatch("storage.set.v1",args("blocked",1));throw new AssertionError("Missing busy error");}catch(AppStorage.Busy expected){}
        try{second.dispatch("storage.get.v1",args("blocked",null));throw new AssertionError("Missing busy error");}catch(AppStorage.Busy expected){}
        other.dispatch("storage.set.v1",args("ok",1));
      }finally{PackageFiles.unlock(held);}
      first.dispatch("storage.set.v1",args("../__proto__","😀"));second.dispatch("storage.set.v1",args("second",2));
      check(second.dispatch("storage.get.v1",args("../__proto__",null)).equals("😀"));
      check(first.dispatch("storage.get.v1",args("second",null)).equals(2));
      check(other.dispatch("storage.get.v1",args("../__proto__",null))==JSONObject.NULL);
      File snapshot=new File(directory,"storage.json"),backup=new File(directory,"storage.json.bak"),pending=new File(directory,"storage.json.new");
      byte[] saved=java.nio.file.Files.readAllBytes(snapshot.toPath());java.nio.file.Files.write(backup.toPath(),saved);java.nio.file.Files.write(snapshot.toPath(),"bad partial".getBytes("UTF-8"));java.nio.file.Files.write(pending.toPath(),"uncommitted".getBytes("UTF-8"));
      File crash=new File(directory,".write-00000000-0000-0000-0000-000000000000");java.nio.file.Files.write(crash.toPath(),"partial".getBytes("UTF-8"));
      check(second.dispatch("storage.get.v1",args("second",null)).equals(2));check(!crash.exists());check(!backup.exists() && !pending.exists());check(java.util.Arrays.equals(saved,java.nio.file.Files.readAllBytes(snapshot.toPath())));
      java.nio.file.Files.write(backup.toPath(),"broken backup".getBytes("UTF-8"));try{second.dispatch("storage.get.v1",args("second",null));throw new AssertionError("Invalid legacy backup accepted");}catch(org.json.JSONException expected){}check(backup.exists());check(backup.delete());
      for(int i=0;i<254;i++)first.dispatch("storage.set.v1",args("key-"+i,i));
      try{second.dispatch("storage.set.v1",args("overflow",0));throw new AssertionError("Missing count quota");}catch(IllegalArgumentException expected){}
      check(first.dispatch("storage.get.v1",args("second",null)).equals(2));
      File file=new File(directory,"storage.json");try(FileOutputStream output=new FileOutputStream(file)){output.write("invalid".getBytes("UTF-8"));}
      try{second.dispatch("storage.set.v1",args("second",3));throw new AssertionError("Corrupt snapshot accepted");}catch(org.json.JSONException expected){}
      try(FileInputStream input=new FileInputStream(file)){check(input.read()=='i');}
      check(lockPath.delete());Os.symlink(file.getAbsolutePath(),lockPath.getAbsolutePath());
      try{second.dispatch("storage.get.v1",args("second",null));throw new AssertionError("Symbolic lock accepted");}catch(IOException expected){}
      check(lockPath.delete());
      System.out.println("Native Android storage: competing providers, busy isolation, lock release, quotas, corruption and symbolic links passed");
    }finally{remove(root);}
  }
}
