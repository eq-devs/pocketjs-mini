package dev.pjm.android;
import android.app.Activity;
import android.os.Bundle;
import android.graphics.*;
import android.media.ExifInterface;
import android.widget.TextView;
import java.io.*;

public final class NativeMediaImageActivity extends Activity {
 private static void require(boolean value){if(!value)throw new AssertionError("Media image assertion");}
 private static byte[] png(int width,int height)throws IOException {Bitmap image=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(image);Paint red=new Paint();red.setColor(Color.RED);canvas.drawRect(0,0,width/2,height,red);ByteArrayOutputStream bytes=new ByteArrayOutputStream();require(image.compress(Bitmap.CompressFormat.PNG,100,bytes));image.recycle();return bytes.toByteArray();}
 private static void rejected(byte[] bytes,MediaContract.Options options)throws Exception {try{MediaImage.decode(bytes,options);throw new AssertionError("Invalid image admitted");}catch(IOException expected){}}
 private void test()throws Exception {
  MediaContract.Options options=new MediaContract.Options("library",64,80);MediaImage image=MediaImage.decode(png(320,160),options);require(image.width==64&&image.height==32&&image.jpeg.length>0&&image.jpeg.length<=1048576);
  Bitmap decoded=BitmapFactory.decodeByteArray(image.jpeg,0,image.jpeg.length);require(decoded!=null);int white=decoded.getPixel(55,16);require(Color.red(white)>240&&Color.green(white)>240&&Color.blue(white)>240);decoded.recycle();
  File source=new File(getCacheDir(),"source.jpg");try(FileOutputStream stream=new FileOutputStream(source)){stream.write(image.jpeg);}
  ExifInterface exif=new ExifInterface(source.getPath());exif.setAttribute(ExifInterface.TAG_ORIENTATION,"6");exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE,"43/1,15/1,0/1");exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF,"N");exif.saveAttributes();
  byte[] oriented;try(FileInputStream input=new FileInputStream(source);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)bytes.write(buffer,0,count);oriented=bytes.toByteArray();}
  require(new ExifInterface(new ByteArrayInputStream(oriented)).getAttribute(ExifInterface.TAG_GPS_LATITUDE)!=null);
  image=MediaImage.decode(oriented,new MediaContract.Options("camera",64,90));require(image.width==32&&image.height==64);ExifInterface cleaned=new ExifInterface(new ByteArrayInputStream(image.jpeg));require(cleaned.getAttribute(ExifInterface.TAG_GPS_LATITUDE)==null);int outputOrientation=cleaned.getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_UNDEFINED);require(outputOrientation==ExifInterface.ORIENTATION_UNDEFINED||outputOrientation==ExifInterface.ORIENTATION_NORMAL);
  decoded=BitmapFactory.decodeByteArray(image.jpeg,0,image.jpeg.length);require(decoded!=null);int top=decoded.getPixel(16,8),bottom=decoded.getPixel(16,55);require(Color.red(top)>220&&Color.green(top)<30&&Color.blue(top)<30&&Color.red(bottom)>240&&Color.green(bottom)>240&&Color.blue(bottom)>240);decoded.recycle();
  rejected(new byte[0],options);rejected("not an image".getBytes("UTF-8"),options);rejected(new byte[8*1024*1024+1],options);rejected(png(8193,1),options);
  require(source.delete());
 }
 @Override public void onCreate(Bundle state){super.onCreate(state);TextView status=new TextView(this);status.setText("Native media checks running");setContentView(status);new Thread(()->{String result;try{test();result="native-media-image PASS resize orientation metadata alpha bounds";}catch(Throwable failure){android.util.Log.e("PocketJS","Native media image test failed",failure);result="native-media-image FAIL "+failure;}final String proof=result;runOnUiThread(()->{status.setText(proof);status.setContentDescription(proof);});},"pjm-media-test").start();}
}
