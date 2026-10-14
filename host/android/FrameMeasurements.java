package dev.pjm.android;
/** Bounded render/submission elapsed wall time, not thread CPU or presentation timestamps. */
final class FrameMeasurements {
  private long count,totalWall,maxWall,slowWall,first,last,maxInterval,slowInterval;
  synchronized void record(long start,long end){
    if(start<0||end<start||(count>0&&start<last)||count==Long.MAX_VALUE)return;
    long duration=end-start;if(totalWall>Long.MAX_VALUE-duration)return;
    if(count==0)first=start;
    else if(start>=last){long interval=start-last;maxInterval=Math.max(maxInterval,interval);if(interval>33_000_000L)slowInterval++;}
    last=start;count++;totalWall+=duration;maxWall=Math.max(maxWall,duration);if(duration>33_000_000L)slowWall++;
  }
  synchronized String report(){return "{\"kind\":\"host_submission_wall\",\"frames\":"+count+",\"elapsedNs\":"+(count<2?0:last-first)+",\"totalWallNs\":"+totalWall+",\"maxWallNs\":"+maxWall+",\"wallOver33ms\":"+slowWall+",\"maxIntervalNs\":"+maxInterval+",\"intervalsOver33ms\":"+slowInterval+"}";}
}
