package dev.pjm.android;
import java.util.*;

/** Wire/admission policy shared by native library and camera providers. */
final class MediaContract {
 static final int SOURCE_BYTES=8*1024*1024,RESOURCE_BYTES=1024*1024,SOURCE_SIDE=8192,SOURCE_PIXELS=16*1024*1024;
 static final class Options {final String source;final int maxDimension,quality;Options(String source,int dimension,int quality){require(("library".equals(source)||"camera".equals(source))&&dimension>=64&&dimension<=1024&&quality>=25&&quality<=90);this.source=source;maxDimension=dimension;this.quality=quality;}}
 private static void require(boolean value){if(!value)throw new IllegalArgumentException("Invalid media service record");}
 private static int integer(Object value,int minimum,int maximum){require(value instanceof Number);double number=((Number)value).doubleValue();require(Double.isFinite(number)&&number>=minimum&&number<=maximum&&Math.floor(number)==number);return (int)number;}
 static Options options(Map<String,?> fields){require(fields!=null&&fields.size()==3&&fields.keySet().containsAll(Arrays.asList("source","maxDimension","quality")));Object source=fields.get("source");require("library".equals(source)||"camera".equals(source));return new Options((String)source,integer(fields.get("maxDimension"),64,1024),integer(fields.get("quality"),25,90));}
 static void sourceDimensions(int width,int height){require(width>0&&height>0&&width<=SOURCE_SIDE&&height<=SOURCE_SIDE&&(long)width*height<=SOURCE_PIXELS);}
 static void result(int width,int height,int bytes,Options options){require(options!=null&&width>0&&height>0&&width<=options.maxDimension&&height<=options.maxDimension&&bytes>0&&bytes<=RESOURCE_BYTES);}
 static int sampleSize(int width,int height,int maximum){sourceDimensions(width,height);require(maximum>=64&&maximum<=1024);int sample=1;while(Math.max((width+sample-1)/sample,(height+sample-1)/sample)>maximum*2)sample*=2;return sample;}
}
