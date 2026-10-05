package dev.pjm.android;
/** Fixed 60 Hz guest clock; late display callbacks skip deadlines, never catch up. */
final class FramePacer {
  private static final long PERIOD=1_000_000_000L/60,TOLERANCE=1_000_000L;
  private long deadline,last=-1;private boolean pending;
  synchronized boolean request(long time){
    if(time<0 || time<last)return false;last=time;
    if(pending || (deadline!=0 && time<deadline-TOLERANCE))return false;
    if(deadline==0)deadline=time;
    long steps=time<deadline?1:(time-deadline)/PERIOD+1;
    deadline=steps>(Long.MAX_VALUE-deadline)/PERIOD?Long.MAX_VALUE:deadline+steps*PERIOD;
    pending=true;return true;
  }
  synchronized void complete(){pending=false;}
  synchronized void reset(){deadline=0;last=-1;pending=false;}
}
