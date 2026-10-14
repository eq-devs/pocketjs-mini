package dev.pjm.android;
import java.io.*;
import org.json.*;
/** Test-only observation and explicit host rollback; native rendering is inherited. */
public final class UpdateSurfaceActivity extends InstalledActivity {
 private final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
 private AppStorage proofStorage;
 private VerifiedPackage running()throws Exception {java.lang.reflect.Field field=InstalledActivity.class.getDeclaredField("admitted");field.setAccessible(true);return (VerifiedPackage)field.get(this);}
 private boolean failed()throws Exception {java.lang.reflect.Field field=InstalledActivity.class.getDeclaredField("failed");field.setAccessible(true);return field.getBoolean(this);}
 private String slot(Object value){return value instanceof String?((String)value).split("-")[0]:"none";}
 private final Runnable observation=new Runnable(){public void run(){try{
  if(failed()){getWindow().getDecorView().setContentDescription("native-installed-failure");return;}
  VerifiedPackage bound=running();Object value=proofStorage.dispatch("storage.get.v1",new JSONObject().put("key","update-proof"));
  byte[] bytes=PackageFiles.read(PackageFiles.path(new File(new File(new File(getFilesDir().getCanonicalFile(),"mini-packages"),bound.identity),"state.json")),2048,false);JSONObject state=BoundedJson.object(bytes,2048);
  if(value instanceof JSONObject){JSONObject proof=(JSONObject)value;getWindow().getDecorView().setContentDescription("running="+bound.version+" guest="+proof.getString("version")+" count="+proof.getInt("count")+" current="+slot(state.opt("current"))+" pending="+slot(state.opt("pending")));}
 }catch(Exception waiting){}handler.postDelayed(this,100);}};
 @Override public void onCreate(android.os.Bundle state){
  try{proofStorage=new AppStorage(getFilesDir(),"dev.pjm.update-proof");proofStorage.dispatch("storage.remove.v1",new JSONObject().put("key","update-proof"));}catch(Exception error){throw new IllegalStateException(error);}
  super.onCreate(state);android.widget.Button rollback=new android.widget.Button(this);rollback.setText("Rollback update");rollback.setContentDescription("update-rollback");
  android.widget.FrameLayout.LayoutParams placement=new android.widget.FrameLayout.LayoutParams(480,132,android.view.Gravity.TOP|android.view.Gravity.LEFT);placement.topMargin=80;
  ((android.widget.FrameLayout)findViewById(android.R.id.content)).addView(rollback,placement);
  rollback.setOnClickListener(view->{byte[] before;try{before=cacheState();}catch(Exception error){throw new IllegalStateException(error);}try{byte[][] keys=publisherKeys(publisherKey("publisher.key"));new PackageStore(new File(getFilesDir().getCanonicalFile(),"mini-packages"),keys).rollback(running().identity);}catch(Exception error){try{if(!java.util.Arrays.equals(before,cacheState()))throw new IllegalStateException("Rejected rollback mutated state");rollback.setContentDescription("update-rollback-rejected-state-unchanged");}catch(Exception changed){throw new IllegalStateException(changed);}}});
  handler.post(observation);
 }
 private byte[] cacheState()throws Exception{return PackageFiles.read(PackageFiles.path(new File(new File(new File(getFilesDir().getCanonicalFile(),"mini-packages"),running().identity),"state.json")),2048,false);}
 private byte[] publisherKey(String name)throws IOException{try(InputStream stream=getAssets().open(name);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[33];int count;while((count=stream.read(buffer))!=-1){if(bytes.size()+count>32)throw new IOException("Key exceeds bound");bytes.write(buffer,0,count);}if(bytes.size()!=32)throw new IOException("Invalid key");return bytes.toByteArray();}}
 @Override public void onDestroy(){handler.removeCallbacks(observation);super.onDestroy();}
}
