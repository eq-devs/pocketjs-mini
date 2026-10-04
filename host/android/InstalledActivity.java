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
  private VerifiedContainer container;private VerifiedPresenter presenter;private long generation,frames;
  private volatile boolean paused=true,closed,failed;private int surfaceWidth,surfaceHeight,nextIdentifier;
  private final ArrayList<Contact> contacts=new ArrayList<>();
  private static final class Contact {int pointer,identifier,x,y,hit;boolean reported,ended;}
  private final Choreographer.FrameCallback tick=new Choreographer.FrameCallback(){public void doFrame(long time){if(paused || closed || failed)return;surface.requestRender();Choreographer.getInstance().postFrameCallback(this);}};
  private byte[] asset(String name,int limit)throws IOException{
    try(InputStream input=getAssets().open(name);ByteArrayOutputStream output=new ByteArrayOutputStream()){
      byte[] buffer=new byte[8192];int count;while((count=input.read(buffer))!=-1){if(output.size()+count>limit)throw new IOException("Installed asset exceeds budget");output.write(buffer,0,count);}return output.toByteArray();
    }
  }
  private void fail(Throwable error){failed=true;android.util.Log.e("PocketJS","Installed container failed",error);runOnUiThread(()->{message.setText("Cannot open installed mini app");message.setVisibility(View.VISIBLE);});}
  @Override public void onCreate(Bundle state){
    super.onCreate(state);FrameLayout root=new FrameLayout(this);message=new TextView(this);message.setTextColor(0xffffffff);message.setBackgroundColor(0xff0f172a);message.setGravity(Gravity.CENTER);message.setText("Opening mini app…");
    try{byte[] payload=asset("main.pocket",64*1024*1024),envelope=asset("manifest.json",65536),key=asset("publisher.key",32);VerifiedPackage bundled=new VerifiedPackage(payload,envelope,key);PackageStore store=new PackageStore(new File(getFilesDir().getCanonicalFile(),"mini-packages"),key);store.seed(payload,envelope);admitted=store.coldStart(bundled.identity);}catch(Exception error){root.addView(message,new FrameLayout.LayoutParams(-1,-1));setContentView(root);fail(error);return;}
    surface=new GLSurfaceView(this);surface.setEGLContextClientVersion(2);surface.setPreserveEGLContextOnPause(true);
    surface.setRenderer(new GLSurfaceView.Renderer(){
      public void onSurfaceCreated(GL10 gl,EGLConfig config){if(closed)return;try{
        if(presenter==null)presenter=new VerifiedPresenter();presenter.contextCreated();
        if(container==null){container=new VerifiedContainer(getFilesDir(),new VerifiedContainer.Listener(){
          public void cleanup(VerifiedPackage value,long gen,byte[] record){presenter.finish();}
          public void retired(VerifiedPackage value,long gen){presenter.finish();}
        });generation=container.activate(admitted,"{}".getBytes(StandardCharsets.UTF_8));if(paused)container.background();}
      }catch(Throwable error){fail(error);}}
      public void onSurfaceChanged(GL10 gl,int width,int height){surfaceWidth=width;surfaceHeight=height;}
      public void onDrawFrame(GL10 gl){if(paused || closed || failed || container==null)return;try{
        ArrayList<Contact> sample=new ArrayList<>(contacts);int[] packed=new int[sample.size()],hits=new int[sample.size()];
        for(int i=0;i<sample.size();i++){Contact contact=sample.get(i);packed[i]=contact.x>511 || contact.y>511?0x80000000|(contact.identifier<<20)|(contact.y<<10)|contact.x:(contact.identifier<<18)|(contact.y<<9)|contact.x;hits[i]=contact.hit;contact.reported=true;}
        presenter.draw(container.frame(packed,hits,new byte[0]),surfaceWidth,surfaceHeight);frames++;contacts.removeIf(contact->contact.ended);dispatch(container.effects());
        if(frames==1)runOnUiThread(()->{surface.setContentDescription("signed="+admitted.identity+" version="+admitted.version+" frames="+frames);message.setVisibility(View.GONE);});
      }catch(Throwable error){fail(error);}}
    });surface.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
    surface.setOnTouchListener((view,event)->{MotionEvent copy=MotionEvent.obtain(event);surface.queueEvent(()->{try{touch(copy);}catch(Throwable error){fail(error);}finally{copy.recycle();}});return true;});
    root.addView(surface,new FrameLayout.LayoutParams(-1,-1));root.addView(message,new FrameLayout.LayoutParams(-1,-1));
    root.setOnApplyWindowInsetsListener((view,insets)->{view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets.consumeSystemWindowInsets();});setContentView(root);
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
    JSONObject request=new JSONObject(line);Object id=request.opt("id");double number=id instanceof Number?((Number)id).doubleValue():0;if(number<1 || number>9007199254740991L || number!=Math.floor(number))continue;
    JSONObject reply=new JSONObject().put("v",1).put("id",id);String kind=request.optString("kind","");
    if(!(request.opt("v") instanceof Number) || ((Number)request.get("v")).doubleValue()!=1 || !(request.opt("kind") instanceof String) || !request.has("args"))reply.put("ok",false).put("error",new JSONObject().put("code","PROTOCOL").put("message","Invalid service request"));
    else if(kind.equals("device.info.v1"))reply.put("ok",true).put("data",new JSONObject().put("platform","android").put("model",android.os.Build.MODEL).put("width",admitted.width).put("height",admitted.height).put("density",admitted.density).put("safeTop",0).put("safeBottom",0).put("safeLeft",0).put("safeRight",0));
    else if(kind.equals("cancel.v1"))reply.put("ok",true).put("data",JSONObject.NULL);
    else reply.put("ok",false).put("error",new JSONObject().put("code","UNSUPPORTED").put("message","Unsupported native service"));
    container.post(admitted.identity,generation,reply.toString().getBytes(StandardCharsets.UTF_8));
  }catch(org.json.JSONException ignored){/* Plain guest diagnostics are not requests. */}}}
  @Override public void onResume(){super.onResume();if(surface==null || closed)return;surface.onResume();surface.queueEvent(()->{try{if(container!=null)container.resume();paused=false;runOnUiThread(()->{if(!paused && !closed && !failed)Choreographer.getInstance().postFrameCallback(tick);});}catch(Throwable error){fail(error);}});}
  @Override public void onPause(){paused=true;Choreographer.getInstance().removeFrameCallback(tick);boolean ending=isFinishing();if(ending)closed=true;if(surface!=null){surface.queueEvent(()->{try{cancel();if(container!=null){presenter.finish();if(ending){container.close();container=null;presenter.close();}else container.background();}}catch(Throwable error){fail(error);}});surface.onPause();}super.onPause();}
  @Override public void onDestroy(){
    closed=true;paused=true;Choreographer.getInstance().removeFrameCallback(tick);
    if(surface!=null){surface.queueEvent(()->{try{contacts.clear();if(container!=null){presenter.finish();container.close();container=null;}if(presenter!=null)presenter.close();}catch(Throwable error){android.util.Log.e("PocketJS","Installed teardown failed",error);}});surface.onResume();surface.onPause();}
    super.onDestroy();
  }
  @Override public void onTrimMemory(int level){super.onTrimMemory(level);if(surface!=null && !closed && level>=TRIM_MEMORY_RUNNING_LOW && level!=TRIM_MEMORY_UI_HIDDEN)surface.queueEvent(()->{try{if(container!=null){presenter.finish();container.memoryWarning();}}catch(Throwable error){fail(error);}});}
}
