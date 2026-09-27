// A release build must carry the signed EA and the release key it is checked with (SPEC §10.9):
//   ea/DisciplineGuard.ex5, ea/ea-manifest.json, ea/ea-manifest.sig (scripts/sign-ea-manifest.ts) and DG_RELEASE_PUB.
// A debug build without them runs, but can't Protect.
use std::path::Path;

fn main() {
    const EA: [&str; 3] = ["ea/DisciplineGuard.ex5", "ea/ea-manifest.json", "ea/ea-manifest.sig"];
    println!("cargo::rustc-check-cfg=cfg(dg_ea)");
    println!("cargo::rerun-if-env-changed=DG_RELEASE_PUB");
    for f in EA {
        println!("cargo::rerun-if-changed={f}");
    }
    let has_ea = EA.iter().all(|f| Path::new(f).is_file());
    if has_ea {
        println!("cargo::rustc-cfg=dg_ea");
    }
    if std::env::var("PROFILE").as_deref() == Ok("release") && (!has_ea || std::env::var("DG_RELEASE_PUB").is_err()) {
        panic!("A release build needs the signed EA in app/ea/ and DG_RELEASE_PUB. See clients/windows/README.md.");
    }
    tauri_build::build()
}
