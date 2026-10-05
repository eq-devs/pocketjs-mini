package dev.pjm.android;
import android.content.Context;
import android.os.*;
import com.google.android.gms.location.*;
import com.google.android.gms.tasks.CancellationTokenSource;

/** Main-owner, one-shot provider. VerifiedLocation gates app and OS authorization. */
final class FusedLocationProvider {
  private final FusedLocationProviderClient client;
  private final Handler handler=new Handler(Looper.getMainLooper());
  FusedLocationProvider(Context context){client=LocationServices.getFusedLocationProviderClient(context.getApplicationContext());}
  Runnable start(LocationContract.Options options,VerifiedLocation.Completion completion){
    if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("Location UI owner required");
    CancellationTokenSource cancellation=new CancellationTokenSource();boolean[] stopped={false};long started=SystemClock.elapsedRealtimeNanos();
    CurrentLocationRequest request=new CurrentLocationRequest.Builder().setDurationMillis(options.timeoutMs).setMaxUpdateAgeMillis(options.maximumAgeMs).setPriority(options.highAccuracy?Priority.PRIORITY_HIGH_ACCURACY:Priority.PRIORITY_BALANCED_POWER_ACCURACY).setGranularity(options.highAccuracy?Granularity.GRANULARITY_FINE:Granularity.GRANULARITY_PERMISSION_LEVEL).build();
    java.util.concurrent.Executor executor=action->{if(!handler.post(action))throw new IllegalStateException("Location UI queue closed");};
    LocationMailbox.Error startupError=null;
    try{client.getCurrentLocation(request,cancellation.getToken()).addOnSuccessListener(executor,location->{
      if(stopped[0])return;stopped[0]=true;
      if(location==null){completion.finish(null,LocationMailbox.Error.TIMEOUT);return;}
      LocationContract.Position position;
      try{
        long now=SystemClock.elapsedRealtimeNanos(),fix=location.getElapsedRealtimeNanos();
        boolean fresh=options.maximumAgeMs==0?fix>=started&&fix<=now:LocationContract.cachedFixAllowed(options,fix,now);
        if(!fresh||!location.hasAccuracy())throw new IllegalArgumentException("Invalid or stale location fix");
        position=LocationContract.position(location.getLatitude(),location.getLongitude(),location.getAccuracy(),location.getTime());
      }catch(RuntimeException failure){completion.finish(null,LocationMailbox.Error.FAILED);return;}
      completion.finish(position,null);
    }).addOnFailureListener(executor,failure->{if(stopped[0])return;stopped[0]=true;completion.finish(null,failure instanceof SecurityException?LocationMailbox.Error.DENIED:LocationMailbox.Error.FAILED);});
    }catch(RuntimeException failure){
      if(!stopped[0]){stopped[0]=true;startupError=failure instanceof SecurityException?LocationMailbox.Error.DENIED:LocationMailbox.Error.FAILED;}
      cancellation.cancel();
    }
    if(startupError!=null)completion.finish(null,startupError);
    return ()->{if(Looper.myLooper()!=Looper.getMainLooper())throw new IllegalStateException("Location UI owner required");stopped[0]=true;cancellation.cancel();};
  }
}
