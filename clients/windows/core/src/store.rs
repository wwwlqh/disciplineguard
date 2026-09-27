//! Saves [`AppState`] in `%APPDATA%\DisciplineGuard\state.dat`. On Windows the file is encrypted with DPAPI for
//! the current Windows user, so the tokens in it can't be read from a copy of the file on another account or computer.

use crate::state::AppState;
use crate::text;
use std::io;
use std::path::PathBuf;

pub struct Store {
    pub path: PathBuf,
}

impl Store {
    pub fn new(path: PathBuf) -> Self {
        Store { path }
    }

    /// The saved state, or a fresh one when there is none or it can't be read (for example, copied from another user).
    pub fn load(&self) -> AppState {
        std::fs::read(&self.path)
            .ok()
            .and_then(|b| unprotect(&b))
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, s: &AppState) -> io::Result<()> {
        let json = serde_json::to_vec(s).map_err(io::Error::other)?;
        text::write_bytes(&self.path, &protect(&json)?)
    }
}

#[cfg(windows)]
fn protect(data: &[u8]) -> io::Result<Vec<u8>> {
    dpapi::call(data, true).ok_or_else(|| io::Error::other("CryptProtectData failed"))
}

#[cfg(windows)]
fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
    dpapi::call(data, false)
}

// Development on other systems only: the file is plain JSON.
#[cfg(not(windows))]
fn protect(data: &[u8]) -> io::Result<Vec<u8>> {
    Ok(data.to_vec())
}

#[cfg(not(windows))]
fn unprotect(data: &[u8]) -> Option<Vec<u8>> {
    Some(data.to_vec())
}

#[cfg(windows)]
mod dpapi {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    pub fn call(data: &[u8], encrypt: bool) -> Option<Vec<u8>> {
        let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
        let mut out = CRYPT_INTEGER_BLOB { cbData: 0, pbData: std::ptr::null_mut() };
        // SAFETY: input points at `data` for the call; out is allocated by Windows and freed below.
        let ok = unsafe {
            if encrypt {
                CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            } else {
                CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            }
        };
        if ok == 0 || out.pbData.is_null() {
            return None;
        }
        // SAFETY: Windows returned cbData bytes at pbData.
        let v = unsafe { std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec() };
        unsafe { LocalFree(out.pbData as _) };
        Some(v)
    }
}
