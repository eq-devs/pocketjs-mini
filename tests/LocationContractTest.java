package dev.pjm.android;
import java.util.*;
final class LocationContractTest {
  private static int checks;
  private static void check(boolean value){checks++;if(!value)throw new AssertionError();}
  private static void rejected(Runnable work){checks++;try{work.run();}catch(IllegalArgumentException expected){return;}throw new AssertionError("Invalid location accepted");}
  static Map<String,Object> options(){Map<String,Object> value=new HashMap<>();value.put("timeoutMs",15000);value.put("maximumAgeMs",0);value.put("highAccuracy",false);return value;}
  public static void main(String[] args){
    Map<String,Object> input=options();LocationContract.Options accepted=LocationContract.options(input);input.put("timeoutMs",0);check(accepted.timeoutMs==15000&&accepted.maximumAgeMs==0&&!accepted.highAccuracy);
    for(Object timeout:new Object[]{0,15001,1.5,Double.NaN,Double.POSITIVE_INFINITY,true,"15",null}){Map<String,Object> value=options();value.put("timeoutMs",timeout);rejected(()->LocationContract.options(value));}
    for(Object age:new Object[]{-1,60001,0.5,null}){Map<String,Object> value=options();value.put("maximumAgeMs",age);rejected(()->LocationContract.options(value));}
    Map<String,Object> extra=options();extra.put("extra",true);rejected(()->LocationContract.options(extra));Map<String,Object> missing=options();missing.remove("highAccuracy");rejected(()->LocationContract.options(missing));
    LocationContract.Position position=LocationContract.position(-90,180,0,9007199254740991L);check(position.latitude==-90&&position.longitude==180);
    rejected(()->LocationContract.position(91,0,0,0));rejected(()->LocationContract.position(0,-181,0,0));rejected(()->LocationContract.position(0,0,-1,0));rejected(()->LocationContract.position(0,0,0,-1));rejected(()->LocationContract.position(0,0,0,9007199254740992L));rejected(()->LocationContract.position(Double.NaN,0,0,0));
    check(!LocationContract.cachedFixAllowed(accepted,100,100));
    Map<String,Object> cacheInput=options();cacheInput.put("maximumAgeMs",60000);LocationContract.Options cached=LocationContract.options(cacheInput);
    check(LocationContract.cachedFixAllowed(cached,100,60000000100L));check(!LocationContract.cachedFixAllowed(cached,100,60000000101L));check(!LocationContract.cachedFixAllowed(cached,101,100));
    check(LocationContract.cachedFixAllowed(cached,Long.MAX_VALUE-60000000000L,Long.MAX_VALUE));check(!LocationContract.cachedFixAllowed(cached,0,Long.MAX_VALUE));
    rejected(()->LocationContract.cachedFixAllowed(cached,-1,100));rejected(()->LocationContract.cachedFixAllowed(cached,100,-1));
    System.out.println("Android location contract JVM checks passed: "+checks+"; no provider or permission runtime executed.");
  }
}
