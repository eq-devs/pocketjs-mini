package dev.pjm.android;
import java.util.*;

/** Pure validation shared by installed host location admission and provider replies. */
final class LocationContract {
  static final class Options {
    final long timeoutMs,maximumAgeMs;final boolean highAccuracy;
    Options(long timeout,long age,boolean accuracy){timeoutMs=timeout;maximumAgeMs=age;highAccuracy=accuracy;}
  }
  static final class Position {
    final double latitude,longitude,accuracyMeters;final long timestampMs;
    Position(double latitude,double longitude,double accuracy,long timestamp){this.latitude=latitude;this.longitude=longitude;accuracyMeters=accuracy;timestampMs=timestamp;}
  }
  private static void require(boolean value){if(!value)throw new IllegalArgumentException("Invalid location service record");}
  private static long integer(Object value,long minimum,long maximum){
    require(value instanceof Number);double number=((Number)value).doubleValue();
    require(Double.isFinite(number)&&number>=minimum&&number<=maximum&&Math.floor(number)==number);return (long)number;
  }
  static Options options(Map<String,?> value){
    require(value!=null&&value.size()==3&&value.keySet().containsAll(Arrays.asList("timeoutMs","maximumAgeMs","highAccuracy")));
    long timeout=integer(value.get("timeoutMs"),1,15000),age=integer(value.get("maximumAgeMs"),0,60000);Object accuracy=value.get("highAccuracy");require(accuracy instanceof Boolean);
    return new Options(timeout,age,(Boolean)accuracy);
  }
  static Position position(double latitude,double longitude,double accuracyMeters,long timestampMs){
    require(Double.isFinite(latitude)&&latitude>=-90&&latitude<=90&&Double.isFinite(longitude)&&longitude>=-180&&longitude<=180&&Double.isFinite(accuracyMeters)&&accuracyMeters>=0&&accuracyMeters<=10000000&&timestampMs>=0&&timestampMs<=9007199254740991L);
    return new Position(latitude,longitude,accuracyMeters,timestampMs);
  }
  /** Android Location.getElapsedRealtimeNanos and the host monotonic clock.
   * A zero maximum age requests a fresh provider result, never cached data. */
  static boolean cachedFixAllowed(Options options,long fixElapsedNanos,long nowElapsedNanos){
    require(options!=null&&fixElapsedNanos>=0&&nowElapsedNanos>=0);
    if(options.maximumAgeMs==0||fixElapsedNanos>nowElapsedNanos)return false;
    // Nonnegative ordered operands make subtraction safe; bounded ms scaling is safe.
    return nowElapsedNanos-fixElapsedNanos<=options.maximumAgeMs*1000000L;
  }
}
