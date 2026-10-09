package dev.pjm.android;
import java.io.*;
import java.util.concurrent.CancellationException;
public final class MediaInputTest {
 static void require(boolean value){if(!value)throw new AssertionError();}
 static class Source extends InputStream {int remaining;boolean closed;Source(int bytes){remaining=bytes;}public int read(){return remaining-- >0?7:-1;}public int read(byte[] bytes,int offset,int count){if(remaining<=0)return -1;int size=Math.min(count,remaining);java.util.Arrays.fill(bytes,offset,offset+size,(byte)7);remaining-=size;return size;}public void close(){closed=true;}}
 public static void main(String[] arguments)throws Exception {
  Source maximum=new Source(MediaContract.SOURCE_BYTES);byte[] bytes=MediaInput.read(maximum,()->false);require(bytes.length==MediaContract.SOURCE_BYTES&&bytes[bytes.length-1]==7&&maximum.closed);
  Source overflow=new Source(MediaContract.SOURCE_BYTES+1);try{MediaInput.read(overflow,()->false);throw new AssertionError();}catch(IOException expected){require(overflow.closed);}
  Source cancelled=new Source(16);try{MediaInput.read(cancelled,()->true);throw new AssertionError();}catch(CancellationException expected){require(cancelled.closed&&cancelled.remaining==16);}
  Source zero=new Source(2){public int read(byte[] bytes,int offset,int count){return 0;}};require(MediaInput.read(zero,()->false).length==2&&zero.closed);
  System.out.println("Media provider input: exact/overflow bytes, cancellation, zero-read progress and closure passed");
 }
}
