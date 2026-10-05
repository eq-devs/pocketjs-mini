package dev.pjm.android;

import android.app.Activity;
import android.os.Bundle;
import android.opengl.GLSurfaceView;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;
import org.json.JSONObject;

/** Installed entry: authenticates bundled bytes using the bundled publisher key. */
public class InstalledActivity extends Activity {
  private GLSurfaceView surface;private TextView message;private VerifiedPackage admitted;
  private VerifiedContainer container;private VerifiedPresenter presenter;private long generation,frames,gpuEpoch;private boolean gpuBound;
  private VerifiedHttp http;private VerifiedClipboard clipboard;private VerifiedLocation location;private LocationApproval locationApproval;private PermissionGate permissions;private android.app.AlertDialog permissionDialog;
  protected VerifiedHttp createHttp(){return new VerifiedHttp(this);}
  private volatile boolean paused=true,stopped,closed,failed;private int surfaceWidth,surfaceHeight,nextIdentifier;
  private FrameMeasurements measurements;
  private final FramePacer pacer=new FramePacer();
  private final ArrayList<Contact> contacts=new ArrayList<>();
  private static final class Contact {int pointer,identifier,x,y,hit;boolean reported,ended;}
  private final Choreographer.FrameCallback tick=new Choreographer.FrameCallback(){public void doFrame(long time){if(paused || closed || failed)return;if(pacer.request(time))surface.requestRender();Choreographer.getInstance().postFrameCallback(this);}};
  private byte[] asset(String name,int limit)throws IOException{
    try(InputStream input=getAssets().open(name);ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){if(output.size()+count>limit)throw new IOException("Installed asset exceeds budget");output.write(buffer,0,count);}return output.toByteArray();
    }
  }
  private void fail(Throwable error){failed=true;android.util.Log.e("PocketJS","Installed container failed",error);runOnUiThread(()->{message.setText("Cannot open installed mini app");message.setVisibility(View.VISIBLE);});}
  @Override public void onCreate(Bundle state){
    super.onCreate(state);if(getIntent().getBooleanExtra("pjm-measure",false))measurements=new FrameMeasurements();FrameLayout root=new FrameLayout(this);message=new TextView(this);message.setTextColor(0xffffffff);message.setBackgroundColor(0xff0f172a);message.setGravity(Gravity.CENTER);message.setText("Opening mini app…");
    try{byte[] payload=asset("main.pocket",64*1024*1024),envelope=asset("manifest.json",65536),key=asset("publisher.key",32);VerifiedPackage bundled=new VerifiedPackage(payload,envelope,key);PackageStore store=new PackageStore(new File(getFilesDir().getCanonicalFile(),"mini-packages"),key);store.seed(payload,envelope);admitted=store.coldStart(bundled.identity);permissions=new PermissionGate(store);}catch(Exception error){root.addView(message,new FrameLayout.LayoutParams(-1,-1));setContentView(root);fail(error);return;}
    locationApproval=new LocationApproval(this,permissions,()->!paused&&!stopped&&!closed&&!failed);
    surface=new GLSurfaceView(this);surface.setEGLContextClientVersion(2);surface.setPreserveEGLContextOnPause(true);
    surface.setRenderer(new GLSurfaceView.Renderer(){
      public void onSurfaceCreated(GL10 gl,EGLConfig config){if(closed)return;try{
        if(presenter==null)presenter=new VerifiedPresenter();if(gpuBound){container.gpuContextLost(gpuEpoch);gpuBound=false;}nextGpuEpoch();
        if(container==null){http=createHttp();location=new VerifiedLocation(new VerifiedLocation.UI(){
          private FusedLocationProvider provider;
          public void execute(Runnable work){runOnUiThread(work);}
          public boolean foreground(){return !paused&&!stopped&&!closed&&!failed;}
          public boolean authorized(VerifiedPackage value,LocationContract.Options options)throws Exception{return locationApproval.authorized(value,options);}
          public Runnable requestApproval(VerifiedPackage value,LocationContract.Options options,VerifiedLocation.Decision decision)throws Exception{if(permissionDialog!=null)throw new java.util.concurrent.RejectedExecutionException("Native approval already active");return locationApproval.request(value,options,decision);}
          public Runnable start(LocationContract.Options options,VerifiedLocation.Completion completion){if(provider==null)provider=new FusedLocationProvider(InstalledActivity.this);return provider.start(options,completion);}
        });clipboard=new VerifiedClipboard(new VerifiedClipboard.UI(){
          public void execute(Runnable action){runOnUiThread(action);}
          public boolean foreground(){return !paused&&!closed&&!failed;}
          public void write(String text){android.content.ClipboardManager manager=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(manager==null)throw new IllegalStateException("Clipboard unavailable");manager.setPrimaryClip(android.content.ClipData.newPlainText("Mini app",text));}
          public PermissionGate.Status permission(VerifiedPackage value)throws Exception{return permissions.check(value,"clipboard.read",true);}
          public PermissionGate.Status decide(VerifiedPackage value,boolean approved)throws Exception{return permissions.decide(value,"clipboard.read",approved,true);}
          public Runnable prompt(VerifiedPackage value,java.util.function.Consumer<Boolean> decision){
            if(permissionDialog!=null||locationApproval.active())throw new IllegalStateException("Permission dialog already active");
            final Boolean[] selected={null};android.app.AlertDialog dialog=new android.app.AlertDialog.Builder(InstalledActivity.this).setTitle("Clipboard access").setMessage("Allow "+value.identity+" to read clipboard text?").setNegativeButton("Don’t allow",(view,which)->{selected[0]=false;}).setPositiveButton("Allow",(view,which)->{selected[0]=true;}).create();
            permissionDialog=dialog;dialog.setOnCancelListener(view->{selected[0]=false;});dialog.setOnDismissListener(view->{if(permissionDialog==dialog)permissionDialog=null;if(selected[0]!=null)getWindow().getDecorView().post(()->decision.accept(selected[0]));});dialog.show();return dialog::dismiss;
          }
          public String read(){
            if(!hasWindowFocus())return null;
            android.content.ClipboardManager manager=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(manager==null)throw new IllegalStateException("Clipboard unavailable");
            if(!manager.hasPrimaryClip())return "";android.content.ClipData clip=manager.getPrimaryClip();if(clip==null)return null;if(clip.getItemCount()==0)return "";CharSequence text=clip.getItemAt(0).getText();return text==null?"":text.toString();
          }
        });container=new VerifiedContainer(getFilesDir(),new VerifiedContainer.Listener(){
          public void cleanup(VerifiedPackage value,long gen,byte[] record){presenter.finish();}
          public void retired(VerifiedPackage value,long gen){presenter.finish();http.retire(gen);clipboard.retire(gen);location.retire(gen);}
        });generation=container.activate(admitted,"{}".getBytes(StandardCharsets.UTF_8));if(paused)container.background();}
      }catch(Throwable error){fail(error);}}
      public void onSurfaceChanged(GL10 gl,int width,int height){surfaceWidth=width;surfaceHeight=height;}
      public void onDrawFrame(GL10 gl){if(paused || closed || failed || container==null){pacer.complete();return;}long measuredStart=measurements==null?0:System.nanoTime();try{
        http.drain((value,gen,reply)->{try{container.post(value.identity,gen,reply);return true;}catch(IllegalArgumentException retired){return true;}catch(IllegalStateException busy){return false;}});
        clipboard.drain((value,gen,reply)->{try{container.post(value.identity,gen,reply);return true;}catch(IllegalArgumentException retired){return true;}catch(IllegalStateException busy){return false;}});
        location.drain((value,gen,reply)->{try{container.post(value.identity,gen,reply);return true;}catch(IllegalArgumentException retired){return true;}catch(IllegalStateException busy){return false;}});
        ArrayList<Contact> sample=new ArrayList<>(contacts);int[] packed=new int[sample.size()],hits=new int[sample.size()];
        for(int i=0;i<sample.size();i++){Contact contact=sample.get(i);packed[i]=contact.x>511 || contact.y>511?0x80000000|(contact.identifier<<20)|(contact.y<<10)|contact.x:(contact.identifier<<18)|(contact.y<<9)|contact.x;hits[i]=contact.hit;contact.reported=true;}
        drawGpu(packed,hits,new byte[0]);frames++;contacts.removeIf(contact->contact.ended);dispatch(container.effects());
        if(frames==1)runOnUiThread(()->{surface.setContentDescription("signed="+admitted.identity+" version="+admitted.version+" frames="+frames);message.setVisibility(View.GONE);});
      }catch(Throwable error){fail(error);}finally{if(measurements!=null)measurements.record(measuredStart,System.nanoTime());pacer.complete();}}
    });surface.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
    surface.setOnTouchListener((view,event)->{MotionEvent copy=MotionEvent.obtain(event);surface.queueEvent(()->{try{touch(copy);}catch(Throwable error){fail(error);}finally{copy.recycle();}});return true;});
    root.addView(surface,new FrameLayout.LayoutParams(-1,-1));root.addView(message,new FrameLayout.LayoutParams(-1,-1));
    root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});setContentView(root);
  }
  private void nextGpuEpoch(){if(gpuEpoch==Long.MAX_VALUE)throw new IllegalStateException("GPU epochs exhausted");gpuEpoch++;}
  private void releaseGpu(){if(gpuBound){container.releaseGpu(gpuEpoch);gpuBound=false;nextGpuEpoch();}}
  private void drawGpu(int[] packed,int[] hits,byte[] cancelled){
    float scale=Math.min((float)surfaceWidth/admitted.width,(float)surfaceHeight/admitted.height);
    int width=Math.round(admitted.width*scale),height=Math.round(admitted.height*scale);
    try{container.gpuFrame(gpuEpoch,packed,hits,cancelled,(surfaceWidth-width)/2,(surfaceHeight-height)/2,width,height,surfaceWidth,surfaceHeight);}finally{gpuBound=container.gpuEpoch()==gpuEpoch;}
  }
  private void touch(MotionEvent event){
    if(paused || closed || failed || container==null || surfaceWidth<1 || surfaceHeight<1)return;
    int action=event.getActionMasked(),index=event.getActionIndex();if(action==MotionEvent.ACTION_CANCEL){cancel();return;}
    if(action==MotionEvent.ACTION_DOWN || action==MotionEvent.ACTION_POINTER_DOWN){
      float scale=Math.min((float)surfaceWidth/admitted.width,(float)surfaceHeight/admitted.height);float left=(surfaceWidth-admitted.width*scale)/2,top=(surfaceHeight-admitted.height*scale)/2;
      if(contacts.size()>=8 || event.getX(index)<left || event.getX(index)>=surfaceWidth-left || event.getY(index)<top || event.getY(index)>=surfaceHeight-top)return;Contact contact=new Contact();contact.pointer=event.getPointerId(index);
      boolean used;do{contact.identifier=nextIdentifier++&255;used=false;for(Contact existing:contacts)if(existing.identifier==contact.identifier)used=true;}while(used);
      position(contact,event,index);contact.hit=container.hitTest(contact.x,contact.y);contacts.add(contact);
    }else for(Contact contact:contacts){int pointer=event.findPointerIndex(contact.pointer);if(pointer>=0)position(contact,event,pointer);if((action==MotionEvent.ACTION_UP || action==MotionEvent.ACTION_POINTER_UP) && contact.pointer==event.getPointerId(index))contact.ended=true;}
  }
  private void position(Contact contact,MotionEvent event,int index){float scale=Math.min((float)surfaceWidth/admitted.width,(float)surfaceHeight/admitted.height);float left=(surfaceWidth-admitted.width*scale)/2,top=(surfaceHeight-admitted.height*scale)/2;contact.x=Math.max(0,Math.min(admitted.width-1,(int)((event.getX(index)-left)/scale)));contact.y=Math.max(0,Math.min(admitted.height-1,(int)((event.getY(index)-top)/scale)));}
  private void cancel(){if(container==null)return;byte[] cancelled=new byte[contacts.size()];int count=0;for(Contact contact:contacts)if(contact.reported)cancelled[count++]=(byte)contact.identifier;contacts.clear();if(count>0){container.frame(new int[0],new int[0],java.util.Arrays.copyOf(cancelled,count));dispatch(container.effects());}}
  private void dispatch(byte[] batch){for(String line:new String(batch,StandardCharsets.UTF_8).split("\n")){try{
    JSONObject request=BoundedJson.object(line.getBytes(StandardCharsets.UTF_8),4096);Object id=request.opt("id");double number=id instanceof Number?((Number)id).doubleValue():0;if(number<1 || number>9007199254740991L || number!=Math.floor(number))continue;
    JSONObject reply=new JSONObject().put("v",1).put("id",id);String kind=request.optString("kind","");
    if(!(request.opt("v") instanceof Number) || ((Number)request.get("v")).doubleValue()!=1 || !(request.opt("kind") instanceof String) || !request.has("args"))reply.put("ok",false).put("error",new JSONObject().put("code","PROTOCOL").put("message","Invalid service request"));
    else if(kind.equals("device.info.v1"))reply.put("ok",true).put("data",new JSONObject().put("platform","android").put("model",android.os.Build.MODEL).put("width",admitted.width).put("height",admitted.height).put("density",admitted.density).put("safeTop",0).put("safeBottom",0).put("safeLeft",0).put("safeRight",0));
    else if(kind.equals("clipboard.write.v1")){JSONObject result=clipboard.start(admitted,generation,(long)number,request.opt("args"));if(result==null)continue;reply=result;}
    else if(kind.equals("clipboard.read.v1")){JSONObject result=clipboard.startRead(admitted,generation,(long)number,request.opt("args"));if(result==null)continue;reply=result;}
    else if(kind.equals("location.get.v1")){JSONObject result=location.start(admitted,generation,(long)number,request.opt("args"));if(result==null)continue;reply=result;}
    else if(kind.equals("request.v1")){JSONObject result=http.start(admitted,generation,(long)number,request.opt("args"));if(result==null)continue;reply=result;}
    else if(kind.equals("resource.read.v1") || kind.equals("resource.release.v1")){try{Object data=kind.equals("resource.read.v1")?http.resourceRead(admitted.identity,generation,request.opt("args")):http.resourceRelease(admitted.identity,generation,request.opt("args"));reply.put("ok",true).put("data",data);}catch(Exception error){reply.put("ok",false).put("error",new JSONObject().put("code",error instanceof SecurityException?"DENIED":"PROTOCOL").put("message","Invalid resource request"));}}
    else if(kind.equals("cancel.v1")){http.cancel(generation,(long)number);clipboard.cancel(generation,(long)number);location.cancel(generation,(long)number);reply.put("ok",true).put("data",JSONObject.NULL);}
    else reply.put("ok",false).put("error",new JSONObject().put("code","UNSUPPORTED").put("message","Unsupported native service"));
    container.post(admitted.identity,generation,reply.toString().replace("\\/","/").getBytes(StandardCharsets.UTF_8));
  }catch(org.json.JSONException ignored){/* Plain guest diagnostics are not requests. */}}}
  @Override public void onStart(){super.onStart();stopped=false;}
  @Override public void onResume(){super.onResume();if(surface==null || closed)return;surface.onResume();surface.queueEvent(()->{try{if(container!=null)container.resume();if(location!=null)location.resume();paused=false;runOnUiThread(()->{if(!paused && !closed && !failed){locationApproval.resume();Choreographer.getInstance().postFrameCallback(tick);}});}catch(Throwable error){fail(error);}});}
  @Override public void onPause(){paused=true;pacer.reset();boolean permissionPause=locationApproval!=null&&locationApproval.awaitingOS();if(permissionDialog!=null){permissionDialog.dismiss();permissionDialog=null;}Choreographer.getInstance().removeFrameCallback(tick);boolean ending=isFinishing();if(ending)closed=true;if(surface!=null){surface.queueEvent(()->{try{if(measurements!=null)android.util.Log.i("PocketJS",measurements.report());try{cancel();}catch(Throwable cancellationFailure){fail(cancellationFailure);}if(location!=null){if(ending)location.close();else if(!permissionPause)location.suspend();}if(container!=null){releaseGpu();presenter.finish();if(ending){container.close();container=null;if(http!=null)http.close();if(clipboard!=null)clipboard.close();presenter.close();}else container.background();}}catch(Throwable error){fail(error);}});surface.onPause();}super.onPause();}
  @Override public void onStop(){stopped=true;if(surface!=null&&!closed)surface.queueEvent(()->{if(location!=null)location.suspend();});super.onStop();}
  @Override public void onRequestPermissionsResult(int code,String[] names,int[] grants){if(locationApproval==null||!locationApproval.onRequestPermissionsResult(code))super.onRequestPermissionsResult(code,names,grants);}
  @Override public void onDestroy(){
    closed=true;paused=true;Choreographer.getInstance().removeFrameCallback(tick);
    if(surface!=null){surface.queueEvent(()->{try{contacts.clear();if(container!=null){releaseGpu();presenter.finish();container.close();container=null;}if(http!=null)http.close();if(clipboard!=null)clipboard.close();if(location!=null)location.close();if(presenter!=null)presenter.close();}catch(Throwable error){android.util.Log.e("PocketJS","Installed teardown failed",error);}});surface.onResume();surface.onPause();}
    super.onDestroy();
  }
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(surface!=null && !closed && level>=TRIM_MEMORY_RUNNING_LOW && level!=TRIM_MEMORY_UI_HIDDEN)surface.queueEvent(()->{try{if(container!=null){presenter.finish();container.memoryWarning();}}catch(Throwable error){fail(error);}});}
}
