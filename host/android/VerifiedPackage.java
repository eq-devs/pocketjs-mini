package dev.pjm.android;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.GeneralSecurityException;
/** Authenticate the complete payload before native structural selection. */
final class VerifiedPackage {
  static {System.loadLibrary("pocketjs");}
  private static native byte[][] selectPackage(byte[] payload,byte[] identity);
  private final byte[] javascript,pak;
  final String identity,version;
  final int width,height,density;
  final PackageVerifier.Policy policy;
  private static void require(boolean valid,String reason)throws Exception{if(!valid)throw new GeneralSecurityException(reason);}
  private static int integer(Object value,int maximum)throws Exception{require(value instanceof Number,"Plan integer required");double number=((Number)value).doubleValue();require(number>=1 && number<=maximum && Math.floor(number)==number,"Plan integer out of range");return (int)number;}
  private static boolean bool(JSONObject object,String key,boolean expected)throws Exception{Object value=object.get(key);return value instanceof Boolean && ((Boolean)value)==expected;}
  VerifiedPackage(byte[] payload,byte[] envelope,byte[] key)throws Exception{
    require(payload!=null && payload.length>0 && payload.length<=64*1024*1024 && envelope!=null && envelope.length<=65536 && key!=null && key.length==32,"Package inputs outside bounds");
    byte[] source=payload.clone(),manifestBytes=envelope.clone(),trusted=key.clone();
    JSONObject metadata=PackageVerifier.verify(source,manifestBytes,trusted,7,"pjm-android");
    identity=metadata.getString("appId");version=metadata.getString("version");policy=PackageVerifier.verifyPolicy(source,manifestBytes,trusted,7,"pjm-android");
    byte[][] parts=selectPackage(source,identity.getBytes(StandardCharsets.UTF_8));require(parts!=null && parts.length==3,"Native package selection rejected");
    JSONObject plan=new JSONObject(StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(parts[2])).toString());String expected=plan.getString("planHash");plan.remove("planHash");
    byte[] hash=MessageDigest.getInstance("SHA-256").digest(PackageVerifier.canonical(plan).getBytes(StandardCharsets.UTF_8));StringBuilder digest=new StringBuilder("sha256:");for(byte value:hash)digest.append(String.format(java.util.Locale.ROOT,"%02x",value&255));require(expected.equals(digest.toString()),"Build plan hash mismatch");
    JSONObject app=plan.getJSONObject("app"),target=plan.getJSONObject("target"),viewport=plan.getJSONObject("viewport");
    require(identity.equals(app.getString("id")) && version.equals(app.getString("version")) && "pjm-android".equals(target.getString("id")) && integer(target.get("hostAbi"),7)==7,"Plan package identity or target mismatch");
    JSONArray logical=viewport.getJSONArray("logical"),physical=viewport.getJSONArray("physical");require(logical.length()==2 && physical.length()==2,"Invalid plan viewport");
    width=integer(logical.get(0),1024);height=integer(logical.get(1),1024);density=integer(viewport.get("rasterDensity"),4);
    require(integer(physical.get(0),4096)==width*density && integer(physical.get(1),4096)==height*density && (long)width*height*density*density*4<=16*1024*1024,"Invalid physical viewport");
    require("native".equals(viewport.getString("presentation")) && "fixed".equals(viewport.getString("policy")) && plan.getJSONArray("companions").length()==0,"Unsupported plan presentation");
    JSONObject features=plan.getJSONObject("features");java.util.Iterator<String> names=features.keys();while(names.hasNext()){String name=names.next();Object enabled=features.get(name);require(enabled instanceof Boolean && (!(Boolean)enabled || name.equals("input.touch") || name.equals("text.glyphs.baked")),"Unsupported plan feature");}
    JSONObject modality=plan.getJSONObject("modality");JSONArray screens=modality.getJSONArray("screens");require(screens.length()==1,"Unsupported plan screens");JSONObject screen=screens.getJSONObject(0);JSONArray size=screen.getJSONArray("logical");
    require("takeover".equals(modality.getString("form")) && "primary".equals(modality.getString("touch")) && "none".equals(modality.getString("pointer")) && bool(modality,"buttons",false) && modality.get("analog") instanceof Number && ((Number)modality.get("analog")).doubleValue()==0,"Unsupported plan input modality");
    require("primary".equals(screen.getString("role")) && size.length()==2 && integer(size.get(0),1024)==width && integer(size.get(1),1024)==height && bool(screen,"touch",true) && bool(screen,"resizable",false) && ("portrait".equals(screen.getString("orientation")) || "landscape".equals(screen.getString("orientation"))),"Unsupported primary screen");
    javascript=parts[0];pak=parts[1];
  }
  byte[] javascript(){return javascript.clone();}
  byte[] pak(){return pak.clone();}
}
