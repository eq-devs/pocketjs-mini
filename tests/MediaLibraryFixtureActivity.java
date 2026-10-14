package dev.pjm.android;

/** Test-only provisioning of an owned file; the real host still uses the system picker. */
public final class MediaLibraryFixtureActivity extends android.app.Activity {
  private byte[] read(java.io.InputStream input)throws java.io.IOException {
    java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;
    while((count=input.read(buffer))!=-1){if(bytes.size()+count>65536)throw new java.io.IOException("Fixture exceeds bound");bytes.write(buffer,0,count);}return bytes.toByteArray();
  }
  @Override public void onCreate(android.os.Bundle state) {
    super.onCreate(state);
    android.widget.TextView receipt=new android.widget.TextView(this);
    receipt.setTextSize(18);setContentView(receipt);
    try {
      android.content.SharedPreferences prefs=getSharedPreferences("owned-media-fixture",MODE_PRIVATE);
      if(getIntent().getBooleanExtra("cleanup",false)) {
        long download=prefs.getLong("download",-1);
        String path=prefs.getString("legacyPath",null);
        if(path!=null){
          java.io.File file=new java.io.File(path),folder=android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
          if(!file.getCanonicalFile().getParentFile().equals(folder.getCanonicalFile())||!file.getName().matches("pjm-owned-[a-zA-Z0-9-]+\\.png"))throw new java.io.IOException("Invalid owned cleanup path");
          if(download>=0 && ((android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE)).remove(download)!=1)throw new java.io.IOException("Owned download deletion count differs");
          if(file.exists()&&!file.delete())throw new java.io.IOException("Owned fixture file remains");
        }
        String saved=prefs.getString("uri",null);
        if(saved!=null) {
          int deleted=getContentResolver().delete(android.net.Uri.parse(saved),null,null);
          if(deleted!=1)throw new java.io.IOException("Owned fixture deletion count: "+deleted);

        }
        if(!prefs.edit().clear().commit())throw new java.io.IOException("Fixture cleanup receipt failed");
        receipt.setText("Owned media fixture cleaned");
        return;
      }
      org.json.JSONObject config;
      try(java.io.InputStream input=getAssets().open("owned-media.json")) {
        config=new org.json.JSONObject(new String(read(input),java.nio.charset.StandardCharsets.UTF_8));
      }
      String name=config.getString("name");
      if(!name.matches("pjm-owned-[a-zA-Z0-9-]+\\.png"))throw new java.io.IOException("Invalid owned fixture name");
      byte[] image;
      try(java.io.InputStream input=getAssets().open("owned-media.png")){image=read(input);}
      String expected=config.getString("sha256");
      StringBuilder hash=new StringBuilder();
      for(byte value:java.security.MessageDigest.getInstance("SHA-256").digest(image))hash.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
      if(!hash.toString().equals(expected))throw new java.io.IOException("Fixture hash differs");
      if(android.os.Build.VERSION.SDK_INT<29){
        java.io.File folder=android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS);
        if(!folder.isDirectory()&&!folder.mkdirs())throw new java.io.IOException("No owned Downloads folder");
        java.io.File file=new java.io.File(folder,name);if(!file.createNewFile())throw new java.io.IOException("Owned fixture already exists");
        if(!prefs.edit().putString("legacyPath",file.getCanonicalPath()).commit())throw new java.io.IOException("Fixture path receipt failed");
        try(java.io.OutputStream output=new java.io.FileOutputStream(file)){output.write(image);}
        long id=((android.app.DownloadManager)getSystemService(DOWNLOAD_SERVICE)).addCompletedDownload(name,"Owned PocketJS test image",true,"image/png",file.getCanonicalPath(),image.length,true);
        if(id<0||!prefs.edit().putLong("download",id).commit())throw new java.io.IOException("Fixture download receipt failed");
        try(java.io.InputStream input=new java.io.FileInputStream(file)){if(!java.util.Arrays.equals(image,read(input)))throw new java.io.IOException("Published fixture bytes differ");}
        receipt.setText("Owned media fixture ready "+name+" bytes="+image.length+" sha256="+expected);return;
      }
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
        if(input==null||!java.util.Arrays.equals(image,read(input)))throw new java.io.IOException("Published fixture bytes differ");
      }
      receipt.setText("Owned media fixture ready "+name+" bytes="+image.length+" sha256="+expected);
    }catch(Exception failure) {
      android.util.Log.e("PocketJSFixture","Media fixture failed",failure);
      receipt.setText("Owned media fixture FAILED "+failure);
    }
  }
}
