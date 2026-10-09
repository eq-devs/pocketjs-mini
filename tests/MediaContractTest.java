package dev.pjm.android;
import java.util.*;
public final class MediaContractTest {
 static void require(boolean value){if(!value)throw new AssertionError();}
 static void rejected(Runnable action){try{action.run();throw new AssertionError("Invalid media accepted");}catch(IllegalArgumentException expected){}}
 public static void main(String[] arguments){Map<String,Object> value=new HashMap<>();value.put("source","camera");value.put("maxDimension",64);value.put("quality",90);MediaContract.Options options=MediaContract.options(value);require(options.source.equals("camera")&&options.maxDimension==64&&options.quality==90);MediaContract.result(64,1,1048576,options);
  for(Object bad:Arrays.asList(null,true,"64",63,1025,64.5,Double.NaN)){Map<String,Object> copy=new HashMap<>(value);copy.put("maxDimension",bad);rejected(()->MediaContract.options(copy));}
  for(Object bad:Arrays.asList(null,"file",true)){Map<String,Object> copy=new HashMap<>(value);copy.put("source",bad);rejected(()->MediaContract.options(copy));}
  value.put("path","/tmp/image.jpg");rejected(()->MediaContract.options(value));
  rejected(()->new MediaContract.Options("library",64,91));rejected(()->MediaContract.sourceDimensions(8193,1));rejected(()->MediaContract.sourceDimensions(4097,4096));rejected(()->MediaContract.result(65,1,1,options));rejected(()->MediaContract.result(64,1,1048577,options));
  require(MediaContract.sampleSize(8192,2048,1024)==4);require(MediaContract.sampleSize(320,160,64)==4);
  System.out.println("Media contract: source/dimension/quality limits, sample budgeting and output admission passed");
 }
}
