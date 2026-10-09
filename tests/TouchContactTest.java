package dev.pjm.android;
public final class TouchContactTest {
  public static void main(String[] args){
    TouchContact old=new TouchContact();old.pointer=0;old.identifier=2;old.hit=123;
    old.update(195,650,false);old.update(195,200,true);
    TouchContact next=new TouchContact();next.pointer=0;next.identifier=3;next.hit=10;
    next.update(340,32,false);
    // A queued move/up for reused pointer 0 must not alter the old final sample.
    old.update(340,32,false);old.update(340,32,true);
    next.update(341,33,true);
    if(!old.ended||old.x!=195||old.y!=200||old.hit!=123||old.identifier!=2)throw new AssertionError("Ended contact changed");
    if(!next.ended||next.x!=341||next.y!=33||next.hit!=10||next.identifier!=3)throw new AssertionError("New contact lost");
    if(old.sampleX()!=195||old.sampleY()!=650||old.drained())throw new AssertionError("Initial position lost");
    old.sampled();
    if(old.sampleY()!=200||old.drained())throw new AssertionError("Final position skipped");
    old.sampled();if(!old.drained())throw new AssertionError("Ended contact retained");
    TouchContact moving=new TouchContact();moving.update(10,20,false);moving.sampled();moving.update(30,40,false);
    if(moving.sampleX()!=30||moving.sampleY()!=40||moving.drained())throw new AssertionError("Live movement lost");
    moving.sampled();moving.update(50,60,true);moving.sampled();if(!moving.drained())throw new AssertionError("Reported contact delayed");
    System.out.println("Touch pointer reuse regression passed");
  }
}
