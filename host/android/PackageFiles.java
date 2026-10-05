package dev.pjm.android;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
/** Native no-follow traversal; every file operation pins its parent directory. */
final class PackageFiles {
  static {System.loadLibrary("pocketjs");}
  static byte[] path(File file){return file.getAbsolutePath().getBytes(StandardCharsets.UTF_8);}
  static native void directory(byte[] path)throws IOException;
  static native byte[] read(byte[] path,int maximum,boolean missing)throws IOException;
  static native void write(byte[] path,byte[] bytes,byte[] temporaryName)throws IOException;
  static native void sync(byte[] path)throws IOException;
  static native void rename(byte[] source,byte[] destination)throws IOException;
  static native void remove(byte[] path,boolean directory)throws IOException;
  static int lock(byte[] root)throws IOException{return lockFile(root,".package-lock".getBytes(StandardCharsets.UTF_8));}
  static native int lockFile(byte[] root,byte[] name)throws IOException;
  static native void unlock(int descriptor)throws IOException;
}
