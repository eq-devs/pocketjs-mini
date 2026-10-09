/** Diagnostic guest uses public UI props from the exact pinned ABI-7 spec. */
export const inspectionGeometryGuest=`
captureMini.after(3,()=>{
 const api=(globalThis as any).ui;
 const box=(parent:number,label:string,x:number,y:number,w:number,h:number,color:number)=>{
  const id=api.createNode(0);
  for(const [key,value] of [[24,1],[28,x],[25,y],[1,w],[2,h],[64,color]])api.setProp(id,key,value);
  api.insertBefore(parent,id,0);
  const marker=api.createNode(1);api.setText(marker,label);api.setProp(marker,29,1);api.insertBefore(id,marker,0);return id;
 };
 const rotated=box(1,'inspection-rotated',35,50,60,35,0xff0088ff);api.setProp(rotated,131,30);
 const clip=box(1,'inspection-clip-parent',35,125,100,80,0xff334155);api.setProp(clip,30,1);
 const clipped=box(clip,'inspection-clipped',70,20,80,40,0xff44aa44);api.setProp(clipped,131,20);
 const camera=box(1,'inspection-camera',210,70,80,80,0);api.setProp(camera,139,200);
 const projected=box(camera,'inspection-projected',30,30,20,20,0xffaa44aa);api.setProp(projected,138,100);api.setProp(projected,137,25);
});
`;
