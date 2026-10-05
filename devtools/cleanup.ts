/** Attempt every owned cleanup, preserving the first failure for the caller. */
export function closeReplayResources(actions:readonly (()=>void)[]):void {
 let failed=false,first:unknown;
 for(const action of actions){try{action();}catch(error){if(!failed){failed=true;first=error;}}}
 if(failed)throw first;
}

/** Preserve the replay failure when cleanup also fails, retaining both errors. */
export function withReplayCleanup<T>(run:()=>T,close:()=>void):T {
 let failed=false,primary:unknown;
 try{return run();}catch(error){failed=true;primary=error;throw error;}
 finally{try{close();}catch(error){
  if(!failed)throw error;
  throw new AggregateError([primary,error],primary instanceof Error?primary.message:'Replay failed',{cause:primary});
 }}
}
