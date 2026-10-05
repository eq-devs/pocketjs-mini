package dev.pjm.android;
final class LocationRateTest {
  private static int checks;
  private static void check(boolean value){checks++;if(!value)throw new AssertionError();}
  public static void main(String[] args){
    long[] time={0};LocationRate rate=new LocationRate(()->time[0]);for(int count=0;count<16;count++)check(rate.admit("dev.app.first"));check(!rate.admit("dev.app.first"));check(rate.admit("dev.app.second"));time[0]=59999;check(!rate.admit("dev.app.first"));time[0]=60000;check(rate.admit("dev.app.first"));
    time[0]=0;LocationRate identities=new LocationRate(()->time[0]);for(int index=0;index<64;index++)check(identities.admit("dev.app.id"+index));check(!identities.admit("dev.app.extra"));time[0]=60000;check(identities.admit("dev.app.extra"));
    try{time[0]=59999;identities.admit("dev.app.extra");throw new AssertionError();}catch(IllegalArgumentException expected){checks++;}
    System.out.println("Android location quota JVM checks passed: "+checks+"; no platform location access.");
  }
}
