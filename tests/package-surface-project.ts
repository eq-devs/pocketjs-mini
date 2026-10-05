import {readFileSync,writeFileSync,cpSync} from "node:fs";
import {join} from "node:path";
import {writeInstalledAndroidProject} from "../bin/installed-android-project.ts";

// Native surface fixtures use the production exporter and its complete dependency closure.
const [root,bundle,activity,extra]=process.argv.slice(2);
if(!root||!bundle||!/^dev\.pjm\.android\.(InstalledActivity|HttpSurfaceActivity)$/.test(activity))throw new Error("Invalid surface project fixture");
const directory=join(root,"project");
writeInstalledAndroidProject({directory,bundle,library:join(root,"libpocketjs.so"),payload:join(root,"assets/main.pocket"),envelope:join(root,"assets/manifest.json"),publicKey:join(root,"assets/publisher.key")});
if(activity.endsWith("HttpSurfaceActivity")){
  cpSync(join(import.meta.dir,"HttpSurfaceActivity.java"),join(directory,"src/HttpSurfaceActivity.java"));
  const path=join(directory,"AndroidManifest.xml"),manifest=readFileSync(path,"utf8");
  writeFileSync(path,manifest.replace('android:name="dev.pjm.android.InstalledActivity"','android:name="'+activity+'"'));
}
if(extra)throw new Error("Unexpected surface fixture argument");
