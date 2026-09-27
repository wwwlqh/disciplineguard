//! Finds the MT5 terminals on this computer (SPEC §9.5):
//! - installed ones from `%APPDATA%\MetaQuotes\Terminal\<id>\origin.txt`, which names the install folder;
//! - portable ones from running `terminal64.exe` processes whose own folder holds `MQL5`;
//! - a folder the trader picked with Browse.

use crate::state::Terminal;
use crate::text;
use std::fs;
use std::path::{Path, PathBuf};

/// The EA's terminal id for a data folder: its name, keeping only `0-9 A-Z a-z - _` (DGTerminalId in Bridge.mqh).
pub fn terminal_id(data_dir: &Path) -> String {
    let name = data_dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect()
}

fn is_mt5_data(dir: &Path) -> bool {
    dir.join("MQL5").is_dir()
}

fn name_for(install: &Path) -> String {
    let s = install.to_string_lossy();
    let last = s.trim_end_matches(['\\', '/']).rsplit(['\\', '/']).next().unwrap_or("").trim();
    if last.is_empty() { "MetaTrader 5".into() } else { last.into() }
}

fn same_dir(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase();
    norm(a) == norm(b)
}

/// All MT5 terminals: `terminals_root` is `%APPDATA%\MetaQuotes\Terminal`, `running` the paths of running
/// `terminal64.exe` processes. Sorted by name; each id appears once.
pub fn discover(terminals_root: &Path, running: &[PathBuf]) -> Vec<Terminal> {
    let mut found: Vec<Terminal> = Vec::new();
    for entry in fs::read_dir(terminals_root).into_iter().flatten().flatten() {
        let data_dir = entry.path();
        if !is_mt5_data(&data_dir) {
            continue;
        }
        let Ok((origin, _)) = text::read(&data_dir.join("origin.txt")) else { continue };
        let install = PathBuf::from(origin.trim().trim_start_matches('\u{feff}'));
        let exe = install.join("terminal64.exe");
        found.push(Terminal {
            id: terminal_id(&data_dir),
            name: name_for(&install),
            exe: Some(exe),
            data_dir,
            portable: false,
        });
    }
    for exe in running {
        let Some(install) = exe.parent() else { continue };
        let installed = found.iter().any(|t| t.exe.as_deref().and_then(Path::parent).is_some_and(|i| same_dir(i, install)));
        if !installed {
            if let Some(t) = from_folder(install) {
                found.push(t);
            }
        }
    }
    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()).then(a.id.cmp(&b.id)));
    found.dedup_by(|a, b| a.id == b.id);
    found
}

/// A folder the trader picked with Browse: a portable terminal (its own `MQL5`), or an install folder whose data
/// folder is found through `origin.txt` under `terminals_root`.
pub fn from_browse(folder: &Path, terminals_root: &Path) -> Option<Terminal> {
    if let Some(t) = from_folder(folder) {
        return Some(t);
    }
    discover(terminals_root, &[]).into_iter().find(|t| t.exe.as_deref().and_then(Path::parent).is_some_and(|i| same_dir(i, folder)))
}

fn from_folder(folder: &Path) -> Option<Terminal> {
    let exe = folder.join("terminal64.exe");
    (exe.is_file() && is_mt5_data(folder)).then(|| Terminal {
        id: terminal_id(folder),
        name: name_for(folder),
        exe: Some(exe),
        data_dir: folder.to_path_buf(),
        portable: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::text::{write, Enc};

    #[test]
    fn finds_installed_and_portable_terminals() {
        let root = std::env::temp_dir().join(format!("dg-term-{}", crate::random_hex(4)));
        let appdata = root.join("Terminal");
        let data = appdata.join("D0E8209F77C8CF37AD8BF550E51FF075");
        fs::create_dir_all(data.join("MQL5")).unwrap();
        write(&data.join("origin.txt"), "C:\\Program Files\\IC Markets MetaTrader 5", Enc::Utf16Le).unwrap();
        fs::create_dir_all(appdata.join("Common").join("Files")).unwrap();
        let portable = root.join("dg-mt5-portable");
        fs::create_dir_all(portable.join("MQL5")).unwrap();
        fs::write(portable.join("terminal64.exe"), b"").unwrap();

        let found = discover(&appdata, &[portable.join("terminal64.exe"), PathBuf::from("C:\\Program Files\\IC Markets MetaTrader 5\\terminal64.exe")]);
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].id, "dg-mt5-portable");
        assert!(found[0].portable);
        assert_eq!(found[1].id, "D0E8209F77C8CF37AD8BF550E51FF075");
        assert_eq!(found[1].name, "IC Markets MetaTrader 5");
        assert!(!found[1].portable);
        assert_eq!(from_browse(&portable, &appdata).unwrap().id, "dg-mt5-portable");
        fs::remove_dir_all(root).ok();
    }
}
