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
  private VerifiedNetwork networkStatus;
  private VerifiedClipboard clipboard;
  private VerifiedHttp http;
  private VerifiedLocation location;
  private ManagedResources resources;private VerifiedMedia media;private MediaPicker mediaPicker;private boolean mediaDeclared;
  private LocationApproval locationApproval;
  private boolean locationDeclared;
  private VerifiedHttp.UrlAccess httpAccess;
  private long clipboardGeneration;
  private String appIdentity;
  private boolean clipboardReadDeclared;
  private android.app.AlertDialog clipboardDialog;
  private Runnable clipboardDecision;
  private boolean networkWatching;
  private String networkDelivered;
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
    if(surface==null || paused || closed || loading || revision<1){testRecord("back.txt","unavailable paused="+paused+" closed="+closed+" loading="+loading+" revision="+revision);finish();return;}
    backPending=true;final int expectedRevision=revision;
    surface.queueEvent(()->{
      int handled=0;
      try{
        if(!paused && !closed && revision==expectedRevision){
          // Current tapes have no Back action. Never upload an incomplete trace.
          if(recordingHeader!=null){setRecording(false);recordingStopped=true;recordingHeader=null;recordingSteps=null;android.util.Log.i("PocketJS","Recording discarded after system Back");}
          handled=systemBack();
        }
        testRecord("back.txt","handled="+handled+" revision="+expectedRevision);
      }catch(Throwable error){handled=-1;android.util.Log.e("PocketJS","System Back failed",error);testRecord("back.txt","failed: "+error);}
      final int result=handled;
      runOnUiThread(()->{backPending=false;if(closed || paused || revision!=expectedRevision)return;if(result<=0)finish();else surface.requestRender();});
    });
  }
  // Native validation only: sections surround JNI, outside the guest deadline.
  private String tracedFrame(){
    if(!testMode)return frame();
    android.os.Trace.beginSection("pjm.native.frame");
    try{String result=frame();if(!result.isEmpty()){android.os.Trace.beginSection("pjm.native.frame.failed");android.os.Trace.endSection();}return result;}finally{android.os.Trace.endSection();}
  }
  private String tracedLifecycle(boolean visible){
    if(!testMode)return lifecycle(visible);
    android.os.Trace.beginSection(visible?"pjm.native.resume":"pjm.native.hide");
    try{String result=lifecycle(visible);if(!result.isEmpty()){android.os.Trace.beginSection("pjm.native.lifecycle.failed");android.os.Trace.endSection();}return result;}finally{android.os.Trace.endSection();}
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

  private void configureRenderThread(){
    // The GL owner drives guest frames and presentation; configure that thread only.
    try{android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_DISPLAY);}
    catch(SecurityException denied){android.util.Log.w("PocketJS","Display thread priority unavailable",denied);}
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    networkStatus=new VerifiedNetwork(this);
    locationApproval=new LocationApproval(this,()->!paused&&!closed);
    mediaPicker=new MediaPicker(this,()->!paused&&!closed,()->clipboardDialog!=null||clipboardDecision!=null||locationApproval.active());
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
      public void onSurfaceCreated(GL10 gl,EGLConfig config) {configureRenderThread();if(!contextCreated()){revision=0;failedRevision=0;}}
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
        if(location==null)location=new VerifiedLocation(new VerifiedLocation.UI(){
          private FusedLocationProvider provider;
          public void execute(Runnable work){runOnUiThread(work);}
          public boolean foreground(){return !paused&&!closed;}
          public boolean authorized(VerifiedPackage value,LocationContract.Options options){throw new IllegalStateException("Development binding required");}
          public Runnable requestApproval(VerifiedPackage value,LocationContract.Options options,VerifiedLocation.Decision decision){throw new IllegalStateException("Development binding required");}
          public Runnable start(LocationContract.Options options,VerifiedLocation.Completion completion){if(provider==null)provider=new FusedLocationProvider(MiniActivity.this);return provider.start(options,completion);}
        });
        if(resources==null)resources=new ManagedResources();
        if(http==null)http=new VerifiedHttp(MiniActivity.this,resources);
        if(media==null)media=new VerifiedMedia(resources,new VerifiedMedia.UI(){public void execute(Runnable work){runOnUiThread(work);}public Runnable select(VerifiedPackage value,MediaContract.Options options,VerifiedMedia.Completion completion){throw new IllegalStateException("Development media binding required");}});
        if(clipboard==null)clipboard=new VerifiedClipboard(new VerifiedClipboard.UI(){
          public void execute(Runnable action){runOnUiThread(action);}
          public boolean foreground(){return !paused&&!closed&&hasWindowFocus();}
          public String read(){if(!hasWindowFocus())return null;android.content.ClipboardManager manager=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(manager==null)throw new IllegalStateException("Clipboard unavailable");android.content.ClipData clip=manager.getPrimaryClip();if(clip==null||clip.getItemCount()==0)return "";CharSequence text=clip.getItemAt(0).getText();if(text==null)throw new IllegalStateException("Clipboard is not text");return text.toString();}
          public void write(String text){android.content.ClipboardManager manager=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(manager==null)throw new IllegalStateException("Clipboard unavailable");manager.setPrimaryClip(android.content.ClipData.newPlainText("PocketJS",text));}
        });
        try{clipboard.drain((value,generation,reply)->generation!=clipboardGeneration || serviceReply(reply));}catch(Exception failure){show("Clipboard delivery failed");}
        location.drainDevelopment((identity,generation,reply)->generation!=clipboardGeneration || !identity.equals(appIdentity) || serviceReply(reply));
        media.drainDevelopment((identity,generation,reply)->generation!=clipboardGeneration || !identity.equals(appIdentity) || serviceReply(reply));
        http.drainDevelopment((identity,generation,reply)->generation!=clipboardGeneration || !identity.equals(appIdentity) || serviceReply(reply));
        drainNetwork();
        String error=tracedFrame();
        if(!error.isEmpty()) {failedRevision=revision;show("Frame revision="+revision+": "+error);}
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
        } else if(kind.equals("device.network.v1")) {
          Object args=request.opt("args");
          if(!(args instanceof JSONObject)||((JSONObject)args).length()!=0){reply.put("ok",false);reply.put("error",new JSONObject().put("code","PROTOCOL").put("message","Network state takes no arguments"));}
          else{String latest=networkStatus.state();reply.put("ok",true);reply.put("data",new JSONObject(latest));networkWatching=true;networkDelivered=latest;}
        } else if(kind.equals("storage.get.v1") || kind.equals("storage.set.v1") || kind.equals("storage.remove.v1")) {
          try {
            if(appStorage==null)throw new IOException("Host app identity is unavailable");
            reply.put("data",appStorage.dispatch(kind,request.opt("args")));reply.put("ok",true);
          }catch(Exception error){reply.put("ok",false);reply.put("error",new JSONObject().put("code",error instanceof AppStorage.Busy?"BUSY":error instanceof IllegalArgumentException?"PROTOCOL":"FAILED").put("message",error.getMessage()==null?"Storage failed":error.getMessage()));}
        } else if(kind.equals("clipboard.write.v1")) {
          if(clipboard==null || appIdentity==null){reply.put("ok",false);reply.put("error",new JSONObject().put("code","BUSY").put("message","Clipboard unavailable"));}
          else{JSONObject immediate=clipboard.startDevelopmentWrite(appIdentity,clipboardGeneration,(long)number,request.opt("args"));if(immediate==null)continue;reply=immediate;}
        } else if(kind.equals("clipboard.read.v1")) {
          if(clipboard==null || appIdentity==null){reply.put("ok",false);reply.put("error",new JSONObject().put("code","BUSY").put("message","Clipboard unavailable"));}
          else{JSONObject immediate=clipboard.startDevelopmentRead(developmentClipboardAccess(),clipboardGeneration,(long)number,request.opt("args"));if(immediate==null)continue;reply=immediate;}
        } else if(kind.equals("media.select.v1")) {
          JSONObject immediate=media.startDevelopment(developmentMediaAccess(),clipboardGeneration,(long)number,request.opt("args"));if(immediate==null)continue;reply=immediate;
        } else if(kind.equals("location.get.v1")) {
          JSONObject immediate=location.startDevelopment(developmentLocationAccess(),clipboardGeneration,(long)number,request.opt("args"));if(immediate==null)continue;reply=immediate;
        } else if(kind.equals("request.v1")) {
          JSONObject immediate=http.startDevelopment(httpAccess,clipboardGeneration,(long)number,request.opt("args"));if(immediate==null)continue;reply=immediate;
        } else if(kind.equals("resource.read.v1") || kind.equals("resource.release.v1")) {
          try{if(appIdentity==null)throw new SecurityException("App unavailable");Object data=kind.equals("resource.read.v1")?http.resourceRead(appIdentity,clipboardGeneration,request.opt("args")):http.resourceRelease(appIdentity,clipboardGeneration,request.opt("args"));reply.put("ok",true).put("data",data);}catch(Exception error){reply.put("ok",false).put("error",new JSONObject().put("code",error instanceof SecurityException?"DENIED":"PROTOCOL").put("message","Invalid resource request"));}
        } else if(kind.equals("cancel.v1")) {if(media!=null)media.cancel(clipboardGeneration,(long)number);if(location!=null)location.cancel(clipboardGeneration,(long)number);if(http!=null)http.cancel(clipboardGeneration,(long)number);if(clipboard!=null)clipboard.cancel(clipboardGeneration,(long)number);reply.put("ok",true);reply.put("data",JSONObject.NULL);}
        else if(testMode && kind.equals("test.report.v1") && request.optJSONObject("args")!=null && request.getJSONObject("args").opt("value") instanceof Number){testActions++;testValue=request.getJSONObject("args").getLong("value");reply.put("ok",true);reply.put("data",JSONObject.NULL);}
        else {reply.put("ok",false);reply.put("error",new JSONObject().put("code","UNSUPPORTED").put("message","Unsupported native service: "+kind.substring(0,Math.min(kind.length(),64))));}
        if(!serviceReply(reply.toString().getBytes("UTF-8"))) {show("Native completion queue is full");break;}
      }
    }catch(Exception error){show("Native service failed: "+error.getMessage());}
  }
  private void finishClipboardDecision(){if(hasWindowFocus()&&clipboardDecision!=null){Runnable complete=clipboardDecision;clipboardDecision=null;complete.run();}}
  @Override public void onWindowFocusChanged(boolean focused){super.onWindowFocusChanged(focused);if(focused)finishClipboardDecision();}
  private VerifiedClipboard.ReadAccess developmentClipboardAccess(){
    final String identity=appIdentity;final boolean declared=clipboardReadDeclared;
    return new VerifiedClipboard.ReadAccess(){
      public String identity(){return identity;}
      public void authorize(){if(!declared)throw new SecurityException("Clipboard read was not declared");}
      private android.content.SharedPreferences decisions(){return getSharedPreferences("pjm-development-clipboard-consent",MODE_PRIVATE);}
      public PermissionGate.Status permission(){if(!declared)return PermissionGate.Status.DENIED;android.content.SharedPreferences store=decisions();return !store.contains(identity)?PermissionGate.Status.PROMPT:store.getBoolean(identity,false)?PermissionGate.Status.GRANTED:PermissionGate.Status.DENIED;}
      public PermissionGate.Status decide(boolean approved){android.content.SharedPreferences store=decisions();if(!store.contains(identity)&&store.getAll().size()>=64)throw new IllegalStateException("Development consent history is full");if(!store.edit().putBoolean(identity,approved).commit())throw new IllegalStateException("Cannot save development consent");return permission();}
      public Runnable prompt(VerifiedClipboard.Decision decision){
        if(clipboardDialog!=null||clipboardDecision!=null||locationApproval.active()||mediaPicker.active())throw new java.util.concurrent.RejectedExecutionException("Approval already active");
        final Boolean[] selected={null};android.app.AlertDialog dialog=new android.app.AlertDialog.Builder(MiniActivity.this).setTitle("Clipboard access").setMessage("Allow development app "+identity+" to read clipboard text?").setNegativeButton("Don’t allow",(view,which)->selected[0]=false).setPositiveButton("Allow",(view,which)->selected[0]=true).create();
        Runnable complete=()->decision.accept(selected[0]);clipboardDialog=dialog;dialog.setOnCancelListener(view->selected[0]=false);dialog.setOnDismissListener(view->{if(clipboardDialog==dialog)clipboardDialog=null;if(selected[0]!=null){clipboardDecision=complete;finishClipboardDecision();}});dialog.show();return ()->{dialog.dismiss();if(clipboardDecision==complete)clipboardDecision=null;};
      }
    };
  }
  private VerifiedLocation.Access developmentLocationAccess(){
    final String identity=appIdentity;final boolean declared=locationDeclared;
    final LocationApproval.Consent consent=new LocationApproval.Consent(){
      public String identity(){return identity;}
      private android.content.SharedPreferences decisions(){return getSharedPreferences("pjm-development-location-consent",MODE_PRIVATE);}
      public PermissionGate.Status check(boolean granted){if(!declared)return PermissionGate.Status.DENIED;java.util.Map<String,?> saved=decisions().getAll();if(!saved.containsKey(identity))return PermissionGate.Status.PROMPT;Object value=saved.get(identity);return Boolean.TRUE.equals(value)&&granted?PermissionGate.Status.GRANTED:PermissionGate.Status.DENIED;}
      public void decide(boolean approved,boolean granted){if(!declared)throw new SecurityException("Location undeclared");android.content.SharedPreferences store=decisions();if(!store.contains(identity)&&store.getAll().size()>=64)throw new IllegalStateException("Consent capacity exceeded");if(!store.edit().putBoolean(identity,approved).commit())throw new IllegalStateException("Consent persistence failed");}
    };
    return new VerifiedLocation.Access(){
      public String identity(){return identity;}
      public void declared(){if(!declared)throw new SecurityException("Location undeclared");}
      public boolean authorized(LocationContract.Options options)throws Exception{return locationApproval.authorized(consent,options);}
      public Runnable requestApproval(LocationContract.Options options,VerifiedLocation.Decision decision)throws Exception{if(clipboardDialog!=null||clipboardDecision!=null||mediaPicker.active())throw new java.util.concurrent.RejectedExecutionException("Native approval already active");return locationApproval.request(consent,options,decision);}
    };
  }
  private VerifiedMedia.Access developmentMediaAccess(){
    final String identity=appIdentity;final boolean declared=mediaDeclared;
    final MediaPicker.Consent consent=new MediaPicker.Consent(){
      public String identity(){return identity;}
      private android.content.SharedPreferences decisions(){return getSharedPreferences("pjm-development-media-consent",MODE_PRIVATE);}
      public PermissionGate.Status check(){if(!declared)return PermissionGate.Status.DENIED;Object value=decisions().getAll().get(identity);return value instanceof Boolean?((Boolean)value?PermissionGate.Status.GRANTED:PermissionGate.Status.DENIED):PermissionGate.Status.PROMPT;}
      public PermissionGate.Status decide(boolean approved){android.content.SharedPreferences values=decisions();if(!values.contains(identity)&&values.getAll().size()>=64)throw new java.util.concurrent.RejectedExecutionException("Development media consent capacity exceeded");if(!values.edit().putBoolean(identity,approved).commit())throw new IllegalStateException("Development media consent unavailable");return check();}
    };
    return new VerifiedMedia.Access(){public String identity(){return identity;}public boolean declared(){return declared;}public Runnable select(MediaContract.Options options,VerifiedMedia.Completion completion)throws Exception{return mediaPicker.select(consent,options,completion);}};
  }
  @Override protected void onActivityResult(int code,int result,android.content.Intent data){if(mediaPicker==null||!mediaPicker.onActivityResult(code,result,data))super.onActivityResult(code,result,data);}
  @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);locationApproval.onRequestPermissionsResult(code);}
  private void drainNetwork(){
    if(!networkWatching||revision<1||closed)return;
    String latest=networkStatus.state();if(latest.equals(networkDelivered))return;
    try{byte[] event=new JSONObject().put("v",1).put("event","device.network.v1").put("data",new JSONObject(latest)).toString().getBytes("UTF-8");if(serviceReply(event))networkDelivered=latest;}
    catch(Exception malformed){show("Native network state failed");}
  }
  private void testStatus(String value){if(!testMode)return;testRecord("status.txt",value);try{testRecord("status.json",new JSONObject().put("session",base).put("revision",revision).put("message",value).toString());}catch(Exception ignored){}}
  private void show(String value) {runOnUiThread(()->{if(!closed){message.setText(value);message.setVisibility(View.VISIBLE);testStatus(value);}});}
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
      final String identity=state.getJSONObject("metadata").getString("appId");
      final org.json.JSONArray permissions=state.getJSONObject("metadata").optJSONArray("permissions");boolean declared=false,locationPermission=false,mediaPermission=false;if(permissions!=null && permissions.length()<=32)for(int index=0;index<permissions.length();index++){if("clipboard.read".equals(permissions.opt(index)))declared=true;if("location".equals(permissions.opt(index)))locationPermission=true;if("media".equals(permissions.opt(index)))mediaPermission=true;}final boolean readDeclared=declared,declaredLocation=locationPermission,declaredMedia=mediaPermission;
      final VerifiedHttp.UrlAccess committedHttpAccess=VerifiedHttp.developmentAccess(identity,state.getJSONObject("metadata").getJSONArray("domains"));
      final AppStorage storage=new AppStorage(getFilesDir(),identity);
      final String packageHash=recordMode?state.getString("packageSha256"):"";
      byte[] js=request(next+"/app.js",null),pak=request(next+"/app.pak",null);
      loading=true;
      surface.queueEvent(()->{
        try {
          if(width!=w || height!=h || closed || paused) return;
          setRecording(false);recordingHeader=null;recordingSteps=null;
          String unloadError=prepareUnload();
          if(unloadError.isEmpty())dispatchServices();else android.util.Log.e("PocketJS",unloadError);
          if(clipboard!=null)clipboard.retire(clipboardGeneration);if(http!=null)http.retire(clipboardGeneration);if(location!=null)location.retire(clipboardGeneration);if(media!=null)media.retire(clipboardGeneration);if(resources!=null)resources.retire(clipboardGeneration);clipboardGeneration++;appIdentity=null;httpAccess=null;
          networkWatching=false;networkDelivered=null;
          appStorage=null;
          testActions=0;testValue=0;String error=boot(js,pak,w,h,d,testMode);
          if(!error.isEmpty()){failedRevision=next;show("Boot revision="+next+": "+error);return;}
          try{startRecording(packageHash,w,h,d);}catch(Exception invalid){show("Recording configuration failed: "+invalid.getMessage());}
          appStorage=storage;appIdentity=identity;httpAccess=committedHttpAccess;clipboardReadDeclared=readDeclared;locationDeclared=declaredLocation;mediaDeclared=declaredMedia;revision=next;failedRevision=0;
          runOnUiThread(()->{message.setVisibility(View.GONE);testStatus("");});
        } finally {loading=false;}
      });
    } catch(Exception error){show("Cannot reach development host. Keep pjm run active.\n"+error.getMessage());metrics="";}
  }
  @Override public void onResume(){
    super.onResume();nextFrameNanos=0;
    if(networkStatus!=null)networkStatus.resume();
    if(surface!=null){
      surface.onResume();
      surface.queueEvent(()->{
        if(closed)return;
        String error=tracedLifecycle(true);if(!error.isEmpty())show("Resume revision="+revision+": "+error);
        if(pendingMemoryWarning){pendingMemoryWarning=false;error=memoryWarning();if(!error.isEmpty())show("Memory warning revision="+revision+": "+error);}
        if(location!=null)location.resume();paused=false;
        runOnUiThread(()->{if(!paused && !closed){locationApproval.resume();mediaPicker.resume();Choreographer.getInstance().postFrameCallback(frameCallback);}});
      });
    }
  }
  @Override public void onPause(){
    if(networkStatus!=null)networkStatus.suspend();
    if(inspectionOverlay!=null)inspectionOverlay.clear();inspectionTree=null;
    paused=true;Choreographer.getInstance().removeFrameCallback(frameCallback);touch(3,0,0,0);
    final boolean permissionPause=locationApproval.awaitingOS();final boolean mediaPause=mediaPicker.external();
    final boolean ending=isFinishing() || isChangingConfigurations();
    if(ending){closed=true;if(network!=null)network.shutdownNow();}
    if(surface!=null){
      surface.queueEvent(()->{
        if(ending){String unloadError=prepareUnload();if(unloadError.isEmpty())dispatchServices();else android.util.Log.e("PocketJS",unloadError);}
        if(location!=null){if(ending)location.close();else if(!permissionPause)location.suspend();}
        if(media!=null){if(ending)media.close();else if(!mediaPause)media.suspend();}
        String error=ending?shutdown():tracedLifecycle(false);
        if(ending){if(clipboard!=null)clipboard.close();if(http!=null)http.close();if(resources!=null)resources.close();httpAccess=null;appIdentity=null;appStorage=null;revision=0;failedRevision=0;}
        if(!error.isEmpty()){String failure=(ending?"Shutdown":"Hide")+" revision="+revision+": "+error;android.util.Log.e("PocketJS",failure);testStatus(failure);}
      });
      surface.onPause();
    }
    super.onPause();
  }
  @Override public void onDestroy(){closed=true;if(mediaPicker!=null)mediaPicker.close();if(networkStatus!=null)networkStatus.suspend();if(network!=null)network.shutdownNow();super.onDestroy();}
  @Override public void onTrimMemory(int level){
    super.onTrimMemory(level);
    if(level==TRIM_MEMORY_UI_HIDDEN || level<TRIM_MEMORY_RUNNING_LOW || closed)return;
    pendingMemoryWarning=true;
    if(surface!=null && !paused)surface.queueEvent(()->{
      if(closed || paused || !pendingMemoryWarning)return;
      pendingMemoryWarning=false;
      String error=memoryWarning();if(!error.isEmpty())show("Memory warning revision="+revision+": "+error);
    });
  }
}
