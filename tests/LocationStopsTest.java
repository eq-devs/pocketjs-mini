package dev.pjm.android;
final class LocationStopsTest {
 public static void main(String[] args){
  int[] calls={0};LocationStops stops=new LocationStops();stops.add(()->{calls[0]++;throw new IllegalStateException();});stops.add(()->calls[0]++);stops.close();stops.close();if(calls[0]!=2)throw new AssertionError();
  LocationStops synchronous=new LocationStops();synchronous.close();synchronous.add(()->calls[0]++);synchronous.add(()->calls[0]++);if(calls[0]!=4)throw new AssertionError();
  synchronous.add(()->calls[0]++);if(calls[0]!=5)throw new AssertionError();
  try{synchronous.add(()->calls[0]++);throw new AssertionError();}catch(IllegalStateException expected){}if(calls[0]!=6)throw new AssertionError();
  System.out.println("Location approval/provider cleanup JVM cases passed; no native prompts executed.");
 }
}
