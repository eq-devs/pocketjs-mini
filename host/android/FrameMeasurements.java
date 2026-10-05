package dev.pjm.android;
/** Bounded host CPU/submission diagnostics, not swap/presentation timestamps. */
final class FrameMeasurements {
  private long count,totalCpu,maxCpu,slowCpu,first,last,maxInterval,slowInterval;
  synchronized void record(long start,long end){
    if(start<0||end<start||(count>0&&start<last)||count==Long.MAX_VALUE)return;
    long duration=end-start;if(totalCpu>Long.MAX_VALUE-duration)return;
    if(count==0)first=start;
    else if(start>=last){long interval=start-last;maxInterval=Math.max(maxInterval,interval);if(interval>33_000_000L)slowInterval++;}
    last=start;count++;totalCpu+=duration;maxCpu=Math.max(maxCpu,duration);if(duration>33_000_000L)slowCpu++;
  }
  synchronized String report(){return "{\"kind\":\"host_cpu_submission\",\"frames\":"+count+",\"elapsedNs\":"+(count<2?0:last-first)+",\"totalCpuNs\":"+totalCpu+",\"maxCpuNs\":"+maxCpu+",\"cpuOver33ms\":"+slowCpu+",\"maxIntervalNs\":"+maxInterval+",\"intervalsOver33ms\":"+slowInterval+"}";}
}
