package dev.pjm.android;
import android.content.*;
import android.net.*;

/** Controlled platform callbacks exercise API-23 behavior and lifecycle fencing; no device claim. */
public final class NetworkCompatTest {
 static int checks;static void require(boolean value){checks++;if(!value)throw new AssertionError("Network compatibility assertion "+checks);}
 static final class ContextStub extends Context {
  final ConnectivityManager manager=new ConnectivityManager();BroadcastReceiver receiver;int registrations,removals;boolean failRegister;
  public Object getSystemService(String name){return manager;}
  public Intent registerReceiver(BroadcastReceiver value,IntentFilter filter){require(filter.action.equals(ConnectivityManager.CONNECTIVITY_ACTION));if(failRegister)throw new SecurityException();receiver=value;registrations++;return null;}
  public void unregisterReceiver(BroadcastReceiver value){if(receiver!=value)throw new IllegalArgumentException();receiver=null;removals++;}
  void change(int type,boolean unlimited){manager.active=new Network(type);manager.capabilities=new NetworkCapabilities(type,unlimited);}
 }
 public static void main(String[] args){
  android.os.Build.VERSION.SDK_INT=23;ContextStub context=new ContextStub();VerifiedNetwork service=new VerifiedNetwork(context);
  service.resume();require(service.state().contains("\"connected\":false"));require(context.registrations==1&&context.manager.registrations==0);
  BroadcastReceiver retired=context.receiver;context.change(NetworkCapabilities.TRANSPORT_WIFI,true);retired.onReceive(context,new Intent());require(service.state().contains("\"type\":\"wifi\"")&&service.state().contains("\"expensive\":false"));
  service.resume();require(context.registrations==1);service.suspend();service.suspend();require(context.removals==1);
  String stopped=service.state();context.change(NetworkCapabilities.TRANSPORT_CELLULAR,false);retired.onReceive(context,new Intent());require(service.state().equals(stopped));
  service.resume();require(service.state().contains("\"type\":\"cellular\"")&&service.state().contains("\"expensive\":true"));
  context.manager.active=null;retired.onReceive(context,new Intent());require(service.state().contains("\"type\":\"cellular\""));context.receiver.onReceive(context,new Intent());require(service.state().contains("\"type\":\"none\""));
  context.manager.failRead=true;context.receiver.onReceive(context,new Intent());require(service.state().contains("\"type\":\"unknown\""));context.manager.failRead=false;service.suspend();
  context.failRegister=true;service.resume();require(service.state().contains("\"type\":\"unknown\""));context.failRegister=false;service.resume();require(context.receiver!=null);service.suspend();
  android.os.Build.VERSION.SDK_INT=24;context=new ContextStub();service=new VerifiedNetwork(context);service.resume();require(context.registrations==0&&context.manager.registrations==1);
  ConnectivityManager.NetworkCallback callback=context.manager.callback;Network wifi=new Network(1);callback.onAvailable(wifi);callback.onCapabilitiesChanged(wifi,new NetworkCapabilities(1,true));require(service.state().contains("\"type\":\"wifi\""));callback.onCapabilitiesChanged(new Network(2),new NetworkCapabilities(2,false));require(service.state().contains("\"type\":\"wifi\""));
  callback.onLost(wifi);require(service.state().contains("\"type\":\"none\""));service.suspend();callback.onAvailable(wifi);callback.onCapabilitiesChanged(wifi,new NetworkCapabilities(1,true));require(service.state().contains("\"type\":\"none\""));require(context.manager.removals==1);
  context.manager.failRegister=true;service.resume();require(service.state().contains("\"type\":\"unknown\""));context.manager.failRegister=false;service.resume();require(context.manager.callback!=null);service.suspend();
  System.out.println("Network API-23/API-24 JVM lifecycle checks passed: "+checks+"; no Android device execution.");
 }
}
