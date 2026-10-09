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
  private native int systemBack();
  private native String prepareUnload();
  private volatile boolean pendingMemoryWarning;
  private synchronized native String shutdown();
  private synchronized native void size(int width,int height);
  private synchronized native void touch(int action,int id,float x,float y);
  private native String frame();
  private native long[] receipt();
  private native byte[] serviceRequests();
  private native boolean serviceReply(byte[] reply);
  private native void setRecording(boolean enabled);
  private native byte[] debugTree();
  private boolean inspectionMode;
  private volatile boolean inspectionPending;
  // Snapshot and overlay belong to the UI owner; native capture remains on GL.
  private JSONObject inspectionTree;
  private long inspectionFrame;
  private int inspectionRevision;
  private InspectionOverlay inspectionOverlay;
  private final class InspectionOverlay extends View {
    private final android.graphics.Paint paint=new android.graphics.Paint();
    private android.graphics.RectF logical;
    private int selectedNode;
    InspectionOverlay(){super(MiniActivity.this);setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);setWillNotDraw(false);}
    void clear(){logical=null;selectedNode=0;invalidate();}
    int highlightedNode(){return logical!=null && !paused && !closed && revision==inspectionRevision?selectedNode:0;}
    @Override protected void onSizeChanged(int w,int h,int oldw,int oldh){super.onSizeChanged(w,h,oldw,oldh);clear();inspectionTree=null;}
    void select(JSONObject selection){
      logical=null;selectedNode=0;
      try {
        if(!paused && !closed && inspectionTree!=null && selection!=null && revision==inspectionRevision && selection.getInt("revision")==revision && selection.getLong("frame")==inspectionFrame){
          org.json.JSONArray nodes=inspectionTree.getJSONArray("nodes");int id=selection.getInt("nodeId");
          for(int i=0;i<nodes.length();i++){JSONObject node=nodes.getJSONObject(i);if(node.getInt("id")!=id)continue;
            org.json.JSONArray layout=node.optJSONArray("bounds");if(layout==null || layout.length()!=4)break;
            double x=layout.getDouble(0),y=layout.getDouble(1),w=layout.getDouble(2),h=layout.getDouble(3);
            if(Double.isNaN(x+y+w+h) || Double.isInfinite(x+y+w+h) || w<=0 || h<=0)break;
            double l=Math.max(0,x),t=Math.max(0,y),r=Math.min(width,x+w),b=Math.min(height,y+h);
            if(r>l && b>t){logical=new android.graphics.RectF((float)l,(float)t,(float)r,(float)b);selectedNode=id;}break;
          }
        }
      }catch(Exception invalid){logical=null;}
      invalidate();
    }
    @Override protected void onDraw(android.graphics.Canvas canvas){
      super.onDraw(canvas);if(logical==null || paused || closed || revision!=inspectionRevision || width<=0 || height<=0)return;
      android.graphics.RectF rect=new android.graphics.RectF(logical.left*getWidth()/width,logical.top*getHeight()/height,logical.right*getWidth()/width,logical.bottom*getHeight()/height);
      paint.setStyle(android.graphics.Paint.Style.FILL);paint.setColor(0x2600ffff);canvas.drawRect(rect,paint);
      paint.setStyle(android.graphics.Paint.Style.STROKE);paint.setStrokeWidth(2);paint.setColor(Color.CYAN);rect.inset(1,1);canvas.drawRect(rect,paint);
    }
  }
  private boolean recordMode,recordingStopped;
  private JSONObject recordingHeader;
  private java.util.ArrayList<String> recordingSteps;
  private int recordingBytes;
  // Called synchronously by JNI after successful engine entry, on the GL owner.
  private void recordNativeStep(int kind,byte[] bytes){
    if(recordingHeader==null || recordingStopped)return;
    try{
      String value=new String(bytes,"UTF-8"),step;
      if(kind==0)step=value;
      else if(kind==1)step=new JSONObject().put("kind","completion").put("record",value).toString();
      else if(kind==2)step=new JSONObject().put("kind","lifecycle").put("event",value).toString();
      else throw new IllegalArgumentException("Unknown recording action");
      int added=step.getBytes("UTF-8").length+1;
      if(recordingSteps.size()>=36000 || added>8*1024*1024-recordingBytes){recordingStopped=true;setRecording(false);return;}
      recordingSteps.add(step);recordingBytes+=added;
    }catch(Exception invalid){recordingStopped=true;setRecording(false);show("Recording failed: "+invalid.getMessage());}
  }
  private void startRecording(String hash,int w,int h,int d) throws Exception {
    setRecording(false);recordingHeader=null;recordingSteps=null;
    if(!recordMode)return;
    if(!hash.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Invalid recording package hash");
    recordingHeader=new JSONObject().put("format",1).put("packageSha256",hash).put("target","pjm-android")
      .put("launchData","{\"source\":\"development\",\"query\":{}}")
      .put("window",new JSONObject().put("width",w).put("height",h).put("density",d));
    recordingSteps=new java.util.ArrayList<>();recordingBytes=512;recordingStopped=false;setRecording(true);
  }
  private void uploadRecording(){
    if(recordingHeader==null)return;
    try{
      setRecording(false);recordingStopped=true;
      String header=recordingHeader.toString();StringBuilder tape=new StringBuilder(header.substring(0,header.length()-1)).append(",\"steps\":[");
      for(int i=0;i<recordingSteps.size();i++){if(i>0)tape.append(',');tape.append(recordingSteps.get(i));}tape.append("]}");
      final String body=tape.toString();recordingHeader=null;recordingSteps=null;
      network.execute(()->{try{request("recording",body);}catch(Exception error){show("Recording upload failed: "+error.getMessage());}});
    }catch(Exception error){recordingHeader=null;recordingSteps=null;show("Recording failed: "+error.getMessage());}
  }
  private GLSurfaceView surface;
  private TextView message;
  private ScheduledExecutorService network;
  private int reportedRevision;
  private final java.util.concurrent.atomic.AtomicInteger pendingLogs=new java.util.concurrent.atomic.AtomicInteger();
  private String base;
  private volatile int width,height,density,top,bottom,left,right,revision,failedRevision;
  private volatile boolean loading,paused=true,closed;
  private volatile String metrics="";
  private int pixelWidth,pixelHeight;
  private boolean testMode;
  private boolean backPending;
  @Override public void onBackPressed(){
    if(backPending)return;
    if(surface==null || paused || closed || loading || revision<1){finish();return;}
    backPending=true;final int expectedRevision=revision;
    surface.queueEvent(()->{
      int handled=0;
      try{
        if(!paused && !closed && revision==expectedRevision){
          // Current tapes have no Back action. Never upload an incomplete trace.
          if(recordingHeader!=null){setRecording(false);recordingStopped=true;recordingHeader=null;recordingSteps=null;android.util.Log.i("PocketJS","Recording discarded after system Back");}
          handled=systemBack();
        }
      }catch(Throwable error){handled=-1;}
      final int result=handled;
      runOnUiThread(()->{backPending=false;if(closed || paused || revision!=expectedRevision)return;if(result<=0)finish();else surface.requestRender();});
    });
  }
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
    recordMode=getIntent().getBooleanExtra("pjm-record",false);
    inspectionMode=getIntent().getBooleanExtra("pjm-inspect",false);
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
        if(error.isEmpty() && revision>0 && revision!=reportedRevision && network!=null && !closed){final int presented=revision;reportedRevision=presented;try{network.execute(()->{try{request("device-event",new JSONObject().put("revision",presented).put("platform","android").put("kind","frame-ready").toString());}catch(Exception ignored){}});}catch(java.util.concurrent.RejectedExecutionException stopped){}}
        dispatchServices();
        if(revision>0) {
          long[] data=receipt();data[4]=testActions;data[5]=testValue;
          if(inspectionMode && data[0]%60==0 && !inspectionPending && network!=null && !closed){
            byte[] snapshot=debugTree();final int origin=revision;final long frameNumber=data[0];
            if(snapshot!=null){inspectionPending=true;try{network.execute(()->{try{JSONObject tree=new JSONObject(new String(snapshot,"UTF-8"));String body=new JSONObject().put("revision",origin).put("platform","android").put("frame",frameNumber).put("tree",tree).toString();if(body.getBytes("UTF-8").length<=4*1024*1024+1024){request("inspection",body);runOnUiThread(()->{if(revision==origin && !closed){inspectionTree=tree;inspectionFrame=frameNumber;inspectionRevision=origin;inspectionOverlay.clear();}});}}catch(Exception ignored){}finally{inspectionPending=false;}});}catch(java.util.concurrent.RejectedExecutionException stopped){inspectionPending=false;}}
          }
          if(data[0]>=600 && recordingHeader!=null)uploadRecording();
          if(data[0]%30==0) {
            final int nativeRevision=revision;
            runOnUiThread(()->{
              surface.setContentDescription("revision="+nativeRevision+" frames="+data[0]+" touches="+data[1]+" width="+data[2]+" height="+data[3]);
              if(testMode) try {
                JSONObject record=new JSONObject();record.put("session",base);record.put("revision",nativeRevision);record.put("frames",data[0]);record.put("touches",data[1]);
                record.put("width",data[2]);record.put("height",data[3]);record.put("density",density);record.put("top",top);record.put("left",left);
                record.put("actions",data[4]);record.put("value",data[5]);
                record.put("hash",data[6]);record.put("highlight",inspectionOverlay.highlightedNode());testRecord("receipt.json",record.toString());
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
    inspectionOverlay=new InspectionOverlay();root.addView(inspectionOverlay,new FrameLayout.LayoutParams(-1,-1));
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
        try {request=BoundedJson.object(line.getBytes("UTF-8"),4096);}catch(Exception malformed){continue;}
        if(request.optInt("v",0)==1 && request.optString("kind","").equals("debug.log.v1")){
          JSONObject args=request.optJSONObject("args");if(args==null || args.length()!=2 || !(args.opt("message") instanceof String) || !java.util.Arrays.asList("debug","info","warn","error").contains(args.opt("level")) || args.getString("message").getBytes("UTF-8").length>2048 || revision<1 || network==null || closed || pendingLogs.get()>=8)continue;
          final String event=new JSONObject().put("revision",revision).put("platform","android").put("kind","log").put("level",args.getString("level")).put("message",args.getString("message")).toString();pendingLogs.incrementAndGet();
          try{network.execute(()->{try{request("device-event",event);}catch(Exception ignored){}finally{pendingLogs.decrementAndGet();}});}catch(java.util.concurrent.RejectedExecutionException stopped){pendingLogs.decrementAndGet();}continue;
        }
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
      final JSONObject selection=next==revision?state.optJSONObject("inspectionSelection"):null;
      runOnUiThread(()->inspectionOverlay.select(selection));
      if(next<=revision || next==failedRevision || committed.getInt("width")!=w || committed.getInt("height")!=h || committed.getInt("density")!=d) return;
      final AppStorage storage=new AppStorage(getFilesDir(),state.getJSONObject("metadata").getString("appId"));
      final String packageHash=recordMode?state.getString("packageSha256"):"";
      byte[] js=request(next+"/app.js",null),pak=request(next+"/app.pak",null);
      loading=true;
      surface.queueEvent(()->{
        try {
          if(width!=w || height!=h || closed || paused) return;
          setRecording(false);recordingHeader=null;recordingSteps=null;
          String unloadError=prepareUnload();
          if(unloadError.isEmpty())dispatchServices();else android.util.Log.e("PocketJS",unloadError);
          appStorage=null;
          testActions=0;testValue=0;String error=boot(js,pak,w,h,d,testMode);
          if(!error.isEmpty()){failedRevision=next;show(error);return;}
          try{startRecording(packageHash,w,h,d);}catch(Exception invalid){show("Recording configuration failed: "+invalid.getMessage());}
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
    if(inspectionOverlay!=null)inspectionOverlay.clear();inspectionTree=null;
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
