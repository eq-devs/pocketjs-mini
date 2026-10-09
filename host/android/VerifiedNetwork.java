package dev.pjm.android;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import org.json.JSONObject;

/** One native default-path callback and one replaceable snapshot per host. */
public final class VerifiedNetwork {
  private final ConnectivityManager manager;
  private ConnectivityManager.NetworkCallback callback;
  private String state=unknown();
  private static String unknown(){return "{\"connected\":null,\"type\":\"unknown\",\"expensive\":null}";}
  public VerifiedNetwork(Context context){manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);}
  private static String snapshot(NetworkCapabilities caps){
    try{boolean connected=caps!=null;
      String type=!connected?"none":caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"wifi":caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)?"cellular":caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)?"ethernet":"other";
      return new JSONObject().put("connected",connected).put("type",type).put("expensive",connected?!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED):JSONObject.NULL).toString();
    }catch(org.json.JSONException impossible){throw new IllegalStateException(impossible);}
  }
  public synchronized String state(){return state;}
  public synchronized void resume(){
    if(callback!=null)return;state=unknown();if(manager==null)return;
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
  public synchronized void suspend(){ConnectivityManager.NetworkCallback bound=callback;callback=null;if(bound!=null)try{manager.unregisterNetworkCallback(bound);}catch(RuntimeException ignored){/* Already unregistered or unavailable. */}}
}
