package dev.pjm.android;
import android.app.*;
import android.content.*;
import android.content.res.AssetFileDescriptor;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import java.io.*;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import androidx.core.content.FileProvider;

/** Main-owner, user-mediated sources. No broad storage/camera permission. */
final class MediaPicker {
 private static final AtomicInteger nextCode=new AtomicInteger(0x5000);
 private final Activity activity;private final PermissionGate permissions;private final BooleanSupplier foreground,otherDialog;
 private Pending pending;private volatile int externalCode=-1;
 private static final class Pending {
  final VerifiedPackage value;final MediaContract.Options options;final VerifiedMedia.Completion completion;
  AlertDialog dialog;File capture;Uri captureUri,result;int code=-1;boolean done,resultReady;String error;
  Pending(VerifiedPackage value,MediaContract.Options options,VerifiedMedia.Completion completion){this.value=value;this.options=options;this.completion=completion;}
 }
 MediaPicker(Activity activity,PermissionGate permissions,BooleanSupplier foreground,BooleanSupplier otherDialog){this.activity=activity;this.permissions=permissions;this.foreground=foreground;this.otherDialog=otherDialog;}
 private static void owner(){if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("Media picker requires main owner");}
 boolean external(){return externalCode>=0;}
 boolean active(){owner();return pending!=null||external();}
 Runnable select(VerifiedPackage value,MediaContract.Options options,VerifiedMedia.Completion completion)throws Exception {
  owner();if(pending!=null||external()||otherDialog.getAsBoolean())throw new RejectedExecutionException("Native dialog already active");
  Pending bound=new Pending(value,options,completion);pending=bound;
  try{
   if(!foreground.getAsBoolean()){complete(bound,null,"BUSY");return ()->stop(bound);}
   PermissionGate.Status decision=permissions.check(value,"media",true);
   if(decision==PermissionGate.Status.DENIED)complete(bound,null,"DENIED");
   else if(decision==PermissionGate.Status.GRANTED)launch(bound);
   else{
    Boolean[] selected={null};bound.dialog=new AlertDialog.Builder(activity).setTitle("Image access").setMessage("Allow "+value.identity+" to select or capture an image?").setNegativeButton("Don’t allow",(dialog,which)->selected[0]=false).setPositiveButton("Allow",(dialog,which)->selected[0]=true).create();
    bound.dialog.setOnCancelListener(dialog->selected[0]=false);bound.dialog.setOnDismissListener(dialog->{bound.dialog=null;if(bound.done||pending!=bound||selected[0]==null)return;try{if(!foreground.getAsBoolean()){complete(bound,null,"BUSY");return;}PermissionGate.Status status=permissions.decide(value,"media",selected[0],true);if(status==PermissionGate.Status.GRANTED)launch(bound);else complete(bound,null,"DENIED");}catch(Exception failed){complete(bound,null,"FAILED");}});bound.dialog.show();
   }
  }catch(Exception failure){stop(bound);throw failure;}
  return ()->stop(bound);
 }
 private void launch(Pending bound)throws Exception {
  if(bound.done||pending!=bound)return;if(!foreground.getAsBoolean()){complete(bound,null,"BUSY");return;}
  if(permissions.check(bound.value,"media",true)!=PermissionGate.Status.GRANTED){complete(bound,null,"DENIED");return;}
  Intent intent;
  if(bound.options.source.equals("camera")){
   File directory=new File(activity.getCacheDir(),"pjm-media-camera");if(!directory.isDirectory()&&!directory.mkdirs())throw new IOException("Media capture directory unavailable");
   bound.capture=File.createTempFile("capture-",".jpg",directory);bound.captureUri=FileProvider.getUriForFile(activity,activity.getPackageName()+".pjm.media",bound.capture);
   intent=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,bound.captureUri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);intent.setClipData(ClipData.newRawUri("capture",bound.captureUri));
  }else intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
  if(intent.resolveActivity(activity.getPackageManager())==null){complete(bound,null,"UNSUPPORTED");return;}
  int code=nextCode.getAndIncrement();if(code>0x6fff){complete(bound,null,"BUSY");return;}bound.code=code;externalCode=code;
  try{activity.startActivityForResult(intent,code);}catch(Exception failed){externalCode=-1;complete(bound,null,failed instanceof ActivityNotFoundException?"UNSUPPORTED":"FAILED");}
 }
 boolean onActivityResult(int code,int result,Intent data){owner();if(code!=externalCode)return false;externalCode=-1;Pending bound=pending;if(bound==null||bound.done||bound.code!=code)return true;bound.resultReady=true;bound.result=bound.options.source.equals("camera")?bound.captureUri:data==null?null:data.getData();bound.error=result==Activity.RESULT_OK?null:"CANCELLED";resume();return true;}
 void resume(){owner();Pending bound=pending;if(bound==null||bound.done||!bound.resultReady||!foreground.getAsBoolean())return;
  if(bound.error!=null){complete(bound,null,bound.error);return;}
  if(bound.result==null||!"content".equals(bound.result.getScheme())){complete(bound,null,"FAILED");return;}
  try{if(permissions.check(bound.value,"media",true)!=PermissionGate.Status.GRANTED){complete(bound,null,"DENIED");return;}}catch(Exception failed){complete(bound,null,"FAILED");return;}
  Uri selected=bound.result;complete(bound,cancellation->{AssetFileDescriptor descriptor=activity.getContentResolver().openAssetFileDescriptor(selected,"r",cancellation);if(descriptor==null)throw new IOException("Media provider unavailable");try{if(descriptor.getLength()>MediaContract.SOURCE_BYTES)throw new IOException("Media source exceeds limit");return descriptor.createInputStream();}catch(Exception failed){descriptor.close();throw failed;}},null);
 }
 private void complete(Pending bound,VerifiedMedia.Source source,String error){if(bound.done||pending!=bound)return;bound.done=true;bound.completion.complete(source,error);}
 private void stop(Pending bound){owner();bound.done=true;if(bound.dialog!=null){bound.dialog.dismiss();bound.dialog=null;}if(bound.code>=0&&externalCode==bound.code)activity.finishActivity(bound.code);if(bound.captureUri!=null)activity.revokeUriPermission(bound.captureUri,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);if(bound.capture!=null)bound.capture.delete();if(pending==bound)pending=null;}
 void close(){owner();if(pending!=null)stop(pending);}
}
