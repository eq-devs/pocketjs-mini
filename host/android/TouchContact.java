package dev.pjm.android;

/** Owner-thread contact retained through its final frame sample. */
final class TouchContact {
  int pointer,identifier,x,y,hit;
  boolean reported,ended;
  private int startX,startY;
  private boolean positioned,finalReported;
  int sampleX(){return reported?x:startX;}
  int sampleY(){return reported?y:startY;}
  void sampled(){finalReported=reported&&ended;reported=true;}
  boolean drained(){return ended&&finalReported;}
  void update(int nextX,int nextY,boolean ending){
    // Android can reuse the pointer ID before the renderer drains this contact.
    if(ended)return;
    if(!positioned){startX=nextX;startY=nextY;positioned=true;}
    x=nextX;y=nextY;ended=ending;
  }
}
