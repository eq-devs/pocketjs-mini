package dev.pjm.android;
import android.graphics.*;
import android.media.ExifInterface;
import java.io.*;

/** Bounded single-image normalization; no guest-selected path or URI. */
final class MediaImage {
 final byte[] jpeg;final int width,height;
 private MediaImage(byte[] data,int width,int height){jpeg=data;this.width=width;this.height=height;}
 private static final class Output extends OutputStream {
   final byte[] bytes=new byte[MediaContract.RESOURCE_BYTES];int count;
   public void write(int value)throws IOException {if(count==bytes.length)throw new IOException("Media JPEG exceeds limit");bytes[count++]=(byte)value;}
   public void write(byte[] values,int offset,int length)throws IOException {if(length>bytes.length-count)throw new IOException("Media JPEG exceeds limit");System.arraycopy(values,offset,bytes,count,length);count+=length;}
 }
 static MediaImage decode(byte[] source,MediaContract.Options options)throws IOException {
   if(source==null || source.length==0 || source.length>MediaContract.SOURCE_BYTES || options==null)throw new IOException("Media source exceeds limit");
   BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(source,0,source.length,bounds);
   try{MediaContract.sourceDimensions(bounds.outWidth,bounds.outHeight);}catch(IllegalArgumentException invalid){throw new IOException("Media dimensions exceed limits",invalid);}
   if(!java.util.Arrays.asList("image/jpeg","image/png","image/webp","image/heif","image/heic").contains(bounds.outMimeType))throw new IOException("Unsupported media format");
   int orientation=ExifInterface.ORIENTATION_NORMAL;
   try{orientation=new ExifInterface(new ByteArrayInputStream(source)).getAttributeInt(ExifInterface.TAG_ORIENTATION,ExifInterface.ORIENTATION_NORMAL);}catch(IOException unsupported){/* Image decoder admits formats without EXIF. */}
   BitmapFactory.Options sample=new BitmapFactory.Options();sample.inSampleSize=MediaContract.sampleSize(bounds.outWidth,bounds.outHeight,options.maxDimension);sample.inScaled=false;sample.inPreferredConfig=Bitmap.Config.ARGB_8888;
   Bitmap decoded=null,normalized=null;
   try{
     decoded=BitmapFactory.decodeByteArray(source,0,source.length,sample);if(decoded==null)throw new IOException("Media decode failed");
     if(decoded.getWidth()>options.maxDimension*2 || decoded.getHeight()>options.maxDimension*2 || decoded.getAllocationByteCount()>16*1024*1024)throw new IOException("Decoded media exceeds sample budget");
     boolean swap=orientation>=ExifInterface.ORIENTATION_TRANSPOSE&&orientation<=ExifInterface.ORIENTATION_ROTATE_270;
     int orientedWidth=swap?decoded.getHeight():decoded.getWidth(),orientedHeight=swap?decoded.getWidth():decoded.getHeight();
     double scale=Math.min(1.0,(double)options.maxDimension/Math.max(orientedWidth,orientedHeight));int width=Math.max(1,(int)Math.round(orientedWidth*scale)),height=Math.max(1,(int)Math.round(orientedHeight*scale));
     normalized=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(normalized);canvas.drawColor(Color.WHITE);
     Matrix matrix=new Matrix();
     switch(orientation){case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:matrix.setScale(-1,1);break;case ExifInterface.ORIENTATION_ROTATE_180:matrix.setRotate(180);break;case ExifInterface.ORIENTATION_FLIP_VERTICAL:matrix.setScale(1,-1);break;case ExifInterface.ORIENTATION_TRANSPOSE:matrix.setRotate(90);matrix.postScale(-1,1);break;case ExifInterface.ORIENTATION_ROTATE_90:matrix.setRotate(90);break;case ExifInterface.ORIENTATION_TRANSVERSE:matrix.setRotate(-90);matrix.postScale(-1,1);break;case ExifInterface.ORIENTATION_ROTATE_270:matrix.setRotate(-90);break;default:break;}
     RectF transformed=new RectF(0,0,decoded.getWidth(),decoded.getHeight());matrix.mapRect(transformed);matrix.postTranslate(-transformed.left,-transformed.top);matrix.postScale((float)width/transformed.width(),(float)height/transformed.height());canvas.drawBitmap(decoded,matrix,new Paint(Paint.FILTER_BITMAP_FLAG));
     Output output=new Output();if(!normalized.compress(Bitmap.CompressFormat.JPEG,options.quality,output))throw new IOException("Media JPEG encoding failed");MediaContract.result(width,height,output.count,options);
     return new MediaImage(java.util.Arrays.copyOf(output.bytes,output.count),width,height);
   }finally{if(normalized!=null)normalized.recycle();if(decoded!=null)decoded.recycle();}
 }
}
