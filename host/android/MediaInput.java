package dev.pjm.android;
import java.io.*;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;

/** Reads only provider-owned input, with a byte ceiling before buffer growth. */
final class MediaInput {
 static byte[] read(InputStream input,BooleanSupplier cancelled)throws IOException {
  try(InputStream source=input;ByteArrayOutputStream output=new ByteArrayOutputStream()){
   byte[] buffer=new byte[8192];int count;
   while(true){if(cancelled.getAsBoolean()||Thread.currentThread().isInterrupted())throw new CancellationException();count=source.read(buffer);if(count<0)break;if(count==0){int value=source.read();if(value<0)break;if(output.size()==MediaContract.SOURCE_BYTES)throw new IOException("Media source exceeds limit");output.write(value);continue;}if(count>MediaContract.SOURCE_BYTES-output.size())throw new IOException("Media source exceeds limit");output.write(buffer,0,count);}
   if(cancelled.getAsBoolean())throw new CancellationException();return output.toByteArray();
  }
 }
}
