use std::{path::PathBuf, process::Command};
fn main() {
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../examples/hello/.pjm/pocketjs");
    let git = |args: &[&str]| {
        Command::new("git")
            .arg("-C")
            .arg(&root)
            .args(args)
            .output()
            .expect("Pinned PocketJS checkout is required")
    };
    let revision = git(&["rev-parse", "HEAD"]);
    assert!(
        revision.status.success()
            && String::from_utf8_lossy(&revision.stdout).trim()
                == "fe971ebb8e14724d2a98d4df6b34c065caf11132",
        "Unexpected PocketJS revision"
    );
    assert!(
        git(&["diff", "--quiet", "HEAD", "--"]).status.success(),
        "Tracked PocketJS source differs from the pin"
    );
    for file in String::from_utf8_lossy(&git(&["ls-files"]).stdout).lines() {
        println!("cargo:rerun-if-changed={}", root.join(file).display());
    }
    let head = git(&["rev-parse", "--git-path", "HEAD"]);
    let head = String::from_utf8(head.stdout).unwrap();
    println!(
        "cargo:rerun-if-changed={}",
        root.join(head.trim()).display()
    );
}
