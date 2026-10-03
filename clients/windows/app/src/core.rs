//! What the window and the tray ask for: the app state, Protect, Restart and uninstall (SPEC §9.5, EXPERIENCE §7.1).

use dg_core::api::{Alert, Alerts, Api};
use dg_core::bridge::Bridge;
use dg_core::release;
use dg_core::setup;
use dg_core::signin::{self, Allow, SignInError};
use dg_core::state::{AppState, Terminal};
use dg_core::store::Store;
use dg_core::{process, terminals};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// The EA build this app ships, its signed manifest, and the release key it is checked with (SPEC §10.9).
#[cfg(dg_ea)]
const EA: Option<(&[u8], &[u8], &str)> = Some((
    include_bytes!("../ea/DisciplineGuard.ex5"),
    include_bytes!("../ea/ea-manifest.json"),
    include_str!("../ea/ea-manifest.sig"),
));
#[cfg(not(dg_ea))]
const EA: Option<(&[u8], &[u8], &str)> = None;
const RELEASE_PUB: Option<&str> = option_env!("DG_RELEASE_PUB");

fn running() -> Vec<PathBuf> {
    process::running_terminals().into_iter().map(|(_, p)| p).collect()
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().eq_ignore_ascii_case(&b.to_string_lossy())
}

/// Whether `t` is among `running` (one process snapshot, shared by a whole pass).
fn is_running(t: &Terminal, running: &[PathBuf]) -> bool {
    t.exe.as_deref().is_some_and(|e| running.iter().any(|p| same_path(p, e)))
}

pub struct Paths {
    /// `%APPDATA%\MetaQuotes\Terminal`.
    pub terminals_root: PathBuf,
    /// `%APPDATA%\DisciplineGuard\state.dat`.
    pub state_file: PathBuf,
}

impl Paths {
    pub fn from_env() -> Paths {
        let appdata = PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default());
        Paths {
            terminals_root: appdata.join("MetaQuotes").join("Terminal"),
            state_file: appdata.join("DisciplineGuard").join("state.dat"),
        }
    }
}

pub struct Core {
    pub state: Mutex<AppState>,
    pub store: Store,
    pub bridge: Bridge,
    pub api: Api,
    /// The web app, e.g. https://disciplineguard.com.
    pub web: String,
    pub terminals_root: PathBuf,
    /// Terminals picked with Browse that discovery can't see on its own.
    browsed: Mutex<Vec<Terminal>>,
    /// The checked EA build, checked once: it ships inside the app and doesn't change while it runs.
    ea: OnceLock<Option<(&'static [u8], String)>>,
}

/// How one terminal is doing, in the status words of EXPERIENCE §8.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    // Ordered from least to most urgent: the tray shows the most urgent one.
    Off,
    NotRunning,
    On,
    SettingUp,
    NeedsAttention,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub id: String,
    pub name: String,
    pub folder: String,
    pub protected: bool,
    pub dismissed: bool,
    pub installed: bool,
    pub algo_on: Option<bool>,
    pub connected: bool,
    pub restart_needed: bool,
    pub status: Status,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub signed_in: bool,
    pub email: Option<String>,
    pub rows: Vec<Row>,
    /// This build can Protect (it carries a signed EA).
    pub can_protect: bool,
}

impl Core {
    pub fn new(paths: Paths, api_url: &str, web: &str) -> Core {
        let store = Store::new(paths.state_file);
        let state = store.load();
        let common = paths.terminals_root.join("Common").join("Files");
        Core {
            state: Mutex::new(state),
            store,
            bridge: Bridge::new(&common, Api::new(api_url)),
            api: Api::new(api_url),
            web: web.trim_end_matches('/').to_string(),
            terminals_root: paths.terminals_root,
            browsed: Mutex::new(Vec::new()),
            ea: OnceLock::new(),
        }
    }

    /// New alerts to show as Windows notifications (SPEC §11.1). Empty when signed out or offline.
    pub fn poll_alerts(&self) -> Vec<Alert> {
        let (token, after) = {
            let s = self.state.lock().unwrap();
            (s.app_token.clone(), s.alerts_after)
        };
        let Some(token) = token else { return Vec::new() };
        let Ok(Alerts::New { alerts, cursor }) = self.api.alerts(&token, after) else { return Vec::new() };
        let mut s = self.state.lock().unwrap();
        // A sign-in as someone else meanwhile starts its own cursor.
        if s.app_token.as_deref() != Some(token.as_str()) {
            return Vec::new();
        }
        if s.alerts_after != Some(cursor) {
            s.alerts_after = Some(cursor);
            self.save(&s);
        }
        alerts
    }

    pub fn save(&self, s: &AppState) {
        let _ = self.store.save(s);
    }

    /// The EA build, checked against the signed release manifest. None when this build has none or it fails.
    fn ea(&self) -> Option<(&'static [u8], String)> {
        self.ea
            .get_or_init(|| {
                let (ex5, manifest, sig) = EA?;
                let build = release::verify_ea(manifest, sig, RELEASE_PUB?, ex5).ok()?;
                Some((ex5, build.sha256))
            })
            .clone()
    }

    /// Every MT5 terminal on this computer: found ones, browsed ones and protected ones.
    pub fn terminals(&self) -> Vec<Terminal> {
        self.terminals_with(&running())
    }

    fn terminals_with(&self, running: &[PathBuf]) -> Vec<Terminal> {
        let mut all = terminals::discover(&self.terminals_root, running);
        let extra: Vec<Terminal> = {
            let s = self.state.lock().unwrap();
            s.protected.values().cloned().chain(self.browsed.lock().unwrap().iter().cloned()).collect()
        };
        for t in extra {
            if !all.iter().any(|a| a.id == t.id) {
                all.push(t);
            }
        }
        all
    }

    pub fn view(&self) -> View {
        let running = running();
        let all = self.terminals_with(&running);
        let ea_sha = self.ea().map(|(_, sha)| sha);
        let s = self.state.lock().unwrap().clone();
        let now = dg_core::unix_now();
        let rows = all
            .into_iter()
            .map(|t| {
                let ea = self.bridge.ea_status(&t.id);
                let protected = s.is_protected(&t.id);
                let restart_needed = s.pending.contains(&t.id);
                let connected = s.links.contains_key(&t.id) && ea.running(now);
                let installed = match &ea_sha {
                    Some(sha) => setup::ea_installed(&t, sha),
                    None => setup::ea_path(&t).exists(),
                };
                let (status, reason) = if !protected {
                    (Status::Off, "Not connected".to_string())
                } else if !s.signed_in() {
                    (Status::Off, "Signed out. Trades aren't counted.".into())
                } else if restart_needed {
                    (Status::SettingUp, "Restart MetaTrader to finish setup".into())
                } else if !is_running(&t, &running) {
                    (Status::NotRunning, format!("{} is closed", t.name))
                } else if connected {
                    (Status::On, "On".into())
                } else if ea.running(now) {
                    (Status::SettingUp, "Connecting…".into())
                } else {
                    (Status::SettingUp, "Open any chart: the DisciplineGuard panel starts there".into())
                };
                Row {
                    folder: t.data_dir.to_string_lossy().into_owned(),
                    dismissed: s.dismissed.contains(&t.id),
                    id: t.id,
                    name: t.name,
                    protected,
                    installed,
                    algo_on: ea.algo_on,
                    connected,
                    restart_needed,
                    status,
                    reason,
                }
            })
            .collect();
        View { signed_in: s.signed_in(), email: s.email.clone(), rows, can_protect: ea_sha.is_some() }
    }

    /// Sign-in with Allow in the browser. Blocks until the trader answers or it times out.
    pub fn sign_in(&self, open: &dyn Fn(&str)) -> Result<(), SignInError> {
        let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Windows".into());
        let allow = Allow { app_url: self.web.clone(), name, timeout: Duration::from_secs(10 * 60) };
        let signed = signin::sign_in(&self.api, &allow, open)?;
        // Held through the protection-off calls, so the bridge can't link a terminal to the old person meanwhile.
        let mut s = self.state.lock().unwrap();
        signin::apply(&self.api, &mut s, signed)?;
        self.save(&s);
        Ok(())
    }

    pub fn add_browsed(&self, folder: &Path) -> Option<String> {
        let t = terminals::from_browse(folder, &self.terminals_root)?;
        let id = t.id.clone();
        let mut b = self.browsed.lock().unwrap();
        b.retain(|x| x.id != id);
        b.push(t);
        Some(id)
    }

    /// Protect for the ticked terminals; the others are remembered as not wanted. Returns an error line, if any.
    pub fn protect(&self, ticked: &[String]) -> Result<(), String> {
        let (ex5, _) = self.ea().ok_or("This copy of DisciplineGuard has no signed EA. Download it again from the website.")?;
        let all = self.terminals();
        let mut failed = Vec::new();
        let mut s = self.state.lock().unwrap();
        for t in &all {
            if s.is_protected(&t.id) {
                continue;
            }
            if !ticked.contains(&t.id) {
                if !s.dismissed.contains(&t.id) {
                    s.dismissed.push(t.id.clone());
                }
                continue;
            }
            let done = setup::install_ea(t, ex5).and_then(|_| setup::edit_template(t, true));
            if done.is_err() {
                failed.push(t.name.clone());
                continue;
            }
            s.dismissed.retain(|d| d != &t.id);
            s.protected.insert(t.id.clone(), t.clone());
            // An open MetaTrader rewrites its profile on exit, so that part waits for a restart.
            if process::is_running(t) || setup::finish_while_closed(t, true).is_err() {
                s.pending.push(t.id.clone());
            }
        }
        self.save(&s);
        if failed.is_empty() {
            Ok(())
        } else {
            Err(format!("Couldn't set up {}. Check that the folder isn't read-only, then try again.", failed.join(", ")))
        }
    }

    /// The trader pressed "Restart MetaTrader". Closes each waiting terminal the way its X button does, finishes
    /// setup and opens it again. Returns the names that didn't close (for example, a dialog is open).
    pub fn restart(&self) -> Vec<String> {
        let waiting: Vec<Terminal> = {
            let s = self.state.lock().unwrap();
            s.pending.iter().filter_map(|id| s.protected.get(id).cloned()).collect()
        };
        let mut stuck = Vec::new();
        for t in waiting {
            if !process::close(&t, Duration::from_secs(60)) {
                stuck.push(t.name.clone());
                continue;
            }
            self.finish(&t);
            let _ = process::launch(&t);
        }
        stuck
    }

    fn finish(&self, t: &Terminal) {
        if setup::finish_while_closed(t, true).is_ok() {
            let mut s = self.state.lock().unwrap();
            s.pending.retain(|p| p != &t.id);
            self.save(&s);
        }
    }

    /// Every few seconds: finishes setup for waiting terminals the trader has closed, and brings each closed
    /// protected terminal's EA up to the build this app carries. An open MT reloads an EA whose file changes, so an
    /// open terminal waits until it is closed: the panel never reloads under the trader.
    pub fn maintain(&self) {
        let protected: Vec<(Terminal, bool)> = {
            let s = self.state.lock().unwrap();
            s.protected.values().map(|t| (t.clone(), s.pending.contains(&t.id))).collect()
        };
        let ea = self.ea();
        let running = running();
        for (t, pending) in protected {
            if is_running(&t, &running) {
                continue;
            }
            if pending {
                self.finish(&t);
            }
            if let Some((ex5, sha)) = &ea {
                if !setup::ea_installed(&t, sha) {
                    let _ = setup::install_ea(&t, ex5);
                }
            }
        }
    }

    /// The uninstaller (SPEC §9.5): protection-off for every connected terminal. Only once the server has it is the
    /// EA taken out of MetaTrader; without server contact the EA stays, with its saved rules. True when all is done.
    pub fn uninstall(&self) -> bool {
        let s = self.state.lock().unwrap().clone();
        let mut all_done = true;
        for t in s.protected.values() {
            let acked = match s.links.get(&t.id) {
                Some(link) => matches!(self.api.protection_off(link, "uninstalled"), Ok(true)),
                None => true,
            };
            if !acked {
                all_done = false;
                continue;
            }
            let _ = setup::edit_template(t, false);
            // The EA file goes even while MT is open: the app won't be here to finish later, and without the file MT
            // drops the EA from its charts at the next start. Open charts keep the panel until then.
            let _ = setup::remove_ea(t);
            if !process::is_running(t) {
                let _ = setup::finish_while_closed(t, false);
            }
        }
        if all_done {
            let _ = std::fs::remove_file(&self.store.path);
        }
        all_done
    }
}
