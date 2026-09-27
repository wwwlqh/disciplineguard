//! MT's own text files: UTF-16LE with a BOM for templates, charts and ini files, UTF-8 for the bridge.
//! Every write goes to a temp name and is renamed, so neither MT nor the EA reads half a file.

use std::fs;
use std::io;
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Enc {
    Utf16Le,
    Utf8,
}

pub fn read(path: &Path) -> io::Result<(String, Enc)> {
    let b = fs::read(path)?;
    if b.len() >= 2 && b[0] == 0xFF && b[1] == 0xFE {
        let units: Vec<u16> = b[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        return Ok((String::from_utf16_lossy(&units), Enc::Utf16Le));
    }
    let s = b.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&b);
    Ok((String::from_utf8_lossy(s).into_owned(), Enc::Utf8))
}

pub fn write(path: &Path, text: &str, enc: Enc) -> io::Result<()> {
    let bytes = match enc {
        Enc::Utf8 => text.as_bytes().to_vec(),
        Enc::Utf16Le => {
            let mut v = vec![0xFF, 0xFE];
            for u in text.encode_utf16() {
                v.extend_from_slice(&u.to_le_bytes());
            }
            v
        }
    };
    write_bytes(path, &bytes)
}

pub fn write_bytes(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

/// The value of `key` in `[section]`.
pub fn ini_get(text: &str, section: &str, key: &str) -> Option<String> {
    let mut inside = false;
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with('[') {
            inside = l.eq_ignore_ascii_case(&format!("[{section}]"));
        } else if inside {
            if let Some((k, v)) = l.split_once('=') {
                if k.trim().eq_ignore_ascii_case(key) {
                    return Some(v.trim().to_string());
                }
            }
        }
    }
    None
}

/// Sets `key=value` in `[section]`, adding the key or the section when missing. Other lines are kept as they are.
pub fn ini_set(text: &str, section: &str, key: &str, value: &str) -> String {
    let header = format!("[{section}]");
    let mut out: Vec<String> = Vec::new();
    let mut inside = false;
    let mut found_section = false;
    let mut done = false;
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with('[') {
            if inside && !done {
                out.push(format!("{key}={value}"));
                done = true;
            }
            inside = l.eq_ignore_ascii_case(&header);
            found_section |= inside;
        } else if inside && !done {
            if let Some((k, _)) = l.split_once('=') {
                if k.trim().eq_ignore_ascii_case(key) {
                    out.push(format!("{key}={value}"));
                    done = true;
                    continue;
                }
            }
        }
        out.push(line.to_string());
    }
    if !done {
        if !found_section {
            if out.last().is_some_and(|l| !l.trim().is_empty()) {
                out.push(String::new());
            }
            out.push(header);
        }
        out.push(format!("{key}={value}"));
    }
    let mut s = out.join("\r\n");
    s.push_str("\r\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ini_set_replaces_adds_and_creates() {
        let t = "[Common]\r\nLogin=1\r\n[Experts]\r\nEnabled=0\r\nAccount=0\r\n";
        let t = ini_set(t, "Experts", "Enabled", "1");
        let t = ini_set(&t, "Experts", "AllowLiveTrading", "1");
        let t = ini_set(&t, "Charts", "ProfileLast", "Default");
        assert_eq!(ini_get(&t, "Experts", "Enabled").as_deref(), Some("1"));
        assert_eq!(ini_get(&t, "Experts", "AllowLiveTrading").as_deref(), Some("1"));
        assert_eq!(ini_get(&t, "Experts", "Account").as_deref(), Some("0"));
        assert_eq!(ini_get(&t, "Common", "Login").as_deref(), Some("1"));
        assert_eq!(ini_get(&t, "Charts", "ProfileLast").as_deref(), Some("Default"));
    }

    #[test]
    fn utf16_round_trip() {
        let dir = std::env::temp_dir().join(format!("dg-text-{}", crate::random_hex(4)));
        let p = dir.join("a.tpl");
        write(&p, "<chart>\r\nsymbol=EURUSD\r\n</chart>\r\n", Enc::Utf16Le).unwrap();
        let (s, e) = read(&p).unwrap();
        assert_eq!(e, Enc::Utf16Le);
        assert!(s.contains("symbol=EURUSD"));
        fs::remove_dir_all(dir).ok();
    }
}
