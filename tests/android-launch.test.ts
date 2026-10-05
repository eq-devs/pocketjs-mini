import {test,expect} from "bun:test";
import {requireAndroidLaunch} from "../bin/android-launch.ts";
test("Android launch rejects activity-manager errors with successful shell exits",()=>{
 expect(()=>requireAndroidLaunch("Starting: Intent {}\nStatus: ok\nActivity: dev.pjm.android/.MiniActivity\nComplete")).not.toThrow();
 expect(()=>requireAndroidLaunch("Warning: Activity not started, current task brought to front\nStatus: ok\n")).not.toThrow();
 for(const output of ["Error: Activity class does not exist.","Starting: Intent {}\nStatus: timeout\n","Exception occurred while executing 'start':"])expect(()=>requireAndroidLaunch(output)).toThrow();
});
