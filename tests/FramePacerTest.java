package dev.pjm.android;
public final class FramePacerTest {
  private static void check(boolean value){if(!value)throw new AssertionError("Frame pacing");}
  public static void main(String[] args){
    for(int hz:new int[]{60,90,120,144,240}){
      FramePacer pacer=new FramePacer();int accepted=0;
      for(int i=0;i<hz*10;i++){if(pacer.request((long)i*1_000_000_000L/hz)){accepted++;pacer.complete();}}
      check(accepted>=599&&accepted<=601);
    }
    FramePacer pacer=new FramePacer();check(pacer.request(0));check(!pacer.request(1_000_000_000L));pacer.complete();
    check(pacer.request(1_000_000_000L));pacer.complete();check(!pacer.request(1_000_000_001L));
    check(!pacer.request(1));pacer.reset();check(pacer.request(0));pacer.complete();
    FrameMeasurements metrics=new FrameMeasurements();
    metrics.record(0,5_000_000);metrics.record(16_000_000,21_000_000);metrics.record(50_000_000,55_000_000);
    String expected="{\"kind\":\"host_cpu_submission\",\"frames\":3,\"elapsedNs\":50000000,\"totalCpuNs\":15000000,\"maxCpuNs\":5000000,\"cpuOver33ms\":0,\"maxIntervalNs\":34000000,\"intervalsOver33ms\":1}";
    check(metrics.report().equals(expected));metrics.record(1,2);metrics.record(60,50);check(metrics.report().equals(expected));
    System.out.println("Frame pacing: 60/90/120/144/240 Hz, backpressure, skipped deadlines and resume passed");
  }
}
