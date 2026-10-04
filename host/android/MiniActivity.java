package dev.pjm.android;

import android.app.Activity;
import android.os.Bundle;
import android.opengl.GLSurfaceView;
import android.graphics.Color;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.util.concurrent.*;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/** Small development container: the platform owns the surface; PocketJS owns pixels. */
public class MiniActivity extends Activity {
  private AppStorage appStorage;
  private volatile long nativeHost;
  private native long createHost();
  private long testActions,testValue;
  private int preferredDensity;
  private volatile int insetTop,insetBottom,insetLeft,insetRight;
  static { System.loadLibrary("pocketjs"); }
  private native String boot(byte[] js,byte[] pak,int width,int height,int density,boolean testing);
  private native boolean contextCreated();
  private native String lifecycle(boolean active);
  private native String memoryWarning();
  private native String prepareUnload();
  private volatile boolean pendingMemoryWarning;
  private synchronized native String shutdown();
  private synchronized native void size(int width,int height);
  private synchronized native void touch(int action,int id,float x,float y);
  private native String frame();
  private native long[] receipt();
  private native byte[] serviceRequests();
  private native boolean serviceReply(byte[] reply);
  private GLSurfaceView surface;
  private TextView message;
  private ScheduledExecutorService network;
  private String base;
  private volatile int width,height,density,top,bottom,left,right,revision,failedRevision;
  private volatile boolean loading,paused=true,closed;
  private volatile String metrics="";
  private int pixelWidth,pixelHeight;
  private boolean testMode;
  private long nextFrameNanos;
  private final Choreographer.FrameCallback frameCallback=new Choreographer.FrameCallback() {
    public void doFrame(long time) {
      if(paused || closed) return;
      if(time>=nextFrameNanos) {
        surface.requestRender();
        nextFrameNanos=Math.max(nextFrameNanos+16666667L,time+1);
      }
      Choreographer.getInstance().postFrameCallback(this);
    }
  };

  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    nativeHost=createHost();if(nativeHost==0)throw new OutOfMemoryError("Native host allocation failed");
    base=getIntent().getStringExtra("pjm-url");
    testMode=getIntent().getBooleanExtra("pjm-test",false);
    if(base==null || !base.matches("http://127\\.0\\.0\\.1:[0-9]+/[a-f0-9]+/")) throw new IllegalArgumentException("Missing development session URL");
    preferredDensity=Math.max(1,Math.min(4,Math.round(getResources().getDisplayMetrics().density)));density=preferredDensity;
    FrameLayout root=new FrameLayout(this); root.setBackgroundColor(0xff0f172a);
    surface=new GLSurfaceView(this); surface.setEGLContextClientVersion(2);
    surface.setPreserveEGLContextOnPause(true);
    surface.setRenderer(new GLSurfaceView.Renderer() {
      public void onSurfaceCreated(GL10 gl,EGLConfig config) {if(!contextCreated()){revision=0;failedRevision=0;}}
      public void onSurfaceChanged(GL10 gl,int w,int h) {
        boolean changed=w!=pixelWidth || h!=pixelHeight;
        size(w,h); pixelWidth=w;pixelHeight=h;
        density=Math.max(preferredDensity,Math.min(4,(Math.max(w,h)+1023)/1024));
        width=w/density;height=h/density;
        top=insetTop/density;bottom=insetBottom/density;left=insetLeft/density;right=insetRight/density;
        if(changed){metrics="";revision=0;failedRevision=0;}
      }
      public void onDrawFrame(GL10 gl) {
        if(paused || loading) return;
        String error=frame();
        if(!error.isEmpty()) {failedRevision=revision;show(error);}
        dispatchServices();
        if(revision>0) {
          long[] data=receipt();data[4]=testActions;data[5]=testValue;
          if(data[0]%30==0) {
            final int nativeRevision=revision;
            runOnUiThread(()->{
              surface.setContentDescription("revision="+nativeRevision+" frames="+data[0]+" touches="+data[1]+" width="+data[2]+" height="+data[3]);
              if(testMode) try {
                JSONObject record=new JSONObject();record.put("session",base);record.put("revision",nativeRevision);record.put("frames",data[0]);record.put("touches",data[1]);
                record.put("width",data[2]);record.put("height",data[3]);record.put("density",density);record.put("top",top);record.put("left",left);
                record.put("actions",data[4]);record.put("value",data[5]);
                record.put("hash",data[6]);testRecord("receipt.json",record.toString());
              } catch(Exception receiptError) {show("Test receipt failed: "+receiptError.getMessage());}
            });
          }
        }
      }
    });
    surface.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
    surface.setOnTouchListener((v,event)->{
      int action=event.getActionMasked(),index=event.getActionIndex();
      if(action==MotionEvent.ACTION_CANCEL) touch(3,0,0,0);
      else if(action==MotionEvent.ACTION_DOWN || action==MotionEvent.ACTION_POINTER_DOWN) touch(0,event.getPointerId(index),event.getX(index),event.getY(index));
      else if(action==MotionEvent.ACTION_UP || action==MotionEvent.ACTION_POINTER_UP) touch(1,event.getPointerId(index),event.getX(index),event.getY(index));
      else if(action==MotionEvent.ACTION_MOVE) {
        for(int history=0;history<event.getHistorySize();history++)
          for(int i=0;i<event.getPointerCount();i++) touch(2,event.getPointerId(i),event.getHistoricalX(i,history),event.getHistoricalY(i,history));
        for(int i=0;i<event.getPointerCount();i++) touch(2,event.getPointerId(i),event.getX(i),event.getY(i));
      }
      return true;
    });
    root.addView(surface,new FrameLayout.LayoutParams(-1,-1));
    message=new TextView(this);message.setTextColor(Color.WHITE);message.setTextSize(14);message.setBackgroundColor(0xee0f172a);message.setGravity(Gravity.CENTER);message.setPadding(24,24,24,24);message.setText("Starting PocketJS…");
    root.addView(message,new FrameLayout.LayoutParams(-1,-1));
    root.setOnApplyWindowInsetsListener((view,insets)->{
      int t=insets.getSystemWindowInsetTop(),b=insets.getSystemWindowInsetBottom(),l=insets.getSystemWindowInsetLeft(),r=insets.getSystemWindowInsetRight();
      insetTop=t;insetBottom=b;insetLeft=l;insetRight=r;
      top=t/density;bottom=b/density;left=l/density;right=r/density;
      view.setPadding(l,t,r,b);return insets.consumeSystemWindowInsets();
    });
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    setContentView(root);
    network=Executors.newSingleThreadScheduledExecutor();
    network.scheduleWithFixedDelay(()->poll(),0,300,TimeUnit.MILLISECONDS);
  }
  private void testRecord(String name,String value) {
    if(!testMode) return;
    android.util.AtomicFile file=new android.util.AtomicFile(new File(getFilesDir(),"pjm-"+name));
    FileOutputStream out=null;
    try {out=file.startWrite();out.write(value.getBytes("UTF-8"));file.finishWrite(out);}
    catch(Exception error){if(out!=null)file.failWrite(out);android.util.Log.e("PocketJS","Cannot write test receipt",error);}
  }
  /* Runs on the GL owner thread. Replies enter the next guest frame, never
     synchronously reenter guest code. These read-only calls require no OS prompt. */
  private void dispatchServices() {
    try {
      String batch=new String(serviceRequests(),"UTF-8");
      for(String line:batch.split("\n")) {
        if(line.isEmpty())continue;
        JSONObject request;
        try {request=new JSONObject(line);}catch(Exception malformed){continue;}
        Object identifier=request.opt("id");
        if(!(identifier instanceof Number))continue;
        double number=((Number)identifier).doubleValue();
        if(number<1 || number>9007199254740991d || number!=Math.floor(number))continue;
        JSONObject reply=new JSONObject();reply.put("v",1);reply.put("id",(long)number);
        String kind=request.optString("kind","");
        Object version=request.opt("v"),kindValue=request.opt("kind");
        if(!(version instanceof Number) || ((Number)version).doubleValue()!=1 || !(kindValue instanceof String)
          || kind.length()>64 || !kind.matches("[a-z][a-zA-Z0-9.]*\\.v[1-9][0-9]*") || !request.has("args")) {
          reply.put("ok",false);reply.put("error",new JSONObject().put("code","PROTOCOL").put("message","Invalid service request"));
        } else if(kind.equals("device.info.v1")) {
          JSONObject data=new JSONObject();data.put("platform","android");data.put("model",android.os.Build.MODEL);
          data.put("width",width);data.put("height",height);data.put("density",density);
          data.put("safeTop",top);data.put("safeBottom",bottom);data.put("safeLeft",left);data.put("safeRight",right);
          reply.put("ok",true);reply.put("data",data);
        } else if(kind.equals("storage.get.v1") || kind.equals("storage.set.v1") || kind.equals("storage.remove.v1")) {
          try {
            if(appStorage==null)throw new IOException("Host app identity is unavailable");
            reply.put("data",appStorage.dispatch(kind,request.opt("args")));reply.put("ok",true);
          }catch(Exception error){reply.put("ok",false);reply.put("error",new JSONObject().put("code",error instanceof AppStorage.Busy?"BUSY":error instanceof IllegalArgumentException?"PROTOCOL":"FAILED").put("message",error.getMessage()==null?"Storage failed":error.getMessage()));}
        } else if(kind.equals("cancel.v1")) {reply.put("ok",true);reply.put("data",JSONObject.NULL);}
        else if(testMode && kind.equals("test.report.v1") && request.optJSONObject("args")!=null && request.getJSONObject("args").opt("value") instanceof Number){testActions++;testValue=request.getJSONObject("args").getLong("value");reply.put("ok",true);reply.put("data",JSONObject.NULL);}
        else {reply.put("ok",false);reply.put("error",new JSONObject().put("code","UNSUPPORTED").put("message","Unsupported native service: "+kind.substring(0,Math.min(kind.length(),64))));}
        if(!serviceReply(reply.toString().getBytes("UTF-8"))) {show("Native completion queue is full");break;}
      }
    }catch(Exception error){show("Native service failed: "+error.getMessage());}
  }
  private void show(String value) {runOnUiThread(()->{if(!closed){message.setText(value);message.setVisibility(View.VISIBLE);testRecord("status.txt",value);}});}
  private byte[] request(String path,String body) throws Exception {
    HttpURLConnection connection=(HttpURLConnection)new URL(base+path).openConnection();
    connection.setConnectTimeout(3000);connection.setReadTimeout(5000);
    try {
      if(body!=null) {
        connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
        try(OutputStream out=connection.getOutputStream()){out.write(body.getBytes("UTF-8"));}
      }
      if(connection.getResponseCode()!=200) throw new IOException("Development host rejected request: "+connection.getResponseCode());
      ByteArrayOutputStream out=new ByteArrayOutputStream();
      try(InputStream in=connection.getInputStream()){byte[] buffer=new byte[8192];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);}
      return out.toByteArray();
    } finally {connection.disconnect();}
  }
  private void poll() {
    if(paused || closed || loading || width<100 || height<100) return;
    int w=width,h=height,d=density;
    try {
      JSONObject window=new JSONObject();window.put("width",w);window.put("height",h);window.put("density",d);
      window.put("safeTop",top);window.put("safeBottom",bottom);window.put("safeLeft",left);window.put("safeRight",right);
      String snapshot=window.toString();
      if(!metrics.equals(snapshot)){request("window",snapshot);metrics=snapshot;show("Adapting to window…");}
      JSONObject state=new JSONObject(new String(request("state",null),"UTF-8"));
      if(!state.isNull("error")){show(state.getString("error"));return;}
      int next=state.getInt("revision");JSONObject committed=state.getJSONObject("window");
      if(next<=revision || next==failedRevision || committed.getInt("width")!=w || committed.getInt("height")!=h || committed.getInt("density")!=d) return;
      final AppStorage storage=new AppStorage(getFilesDir(),state.getJSONObject("metadata").getString("appId"));
      byte[] js=request(next+"/app.js",null),pak=request(next+"/app.pak",null);
      loading=true;
      surface.queueEvent(()->{
        try {
          if(width!=w || height!=h || closed || paused) return;
          String unloadError=prepareUnload();
          if(unloadError.isEmpty())dispatchServices();else android.util.Log.e("PocketJS",unloadError);
          appStorage=null;
          testActions=0;testValue=0;String error=boot(js,pak,w,h,d,testMode);
          if(!error.isEmpty()){failedRevision=next;show(error);return;}
          appStorage=storage;revision=next;failedRevision=0;
          runOnUiThread(()->{message.setVisibility(View.GONE);testRecord("status.txt","");});
        } finally {loading=false;}
      });
    } catch(Exception error){show("Cannot reach development host. Keep pjm run active.\n"+error.getMessage());metrics="";}
  }
  @Override public void onResume(){
    super.onResume();nextFrameNanos=0;
    if(surface!=null){
      surface.onResume();
      surface.queueEvent(()->{
        if(closed)return;
        String error=lifecycle(true);if(!error.isEmpty())show(error);
        if(pendingMemoryWarning){pendingMemoryWarning=false;error=memoryWarning();if(!error.isEmpty())show(error);}
        paused=false;
        runOnUiThread(()->{if(!paused && !closed)Choreographer.getInstance().postFrameCallback(frameCallback);});
      });
    }
  }
  @Override public void onPause(){
    paused=true;Choreographer.getInstance().removeFrameCallback(frameCallback);touch(3,0,0,0);
    final boolean ending=isFinishing() || isChangingConfigurations();
    if(ending){closed=true;if(network!=null)network.shutdownNow();}
    if(surface!=null){
      surface.queueEvent(()->{
        if(ending){String unloadError=prepareUnload();if(unloadError.isEmpty())dispatchServices();else android.util.Log.e("PocketJS",unloadError);}
        String error=ending?shutdown():lifecycle(false);
        if(ending){appStorage=null;revision=0;failedRevision=0;}
        if(!error.isEmpty())android.util.Log.e("PocketJS",error);
      });
      surface.onPause();
    }
    super.onPause();
  }
  @Override public void onDestroy(){closed=true;if(network!=null)network.shutdownNow();super.onDestroy();}
  @Override public void onTrimMemory(int level){
    super.onTrimMemory(level);
    if(level==TRIM_MEMORY_UI_HIDDEN || level<TRIM_MEMORY_RUNNING_LOW || closed)return;
    pendingMemoryWarning=true;
    if(surface!=null && !paused)surface.queueEvent(()->{
      if(closed || paused || !pendingMemoryWarning)return;
      pendingMemoryWarning=false;
      String error=memoryWarning();if(!error.isEmpty())show(error);
    });
  }
}
