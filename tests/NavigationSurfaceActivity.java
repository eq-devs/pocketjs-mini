package dev.pjm.android;

/** Test-only storage observation; rendering, input and Back use InstalledActivity. */
public final class NavigationSurfaceActivity extends InstalledActivity {
  private final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
  private AppStorage proofStorage;
  private String last;
  private final Runnable observation=new Runnable(){public void run(){
    try{
      Object value=proofStorage.dispatch("storage.get.v1",new org.json.JSONObject().put("key","navigation-proof"));
      Object networkValue=proofStorage.dispatch("storage.get.v1",new org.json.JSONObject().put("key","network-proof"));
      if(value instanceof org.json.JSONObject && networkValue instanceof org.json.JSONObject){org.json.JSONObject proof=(org.json.JSONObject)value,network=(org.json.JSONObject)networkValue;
        String description="navigation path="+proof.getString("path")+" count="+proof.getInt("count")+" item="+proof.optString("item","null")+" network="+network.getJSONObject("state").getString("type")+" events="+network.getInt("events");
        Object mediaValue=proofStorage.dispatch("storage.get.v1",new org.json.JSONObject().put("key","media-proof"));if(mediaValue instanceof org.json.JSONObject)description+=" media="+((org.json.JSONObject)mediaValue).getString("code");
        if(!description.equals(last)){last=description;getWindow().getDecorView().setContentDescription(description);}
      }
    }catch(Exception waiting){/* Boot and atomic storage contention are temporary. */}
    handler.postDelayed(this,250);
  }};
  @Override public void onCreate(android.os.Bundle state){super.onCreate(state);try{proofStorage=new AppStorage(getFilesDir(),"dev.pjm.navigation");handler.post(observation);}catch(Exception failure){throw new IllegalStateException(failure);}}
  @Override public void onDestroy(){handler.removeCallbacks(observation);super.onDestroy();}
}
