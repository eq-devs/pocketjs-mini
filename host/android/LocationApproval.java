package dev.pjm.android;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Looper;
import java.util.Objects;

/** Main-owner native consent adapter. Activity must forward its OS permission result. */
final class LocationApproval {
  // Process-wide, never reused: late callbacks cannot complete a replacement request.
  private static final java.util.concurrent.atomic.AtomicInteger nextCode=new java.util.concurrent.atomic.AtomicInteger(0x7000);
  private final Activity activity;
  private final PermissionGate permissions;
  private final java.util.function.BooleanSupplier foreground;
  private Pending pending;
  // An OS dialog cannot be cancelled by the app. Keep this fence after task cleanup.
  private boolean osInFlight;
  private int osRequestCode=-1;
  private static final class Pending {
    final VerifiedPackage value;final LocationContract.Options options;
    final VerifiedLocation.Decision decision;
    AlertDialog dialog;boolean done,osResultReady;
    Pending(VerifiedPackage value,LocationContract.Options options,VerifiedLocation.Decision decision){this.value=value;this.options=options;this.decision=decision;}
  }
  LocationApproval(Activity activity,PermissionGate permissions,java.util.function.BooleanSupplier foreground){this.activity=Objects.requireNonNull(activity);this.permissions=Objects.requireNonNull(permissions);this.foreground=Objects.requireNonNull(foreground);}
  boolean awaitingOS(){owner();return osInFlight&&pending!=null;}
  boolean active(){owner();return pending!=null||osInFlight;}
  void resume(){owner();Pending request=pending;if(request!=null&&request.osResultReady&&foreground.getAsBoolean())finish(request,true);}
  private void owner(){if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("Location approval UI owner required");}
  private boolean osGranted(LocationContract.Options options){
    boolean fine=activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
    return fine||(!options.highAccuracy&&activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED);
  }
  boolean authorized(VerifiedPackage value,LocationContract.Options options)throws Exception{
    owner();return permissions.check(value,"location",osGranted(options))==PermissionGate.Status.GRANTED;
  }
  Runnable request(VerifiedPackage value,LocationContract.Options options,VerifiedLocation.Decision decision)throws Exception{
    owner();Objects.requireNonNull(decision);
    if(pending!=null||osInFlight)throw new java.util.concurrent.RejectedExecutionException("Location approval already active");
    PermissionGate.Status consent=permissions.check(value,"location",true);
    if(consent==PermissionGate.Status.DENIED){decision.finish(false,()->{});return ()->{};}
    Pending request=new Pending(value,options,decision);pending=request;
    try{
      if(consent==PermissionGate.Status.GRANTED)requestOS(request);
      else{
        request.dialog=new AlertDialog.Builder(activity).setTitle("Location access")
          .setMessage("Allow "+value.identity+" to access your location?")
          .setNegativeButton("Don’t allow",(dialog,which)->finish(request,false))
          .setPositiveButton("Allow",(dialog,which)->{try{requestOS(request);}catch(RuntimeException failure){fail(request);}})
          .create();
        request.dialog.setOnCancelListener(dialog->finish(request,false));
        request.dialog.show();
      }
    }catch(RuntimeException failure){cancel(request);throw failure;}
    return ()->{owner();cancel(request);};
  }
  private void requestOS(Pending request){
    if(pending!=request||request.done)return;
    if(osGranted(request.options)){finish(request,true);return;}
    int code=nextCode.getAndUpdate(current->current<=0xffff?current+1:current);
    if(code>0xffff)throw new IllegalStateException("Location permission request identifiers exhausted");
    osRequestCode=code;osInFlight=true;
    try{
      // Android 12+ requires both permissions in the same fine-location request.
      activity.requestPermissions(request.options.highAccuracy?new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}:new String[]{Manifest.permission.ACCESS_COARSE_LOCATION},code);
    }catch(RuntimeException failure){osInFlight=false;osRequestCode=-1;throw failure;}
  }
  /** Recheck current grants rather than trusting callback arrays. Stale results only clear the OS fence. */
  boolean onRequestPermissionsResult(int code){
    owner();if(code!=osRequestCode)return false;
    if(!osInFlight)return true;
    osInFlight=false;osRequestCode=-1;Pending request=pending;
    // Preserve the app's positive consent even if Android denied its separate grant.
    if(request!=null){request.osResultReady=true;resume();}
    return true;
  }
  private void finish(Pending request,boolean approved){
    if(pending!=request||request.done)return;
    cancel(request);
    request.decision.finish(approved,()->{
      try{permissions.decide(request.value,"location",approved,osGranted(request.options));}
      catch(Exception failure){throw new IllegalStateException("Location consent persistence failed",failure);}
    });
  }
  private void fail(Pending request){
    if(pending!=request||request.done)return;
    cancel(request);request.decision.fail();
  }
  private void cancel(Pending request){
    if(request.done)return;request.done=true;if(pending==request)pending=null;
    if(request.dialog!=null){AlertDialog dialog=request.dialog;request.dialog=null;dialog.setOnCancelListener(null);try{dialog.dismiss();}catch(RuntimeException ignored){/* Ownership already retired; continue cleanup/delivery. */}}
  }
}
