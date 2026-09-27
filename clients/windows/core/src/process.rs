//! Running MetaTrader processes. [`close`] is only ever called after the trader pressed "Restart MetaTrader"
//! (EXPERIENCE §7.1): it asks MT to close the way its own X button does, and never kills it.

use crate::state::Terminal;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

fn same(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
}

/// True when this terminal's `terminal64.exe` is running.
pub fn is_running(t: &Terminal) -> bool {
    t.exe.as_deref().is_some_and(|exe| running_terminals().iter().any(|(_, p)| same(p, exe)))
}

/// Asks the terminal to close and waits up to `wait` for it. False if it is still open (for example, a dialog).
pub fn close(t: &Terminal, wait: Duration) -> bool {
    let Some(exe) = t.exe.as_deref() else { return true };
    let pids: Vec<u32> = running_terminals().into_iter().filter(|(_, p)| same(p, exe)).map(|(pid, _)| pid).collect();
    for pid in &pids {
        imp::request_close(*pid);
    }
    let start = Instant::now();
    while start.elapsed() < wait {
        if !is_running(t) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    !is_running(t)
}

/// Starts the terminal the way the trader normally does.
pub fn launch(t: &Terminal) -> std::io::Result<()> {
    let Some(exe) = t.exe.as_deref() else { return Ok(()) };
    let mut cmd = std::process::Command::new(exe);
    if t.portable {
        cmd.arg("/portable");
    }
    cmd.spawn().map(|_| ())
}

/// `(pid, path)` of every running `terminal64.exe`.
pub fn running_terminals() -> Vec<(u32, PathBuf)> {
    imp::running("terminal64.exe")
}

#[cfg(not(windows))]
mod imp {
    use std::path::PathBuf;
    pub fn running(_: &str) -> Vec<(u32, PathBuf)> {
        Vec::new()
    }
    pub fn request_close(_: u32) {}
}

#[cfg(windows)]
mod imp {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::path::PathBuf;
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, WM_CLOSE};

    pub fn running(name: &str) -> Vec<(u32, PathBuf)> {
        let mut out = Vec::new();
        // SAFETY: plain Win32 calls; every handle opened here is closed here.
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return out;
            }
            let mut e: PROCESSENTRY32W = std::mem::zeroed();
            e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut ok = Process32FirstW(snap, &mut e);
            while ok != 0 {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                let exe = OsString::from_wide(&e.szExeFile[..len]).to_string_lossy().into_owned();
                if exe.eq_ignore_ascii_case(name) {
                    if let Some(p) = image_path(e.th32ProcessID) {
                        out.push((e.th32ProcessID, p));
                    }
                }
                ok = Process32NextW(snap, &mut e);
            }
            CloseHandle(snap);
        }
        out
    }

    unsafe fn image_path(pid: u32) -> Option<PathBuf> {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
        CloseHandle(h);
        (ok != 0).then(|| PathBuf::from(OsString::from_wide(&buf[..len as usize])))
    }

    unsafe extern "system" fn post_close(hwnd: HWND, pid: LPARAM) -> i32 {
        let mut owner = 0u32;
        GetWindowThreadProcessId(hwnd, &mut owner);
        if owner as LPARAM == pid && IsWindowVisible(hwnd) != 0 {
            PostMessageW(hwnd, WM_CLOSE, 0, 0);
        }
        1
    }

    pub fn request_close(pid: u32) {
        // SAFETY: the callback only posts WM_CLOSE to the windows of `pid`.
        unsafe {
            EnumWindows(Some(post_close), pid as LPARAM);
        }
    }
}
