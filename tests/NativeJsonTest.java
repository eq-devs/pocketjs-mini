package dev.pjm.android;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
final class NativeJsonTest {
  private static void rejected(byte[] bytes,int budget)throws Exception{
    try{BoundedJson.object(bytes,budget);throw new AssertionError("Invalid JSON accepted");}catch(JSONException expected){}
  }
  static void verify()throws Exception{
    if(!BoundedJson.object(" {\"emoji\":\"😀\",\"number\":-2.5e+2,\"array\":[true,false,null]} \n".getBytes(StandardCharsets.UTF_8),4096).getString("emoji").equals("😀"))throw new AssertionError("Unicode lost");
    for(String value:new String[]{"[]","null","{x:1}","{'x':1}","{\"x\":1,}","{\"x\":[1,]}","{\"x\":01}","{\"x\":+1}","{\"x\":.1}","{\"x\":1.}","{\"x\":1e}","{\"x\":1e999}","{\"x\":NaN}","{\"x\":1;\"y\":2}","{/*comment*/\"x\":1}","{} trailing","{\"x\":1,\"x\":2}","{\"x\":1,\"\\u0078\":2}","{\"x\":\"\\ud800\"}","{\"x\":\"\\udc00\"}","{\"x\":\"raw\ncontrol\"}","{\"x\":\"\\q\"}"})rejected(value.getBytes(StandardCharsets.UTF_8),4096);
    rejected(new byte[]{'{','"','x','"',':','"',(byte)0xc3,0x28,'"','}'},4096);
    rejected("{}".getBytes(StandardCharsets.UTF_8),1);
    StringBuilder valid=new StringBuilder("{\"x\":");for(int i=0;i<31;i++)valid.append('[');valid.append('0');for(int i=0;i<31;i++)valid.append(']');valid.append('}');BoundedJson.object(valid.toString().getBytes(StandardCharsets.UTF_8),4096);
    String deep=valid.toString().replace("0","[[0]]");rejected(deep.getBytes(StandardCharsets.UTF_8),4096);
    String zeros=new String(new char[129]).replace('\0','0');rejected(("{\"n\":1."+zeros+"}").getBytes(StandardCharsets.UTF_8),4096);
    BoundedJson.object(("{\"n\":1."+zeros.substring(0,126)+"}").getBytes(StandardCharsets.UTF_8),4096);
    StringBuilder wide=new StringBuilder("{\"x\":[");for(int i=0;i<262144;i++){if(i>0)wide.append(',');wide.append('0');}wide.append("]}");rejected(wide.toString().getBytes(StandardCharsets.UTF_8),1048576);
    System.out.println("Android bounded JSON: strict syntax, decoded duplicate keys, Unicode, depth and token budgets passed");
  }
}
