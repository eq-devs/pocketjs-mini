/** Android activity-manager may report launch errors despite a zero shell exit. */
export function requireAndroidLaunch(output:string):void {
 const failure=output.split(/\r?\n/).find(line=>/^\s*(Error:|Exception|Status:\s*(?!ok\s*$)\S)/.test(line));
 if(failure)throw Error("Android activity launch failed: "+failure.trim().slice(0,512));
}
