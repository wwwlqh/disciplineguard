//! Protect, per terminal (SPEC §9.5). Everything goes through MetaTrader's own files; nothing inside MT is clicked.
//! - The EA is copied to `MQL5\Experts\DisciplineGuard\DisciplineGuard.ex5` (the caller checked it, [`crate::release`]).
//! - The chart template `default.tpl` carries the EA, so every new chart has the panel. MT only reads it, so this
//!   works while MT is open. A fresh MT has no `default.tpl`, so Protect writes one that looks like MT's own default.
//! - With MT closed: the first chart of the last-used profile gets the EA, and `config\common.ini` turns on Algo
//!   Trading (`[Experts] Enabled=1`, `AllowLiveTrading=1`). MT rewrites both on exit, so they wait for a restart.
//!   The app never closes MetaTrader without the trader's click.
//!
//! A chart or template that already runs another EA is left alone: MT allows one EA per chart.

use crate::state::Terminal;
use crate::text::{self, Enc};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const EA_REL: &str = r"Experts\DisciplineGuard\DisciplineGuard.ex5";

fn block() -> String {
    format!("<expert>\r\nname=DisciplineGuard\r\npath={EA_REL}\r\nexpertmode=5\r\n<inputs>\r\n</inputs>\r\n</expert>\r\n")
}

fn mql5(t: &Terminal) -> PathBuf {
    t.data_dir.join("MQL5")
}

pub fn ea_path(t: &Terminal) -> PathBuf {
    mql5(t).join("Experts").join("DisciplineGuard").join("DisciplineGuard.ex5")
}

fn template_path(t: &Terminal) -> PathBuf {
    mql5(t).join("Profiles").join("Templates").join("default.tpl")
}

fn common_ini(t: &Terminal) -> PathBuf {
    t.data_dir.join("config").join("common.ini")
}

/// True when this terminal already has exactly this EA build.
pub fn ea_installed(t: &Terminal, sha256: &str) -> bool {
    fs::read(ea_path(t)).is_ok_and(|b| crate::sha256_hex(&b).eq_ignore_ascii_case(sha256))
}

/// Copies a checked EA build in. A running EA picks the new build up at the next terminal start.
pub fn install_ea(t: &Terminal, ea: &[u8]) -> io::Result<()> {
    text::write_bytes(&ea_path(t), ea)
}

/// What MT draws a new chart with when there is no `default.tpl`, which is the case on a fresh install: a new chart
/// from this template looks the same as one without it (checked against MT5 build 6230).
const BARE_TEMPLATE: &str =
    "<chart>\r\n<window>\r\nheight=100\r\n<indicator>\r\nname=Main\r\npath=\r\napply=1\r\nshow_data=1\r\n</indicator>\r\n</window>\r\n</chart>\r\n";

/// Adds the EA to (or removes it from) the chart template. Returns true when the file changed.
/// Without a `default.tpl`, adding writes the bare template with the EA, and removing deletes it again.
pub fn edit_template(t: &Terminal, add: bool) -> io::Result<bool> {
    let path = template_path(t);
    match text::read(&path) {
        Err(e) if e.kind() == io::ErrorKind::NotFound && add => {
            text::write(&path, &with_ea(BARE_TEMPLATE).expect("the bare template has a window"), Enc::Utf16Le).map(|_| true)
        }
        Ok((s, _)) if !add && without_ea(&s).as_deref() == Some(BARE_TEMPLATE) => fs::remove_file(&path).map(|_| true),
        _ => edit_chart_file(&path, add),
    }
}

/// Needs MetaTrader closed: adds the EA to the last-used profile's first free chart and turns on Algo Trading, or
/// (`add` false) removes the EA from every chart of that profile.
pub fn finish_while_closed(t: &Terminal, add: bool) -> io::Result<()> {
    let ini = common_ini(t);
    let (ini_text, enc) = text::read(&ini).unwrap_or_else(|_| (String::new(), Enc::Utf16Le));
    let profile = text::ini_get(&ini_text, "Charts", "ProfileLast").filter(|p| !p.is_empty()).unwrap_or_else(|| "Default".into());
    let dir = mql5(t).join("Profiles").join("Charts").join(sanitize(&profile));
    let mut charts: Vec<PathBuf> = fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("chr")))
        .collect();
    charts.sort();
    if add {
        let mut has_ours = false;
        for c in &charts {
            has_ours |= text::read(c).is_ok_and(|(s, _)| s.contains(EA_REL));
        }
        if !has_ours {
            for c in &charts {
                if edit_chart_file(c, true)? {
                    break;
                }
            }
        }
        let mut s = text::ini_set(&ini_text, "Experts", "Enabled", "1");
        s = text::ini_set(&s, "Experts", "AllowLiveTrading", "1");
        if s != ini_text {
            text::write(&ini, &s, enc)?;
        }
    } else {
        for c in &charts {
            edit_chart_file(c, false)?;
        }
    }
    Ok(())
}

/// Removes the EA file itself. Only after the server acknowledged protection-off.
pub fn remove_ea(t: &Terminal) -> io::Result<()> {
    match fs::remove_file(ea_path(t)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// The profile's folder name. Dots are allowed in profile names, but a name of only dots can't climb out of Charts.
fn sanitize(profile: &str) -> String {
    let s: String = profile.chars().filter(|c| !matches!(c, '\\' | '/' | ':')).collect();
    if s.trim_matches('.').is_empty() { "Default".into() } else { s }
}

fn edit_chart_file(path: &Path, add: bool) -> io::Result<bool> {
    let Ok((text, enc)) = text::read(path) else { return Ok(false) };
    let next = if add { with_ea(&text) } else { without_ea(&text) };
    match next {
        Some(n) => text::write(path, &n, enc).map(|_| true),
        None => Ok(false),
    }
}

/// The chart text with our `<expert>` block, or None when it already has an EA (ours or another).
pub fn with_ea(text: &str) -> Option<String> {
    if text.lines().any(|l| l.trim() == "<expert>") {
        return None;
    }
    let lines: Vec<&str> = text.lines().collect();
    // Inside <chart>, before its first <window>; else before the last </chart>.
    let at = lines.iter().position(|l| l.trim() == "<window>").or_else(|| lines.iter().rposition(|l| l.trim() == "</chart>"))?;
    let mut out: Vec<String> = lines[..at].iter().map(|s| s.to_string()).collect();
    out.push(block().trim_end().to_string());
    out.push(String::new());
    out.extend(lines[at..].iter().map(|s| s.to_string()));
    Some(out.join("\r\n") + "\r\n")
}

/// The chart text without our `<expert>` block, or None when it has none.
pub fn without_ea(text: &str) -> Option<String> {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.iter().enumerate().position(|(i, l)| {
        l.trim() == "<expert>" && lines[i + 1..].iter().take_while(|x| x.trim() != "</expert>").any(|x| x.contains(EA_REL))
    })?;
    let end = start + lines[start..].iter().position(|l| l.trim() == "</expert>")?;
    let mut out: Vec<&str> = lines[..start].to_vec();
    let mut rest = &lines[end + 1..];
    if rest.first().is_some_and(|l| l.trim().is_empty()) {
        rest = &rest[1..];
    }
    out.extend_from_slice(rest);
    Some(out.join("\r\n") + "\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHART: &str = "<chart>\r\nid=1\r\nsymbol=EURUSD\r\n<window>\r\nheight=100\r\n</window>\r\n</chart>\r\n";

    fn terminal() -> Terminal {
        let root = std::env::temp_dir().join(format!("dg-setup-{}", crate::random_hex(4)));
        Terminal { id: "T".into(), data_dir: root, exe: None, name: "MT5".into(), portable: true }
    }

    #[test]
    fn adds_the_ea_once_and_removes_only_ours() {
        let added = with_ea(CHART).unwrap();
        assert!(added.find("<expert>").unwrap() < added.find("<window>").unwrap());
        assert!(with_ea(&added).is_none());
        assert_eq!(without_ea(&added).unwrap(), CHART);
        let other = CHART.replace("<window>", "<expert>\r\nname=Other\r\npath=Experts\\Other.ex5\r\n</expert>\r\n<window>");
        assert!(with_ea(&other).is_none());
        assert!(without_ea(&other).is_none());
    }

    #[test]
    fn protects_a_closed_terminal_through_its_files() {
        let t = terminal();
        let charts = t.data_dir.join("MQL5").join("Profiles").join("Charts").join("Trading");
        fs::create_dir_all(&charts).unwrap();
        text::write(&charts.join("chart01.chr"), &CHART.replace("<window>", "<expert>\r\nname=Other\r\npath=Experts\\Other.ex5\r\n</expert>\r\n<window>"), Enc::Utf16Le).unwrap();
        text::write(&charts.join("chart02.chr"), CHART, Enc::Utf16Le).unwrap();
        text::write(&t.data_dir.join("MQL5").join("Profiles").join("Templates").join("default.tpl"), CHART, Enc::Utf16Le).unwrap();
        text::write(&t.data_dir.join("config").join("common.ini"), "[Charts]\r\nProfileLast=Trading\r\n[Experts]\r\nEnabled=0\r\n", Enc::Utf16Le).unwrap();

        install_ea(&t, b"ea").unwrap();
        assert!(ea_installed(&t, &crate::sha256_hex(b"ea")));
        assert!(edit_template(&t, true).unwrap());
        finish_while_closed(&t, true).unwrap();
        finish_while_closed(&t, true).unwrap();
        let read = |p: &Path| text::read(p).unwrap().0;
        assert!(!read(&charts.join("chart01.chr")).contains(EA_REL));
        assert_eq!(read(&charts.join("chart02.chr")).matches(EA_REL).count(), 1);
        let ini = read(&t.data_dir.join("config").join("common.ini"));
        assert_eq!(text::ini_get(&ini, "Experts", "Enabled").as_deref(), Some("1"));
        assert_eq!(text::ini_get(&ini, "Experts", "AllowLiveTrading").as_deref(), Some("1"));

        assert!(edit_template(&t, false).unwrap());
        finish_while_closed(&t, false).unwrap();
        remove_ea(&t).unwrap();
        assert!(!read(&charts.join("chart02.chr")).contains(EA_REL));
        assert!(!ea_path(&t).exists());
        fs::remove_dir_all(&t.data_dir).ok();
    }

    #[test]
    fn keeps_dots_in_profile_names() {
        assert_eq!(sanitize("EU.Session"), "EU.Session");
        assert_eq!(sanitize(".."), "Default");
        assert_eq!(sanitize(r"..\..\x"), "....x");
    }

    #[test]
    fn writes_a_template_when_mt_has_none_and_removes_it_again() {
        let t = terminal();
        let tpl = t.data_dir.join("MQL5").join("Profiles").join("Templates").join("default.tpl");
        assert!(edit_template(&t, true).unwrap());
        let (s, enc) = text::read(&tpl).unwrap();
        assert_eq!(enc, Enc::Utf16Le);
        assert_eq!(s.matches(EA_REL).count(), 1);
        assert!(!edit_template(&t, true).unwrap());
        assert!(edit_template(&t, false).unwrap());
        assert!(!tpl.exists());
        assert!(!edit_template(&t, false).unwrap());
        fs::remove_dir_all(&t.data_dir).ok();
    }
}
