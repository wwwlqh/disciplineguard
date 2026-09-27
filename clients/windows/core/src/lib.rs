//! DisciplineGuard for Windows, everything except the window and the tray (SPEC §9.5).
//!
//! - [`signin`]: "Allow" in the browser, then a PKCE code on a loopback address.
//! - [`terminals`]: finds MT5 terminals, installed and portable.
//! - [`setup`]: Protect. Copies the EA, attaches it and turns on Algo Trading through MT's own files.
//! - [`bridge`]: the EA ↔ app files in Common Files. The EA never touches the network.
//! - [`release`]: the signed manifest every EA build is checked against before it is copied.
//! - [`store`]: the app's state, protected by Windows (DPAPI).

pub mod api;
pub mod bridge;
pub mod process;
pub mod release;
pub mod setup;
pub mod signin;
pub mod state;
pub mod store;
pub mod terminals;
pub mod text;

/// Random bytes as lowercase hex.
pub fn random_hex(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    getrandom::fill(&mut b).expect("the OS random source is available");
    hex::encode(b)
}

/// SHA-256 as lowercase hex.
pub fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(data))
}

/// Seconds since 1970.
pub fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}
