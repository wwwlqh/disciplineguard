//! Release integrity (SPEC §10.9): every EA build the app copies into MetaTrader is checked against a release
//! manifest signed with the DisciplineGuard release key (Ed25519). The manifest and its signature ship inside the
//! app, which itself arrives through the signed updater, so a replaced EA file is never copied.
//!
//! `ea-manifest.json`: `{"ea":{"version":"0.1.0","sha256":"<hex>"}}`. `ea-manifest.sig`: the hex signature of
//! those exact bytes. Made by `scripts/sign-ea-manifest.ts`.

use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
pub struct EaBuild {
    pub version: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize)]
struct Manifest {
    ea: EaBuild,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReleaseError {
    BadKey,
    BadSignature,
    BadManifest,
    /// The EA file isn't the build the manifest names.
    WrongEa,
}

/// Checks the manifest's signature with `public_key_hex`, then the EA bytes against it.
pub fn verify_ea(manifest: &[u8], signature_hex: &str, public_key_hex: &str, ea: &[u8]) -> Result<EaBuild, ReleaseError> {
    let key: [u8; 32] = hex::decode(public_key_hex.trim()).ok().and_then(|k| k.try_into().ok()).ok_or(ReleaseError::BadKey)?;
    let key = VerifyingKey::from_bytes(&key).map_err(|_| ReleaseError::BadKey)?;
    let sig: [u8; 64] = hex::decode(signature_hex.trim()).ok().and_then(|s| s.try_into().ok()).ok_or(ReleaseError::BadSignature)?;
    key.verify_strict(manifest, &Signature::from_bytes(&sig)).map_err(|_| ReleaseError::BadSignature)?;
    let m: Manifest = serde_json::from_slice(manifest).map_err(|_| ReleaseError::BadManifest)?;
    if !crate::sha256_hex(ea).eq_ignore_ascii_case(&m.ea.sha256) {
        return Err(ReleaseError::WrongEa);
    }
    Ok(m.ea)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn signed(ea: &[u8]) -> (Vec<u8>, String, String) {
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let manifest = format!(r#"{{"ea":{{"version":"0.1.0","sha256":"{}"}}}}"#, crate::sha256_hex(ea)).into_bytes();
        let sig = hex::encode(key.sign(&manifest).to_bytes());
        (manifest, sig, hex::encode(key.verifying_key().to_bytes()))
    }

    #[test]
    fn accepts_the_signed_build_only() {
        let (m, sig, pub_hex) = signed(b"ea build");
        assert_eq!(verify_ea(&m, &sig, &pub_hex, b"ea build").unwrap().version, "0.1.0");
        assert_eq!(verify_ea(&m, &sig, &pub_hex, b"other build"), Err(ReleaseError::WrongEa));
        let mut forged = m.clone();
        forged[10] ^= 1;
        assert_eq!(verify_ea(&forged, &sig, &pub_hex, b"ea build"), Err(ReleaseError::BadSignature));
        let other = hex::encode(SigningKey::from_bytes(&[8u8; 32]).verifying_key().to_bytes());
        assert_eq!(verify_ea(&m, &sig, &other, b"ea build"), Err(ReleaseError::BadSignature));
    }
}
