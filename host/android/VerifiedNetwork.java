package dev.pjm.android;

import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import org.json.JSONObject;

/** One native default-path observer and one replaceable snapshot per host. */
public final class VerifiedNetwork {
  private final ConnectivityManager manager;
  private final Context context;
  private BroadcastReceiver receiver;
  private ConnectivityManager.NetworkCallback callback;
  private String state=unknown();
  private static String unknown(){return "{\"connected\":null,\"type\":\"unknown\",\"expensive\":null}";}
  public VerifiedNetwork(Context context){Context app=context.getApplicationContext();this.context=app==null?context:app;manager=(ConnectivityManager)this.context.getSystemService(Context.CONNECTIVITY_SERVICE);}
  private static String snapshot(NetworkCapabilities caps){
    try{boolean connected=caps!=null;
      String type=!connected?"none":caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"wifi":caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)?"cellular":caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)?"ethernet":"other";
      return new JSONObject().put("connected",connected).put("type",type).put("expensive",connected?!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED):JSONObject.NULL).toString();
    }catch(org.json.JSONException impossible){throw new IllegalStateException(impossible);}
  }
  public synchronized String state(){return state;}
  public synchronized void resume(){
    if(callback!=null||receiver!=null)return;state=unknown();if(manager==null)return;
    if(android.os.Build.VERSION.SDK_INT<24){
      BroadcastReceiver bound=new BroadcastReceiver(){@Override public void onReceive(Context ignored,Intent intent){synchronized(VerifiedNetwork.this){if(receiver==this)refreshActive();}}};
      receiver=bound;
      try{context.registerReceiver(bound,new IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION));refreshActive();}
      catch(RuntimeException unavailable){receiver=null;try{context.unregisterReceiver(bound);}catch(RuntimeException ignored){}state=unknown();}
      return;
    }
    ConnectivityManager.NetworkCallback bound=new ConnectivityManager.NetworkCallback(){
      private Network current;
      @Override public void onAvailable(Network network){synchronized(VerifiedNetwork.this){if(callback!=this)return;current=network;}}
      @Override public void onCapabilitiesChanged(Network network,NetworkCapabilities capabilities){synchronized(VerifiedNetwork.this){if(callback!=this||!network.equals(current))return;state=snapshot(capabilities);}}
      @Override public void onLost(Network network){synchronized(VerifiedNetwork.this){if(callback!=this||!network.equals(current))return;current=null;state=snapshot(null);}}
    };
    callback=bound;
    try{manager.registerDefaultNetworkCallback(bound);Network active=manager.getActiveNetwork();if(active==null)state=snapshot(null);}
    catch(RuntimeException unavailable){callback=null;state=unknown();}
  }
  private void refreshActive(){try{Network active=manager.getActiveNetwork();state=snapshot(active==null?null:manager.getNetworkCapabilities(active));}catch(RuntimeException unavailable){state=unknown();}}
  public synchronized void suspend(){BroadcastReceiver legacy=receiver;receiver=null;if(legacy!=null)try{context.unregisterReceiver(legacy);}catch(RuntimeException ignored){}ConnectivityManager.NetworkCallback bound=callback;callback=null;if(bound!=null)try{manager.unregisterNetworkCallback(bound);}catch(RuntimeException ignored){/* Already unregistered or unavailable. */}}
}
