package dev.pjm.android;
import java.util.Objects;

/** Main-owner policy gate. Call again at service execution to observe OS revoke.
 * PROMPT requests a native app approval dialog; it is never authorization. */
final class PermissionGate {
  enum Status {PROMPT,GRANTED,DENIED}
  private final PackageStore store;private final Thread owner=Thread.currentThread();
  PermissionGate(PackageStore store){this.store=Objects.requireNonNull(store);}
  private void owner(){if(Thread.currentThread()!=owner)throw new IllegalStateException("Permission owner required");}
  private boolean declared(VerifiedPackage value,String permission){try{value.policy.authorizePermission(permission,true);return true;}catch(Exception denied){return false;}}
  Status check(VerifiedPackage value,String permission,boolean osGranted)throws Exception{
    owner();Objects.requireNonNull(value);
    if(!declared(value,permission))return Status.DENIED;
    Boolean approved=store.permissionDecision(value.identity,permission);
    if(approved==null)return Status.PROMPT;
    return approved&&osGranted?Status.GRANTED:Status.DENIED;
  }
  /** Only the host's native dialog callback supplies this decision. */
  Status decide(VerifiedPackage value,String permission,boolean approved,boolean osGranted)throws Exception{
    owner();Objects.requireNonNull(value);
    if(!declared(value,permission))return Status.DENIED;
    store.setPermissionDecision(value.identity,permission,approved);
    return check(value,permission,osGranted);
  }
}
