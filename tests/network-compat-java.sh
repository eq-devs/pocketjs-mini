#!/bin/bash
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
JAVA=${JAVA_HOME:-/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home}
TEMP=$(mktemp -d /private/tmp/pjm-network-compat.XXXXXX)
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/src/android/content" "$TEMP/src/android/net" "$TEMP/src/android/os" "$TEMP/src/org/json"
cat > "$TEMP/src/android/content/Context.java" <<'JAVA'
package android.content;
public abstract class Context {
 public static final String CONNECTIVITY_SERVICE="connectivity";
 public Context getApplicationContext(){return this;}
 public abstract Object getSystemService(String name);
 public abstract Intent registerReceiver(BroadcastReceiver receiver,IntentFilter filter);
 public abstract void unregisterReceiver(BroadcastReceiver receiver);
}
JAVA
cat > "$TEMP/src/android/content/BroadcastReceiver.java" <<'JAVA'
package android.content; public abstract class BroadcastReceiver {public abstract void onReceive(Context context,Intent intent);}
JAVA
cat > "$TEMP/src/android/content/Intent.java" <<'JAVA'
package android.content; public class Intent {}
JAVA
cat > "$TEMP/src/android/content/IntentFilter.java" <<'JAVA'
package android.content; public class IntentFilter {public final String action;public IntentFilter(String value){action=value;}}
JAVA
cat > "$TEMP/src/android/os/Build.java" <<'JAVA'
package android.os; public final class Build {public static final class VERSION {public static int SDK_INT=23;}}
JAVA
cat > "$TEMP/src/android/net/Network.java" <<'JAVA'
package android.net;public final class Network {public final int id;public Network(int value){id=value;}public boolean equals(Object other){return other instanceof Network&&((Network)other).id==id;}public int hashCode(){return id;}}
JAVA
cat > "$TEMP/src/android/net/NetworkCapabilities.java" <<'JAVA'
package android.net;public final class NetworkCapabilities {public static final int TRANSPORT_WIFI=1,TRANSPORT_CELLULAR=2,TRANSPORT_ETHERNET=3,NET_CAPABILITY_NOT_METERED=4;public final int transport;public final boolean unmetered;public NetworkCapabilities(int value,boolean unlimited){transport=value;unmetered=unlimited;}public boolean hasTransport(int value){return transport==value;}public boolean hasCapability(int value){return value==NET_CAPABILITY_NOT_METERED&&unmetered;}}
JAVA
cat > "$TEMP/src/android/net/ConnectivityManager.java" <<'JAVA'
package android.net;
public class ConnectivityManager {
 public static final String CONNECTIVITY_ACTION="android.net.conn.CONNECTIVITY_CHANGE";
 public Network active;public NetworkCapabilities capabilities;public NetworkCallback callback;public int registrations,removals;public boolean failRegister,failRead;
 public Network getActiveNetwork(){if(failRead)throw new SecurityException();return active;}
 public NetworkCapabilities getNetworkCapabilities(Network network){return capabilities;}
 public void registerDefaultNetworkCallback(NetworkCallback value){if(android.os.Build.VERSION.SDK_INT<24)throw new AssertionError("API 24 method used on API 23");if(failRegister)throw new SecurityException();callback=value;registrations++;}
 public void unregisterNetworkCallback(NetworkCallback value){if(callback!=value)throw new IllegalArgumentException();callback=null;removals++;}
 public static class NetworkCallback {public void onAvailable(Network network){}public void onCapabilitiesChanged(Network network,NetworkCapabilities capabilities){}public void onLost(Network network){}}
}
JAVA
cat > "$TEMP/src/org/json/JSONException.java" <<'JAVA'
package org.json;public class JSONException extends Exception {}
JAVA
cat > "$TEMP/src/org/json/JSONObject.java" <<'JAVA'
package org.json;import java.util.*;public final class JSONObject {public static final Object NULL=new Object();private final Map<String,Object> values=new LinkedHashMap<>();public JSONObject put(String key,Object value)throws JSONException{values.put(key,value);return this;}public String toString(){StringJoiner out=new StringJoiner(",","{","}");for(Map.Entry<String,Object> item:values.entrySet()){Object v=item.getValue();out.add("\""+item.getKey()+"\":"+(v==NULL?"null":v instanceof String?"\""+v+"\"":v.toString()));}return out.toString();}}
JAVA
"$JAVA/bin/javac" --release 8 -d "$TEMP/classes" $(find "$TEMP/src" -name '*.java') "$ROOT/host/android/VerifiedNetwork.java" "$ROOT/tests/NetworkCompatTest.java"
"$JAVA/bin/java" -cp "$TEMP/classes" dev.pjm.android.NetworkCompatTest
