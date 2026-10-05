import {lstatSync,readFileSync} from "node:fs";
import {join} from "node:path";

export function sessionPanel(project: string): string {
  const path=join(project,"build/session.json"),stat=lstatSync(path);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>4096)throw Error("Invalid development session file");
  const session=JSON.parse(readFileSync(path,"utf8"));
  if(!Number.isSafeInteger(session.pid) || session.pid<1 || typeof session.url!=="string")throw Error("Invalid development session");
  process.kill(session.pid,0);
  const url=new URL(session.url);
  if(url.protocol!=="http:" || url.username || url.password || url.search || url.hash || !/^\/[a-f0-9]{48}\/$/.test(url.pathname))throw Error("Invalid development session URL");
  return new URL("devtools",url).href;
}
if(import.meta.main){
  try {
    const args=Bun.argv.slice(2);if(args.length && (args.length!==1 || args[0]!=="--no-open"))throw Error("usage: pjm devtools [--no-open]");
    const url=sessionPanel(process.cwd());console.log(url);
    if(!args.length){const command=process.platform==="darwin"?"open":process.platform==="win32"?"explorer":"xdg-open";const child=Bun.spawn([command,url],{stdout:"ignore",stderr:"inherit"});if(await child.exited)throw Error("Unable to open panel; use the printed URL");}
  }catch(error){console.error(`pjm devtools: ${error instanceof Error?error.message:String(error)}. Start pjm run first.`);process.exitCode=1;}
}
