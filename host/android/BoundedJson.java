package dev.pjm.android;
import org.json.JSONObject;
import org.json.JSONException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import java.util.HashSet;
/** Strict bounded syntax gate before Android's permissive JSON parser. */
final class BoundedJson {
  private final String text;private int offset,tokens;
  private BoundedJson(String text){this.text=text;}
  static JSONObject object(byte[] bytes,int maximum)throws JSONException{
    if(bytes==null || bytes.length>maximum)throw new JSONException("JSON byte budget exceeded");
    String text;try{text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}catch(Exception error){throw new JSONException("Invalid JSON UTF-8");}
    BoundedJson parser=new BoundedJson(text);parser.space();if(parser.peek()!='{')throw new JSONException("JSON object required");parser.value(0);parser.space();if(parser.offset!=text.length())throw new JSONException("Trailing JSON input");return new JSONObject(text);
  }
  private JSONException invalid(){return new JSONException("Invalid or over-budget JSON");}
  private char peek(){return offset<text.length()?text.charAt(offset):0;}
  private void space(){while(offset<text.length()){char c=peek();if(c!=' ' && c!='\t' && c!='\r' && c!='\n')break;offset++;}}
  private void expect(char c)throws JSONException{if(peek()!=c)throw invalid();offset++;}
  private String string()throws JSONException{
    expect('"');StringBuilder decoded=new StringBuilder();boolean closed=false;
    while(offset<text.length()){
      char c=text.charAt(offset++);if(c=='"'){closed=true;break;}if(c<32)throw invalid();
      if(c=='\\'){
        if(offset>=text.length())throw invalid();c=text.charAt(offset++);
        switch(c){case '"':case '\\':case '/':break;case 'b':c='\b';break;case 'f':c='\f';break;case 'n':c='\n';break;case 'r':c='\r';break;case 't':c='\t';break;
          case 'u':int code=0;for(int i=0;i<4;i++){if(offset>=text.length())throw invalid();char digit=text.charAt(offset++);int number=digit>='0' && digit<='9'?digit-'0':digit>='a' && digit<='f'?digit-'a'+10:digit>='A' && digit<='F'?digit-'A'+10:-1;if(number<0)throw invalid();code=(code<<4)|number;}c=(char)code;break;
          default:throw invalid();
        }
      }decoded.append(c);
    }
    if(!closed)throw invalid();
    for(int i=0;i<decoded.length();i++){char c=decoded.charAt(i);if(Character.isHighSurrogate(c)){if(++i>=decoded.length() || !Character.isLowSurrogate(decoded.charAt(i)))throw invalid();}else if(Character.isLowSurrogate(c))throw invalid();}
    return decoded.toString();
  }
  private void value(int depth)throws JSONException{
    if(depth>32 || ++tokens>262144)throw invalid();space();char c=peek();
    if(c=='{'){
      offset++;space();HashSet<String> names=new HashSet<>();if(peek()=='}'){offset++;return;}
      while(true){if(++tokens>262144)throw invalid();String name=string();if(!names.add(name))throw new JSONException("Duplicate JSON key");space();expect(':');value(depth+1);space();if(peek()=='}'){offset++;return;}expect(',');space();}
    }else if(c=='['){
      offset++;space();if(peek()==']'){offset++;return;}while(true){value(depth+1);space();if(peek()==']'){offset++;return;}expect(',');space();}
    }else if(c=='"'){string();}
    else if(c=='t'){literal("true");}else if(c=='f'){literal("false");}else if(c=='n'){literal("null");}
    else number();
  }
  private void literal(String expected)throws JSONException{if(!text.startsWith(expected,offset))throw invalid();offset+=expected.length();}
  private boolean digit(){return peek()>='0' && peek()<='9';}
  private void number()throws JSONException{
    int start=offset;if(peek()=='-')offset++;if(peek()=='0')offset++;else{if(peek()<'1' || peek()>'9')throw invalid();while(digit())offset++;}
    if(peek()=='.'){offset++;if(!digit())throw invalid();while(digit())offset++;}
    if(peek()=='e' || peek()=='E'){offset++;if(peek()=='+' || peek()=='-')offset++;if(!digit())throw invalid();while(digit())offset++;}
    if(offset-start>128)throw invalid();
    try{double number=Double.parseDouble(text.substring(start,offset));if(Double.isInfinite(number) || Double.isNaN(number))throw invalid();}catch(NumberFormatException error){throw invalid();}
  }
}
