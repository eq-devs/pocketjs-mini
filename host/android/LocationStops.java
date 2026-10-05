package dev.pjm.android;
import java.util.*;
/** UI-owned cleanup for one deadline, one approval and one provider operation. */
final class LocationStops {
  private final List<Runnable> actions=new ArrayList<>();private boolean closed;private int count;
  private void run(Runnable action){try{action.run();}catch(RuntimeException ignored){}}
  synchronized void add(Runnable action){Objects.requireNonNull(action);if(++count>3){run(action);throw new IllegalStateException("Too many location operations");}if(closed)run(action);else actions.add(action);}
  synchronized void close(){if(closed)return;closed=true;List<Runnable> stopped=new ArrayList<>(actions);actions.clear();for(Runnable action:stopped)run(action);}
}
