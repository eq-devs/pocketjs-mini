package dev.pjm.android;
import java.util.*;
/** Process-shared ledger is held by VerifiedLocation; keys are authenticated app IDs. */
final class LocationRate {
  private final Map<String,ArrayDeque<Long>> buckets=new HashMap<>();
  interface Clock {long now();}
  private final Clock clock;
  LocationRate(Clock clock){this.clock=Objects.requireNonNull(clock);}
  private long lastTime;
  synchronized boolean admit(String identity){
    long now=clock.now();
    if(identity==null||identity.isEmpty()||identity.length()>128||now<0||now<lastTime)throw new IllegalArgumentException("Invalid location quota identity or clock");
    lastTime=now;
    Iterator<ArrayDeque<Long>> entries=buckets.values().iterator();
    while(entries.hasNext()){ArrayDeque<Long> times=entries.next();while(!times.isEmpty()&&times.peekFirst()<=now-60000)times.removeFirst();if(times.isEmpty())entries.remove();}
    ArrayDeque<Long> times=buckets.get(identity);
    if(times==null){if(buckets.size()>=64)return false;times=new ArrayDeque<>();buckets.put(identity,times);}
    if(times.size()>=16)return false;times.addLast(now);return true;
  }
}
