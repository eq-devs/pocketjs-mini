/** Actual SDK command after an acknowledged storage clear; no native test hook. */
export function developmentExitSource(source:string){return source+`
mini.onLifecycle("unload",()=>{mini.storage.set("dev-exit-proof","saved").promise.catch(()=>{});});
mini.storage.remove("dev-exit-proof").promise.then(()=>mini.after(60,()=>{
 mini.request("app.exit.v1",{unexpected:true}).promise.then(()=>{throw Error("INVALID_EXIT_ACCEPTED");},error=>{
  if(error.code!=="PROTOCOL")throw error;mini.app.exit();mini.app.exit();
 });
}));
`;}
