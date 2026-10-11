package dev.pjm.android;

/** Test-only provisioning of an owned file; the installed host still uses the real system picker. */
public final class MediaLibraryFixtureActivity extends android.app.Activity {
  @Override public void onCreate(android.os.Bundle state) {
    super.onCreate(state);
    android.widget.TextView receipt=new android.widget.TextView(this);
    receipt.setTextSize(18);setContentView(receipt);
    try {
      android.content.SharedPreferences prefs=getSharedPreferences("owned-media-fixture",MODE_PRIVATE);
      if(getIntent().getBooleanExtra("cleanup",false)) {
        String saved=prefs.getString("uri",null);
        if(saved!=null) {
          int deleted=getContentResolver().delete(android.net.Uri.parse(saved),null,null);
          if(deleted!=1)throw new java.io.IOException("Owned fixture deletion count: "+deleted);
          if(!prefs.edit().clear().commit())throw new java.io.IOException("Fixture cleanup receipt failed");
        }
        receipt.setText("Owned media fixture cleaned");
        return;
      }
      org.json.JSONObject config;
      try(java.io.InputStream input=getAssets().open("owned-media.json")) {
        config=new org.json.JSONObject(new String(input.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8));
      }
      String name=config.getString("name");
      if(!name.matches("pjm-owned-[a-zA-Z0-9-]+\\.png"))throw new java.io.IOException("Invalid owned fixture name");
      byte[] image;
      try(java.io.InputStream input=getAssets().open("owned-media.png")){image=input.readAllBytes();}
      String expected=config.getString("sha256");
      StringBuilder hash=new StringBuilder();
      for(byte value:java.security.MessageDigest.getInstance("SHA-256").digest(image))hash.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
      if(!hash.toString().equals(expected))throw new java.io.IOException("Fixture hash differs");
      android.content.ContentValues values=new android.content.ContentValues();
      values.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME,name);
      values.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,"image/png");
      values.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,android.os.Environment.DIRECTORY_DOWNLOADS+"/");
      values.put(android.provider.MediaStore.MediaColumns.IS_PENDING,1);
      android.net.Uri uri=getContentResolver().insert(android.provider.MediaStore.Downloads.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY),values);
      if(uri==null)throw new java.io.IOException("No owned MediaStore URI");
      if(!prefs.edit().putString("uri",uri.toString()).commit())throw new java.io.IOException("Fixture ownership receipt failed");
      try(java.io.OutputStream output=getContentResolver().openOutputStream(uri,"w")) {
        if(output==null)throw new java.io.IOException("No owned fixture output");
        output.write(image);
      }
      values.clear();values.put(android.provider.MediaStore.MediaColumns.IS_PENDING,0);
      if(getContentResolver().update(uri,values,null,null)!=1)throw new java.io.IOException("Fixture publication failed");
      try(java.io.InputStream input=getContentResolver().openInputStream(uri)) {
        if(input==null||!java.util.Arrays.equals(image,input.readAllBytes()))throw new java.io.IOException("Published fixture bytes differ");
      }
      receipt.setText("Owned media fixture ready "+name+" bytes="+image.length+" sha256="+expected);
    }catch(Exception failure) {
      android.util.Log.e("PocketJSFixture","Media fixture failed",failure);
      receipt.setText("Owned media fixture FAILED "+failure);
    }
  }
}
