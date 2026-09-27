//! The app's side of the EA bridge (SPEC §9.5), in `Common\Files\DisciplineGuard\<terminal id>\`:
//! - `out.txt`: one request from the EA, `<seq> <path>` then the JSON body. Only sync and baseline are forwarded.
//! - `in.txt`: the reply, `<seq> <HTTP status>` then the body. The signed rules inside are checked by the EA.
//! - `app.txt`: the app heartbeat (time, state, connection id, masked email, "baseline" when consented).
//! - `ea.txt`: the EA heartbeat (time, then optionally `algo_on` or `algo_off`).

use crate::api::{self, Api, NetError, Reply};
use crate::state::{AppState, Link};
use crate::text::write_bytes;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Paths the EA may ask for. Anything else is refused, so a bad file can't reach other endpoints.
const ALLOWED: [&str; 2] = ["/v1/sync", "/v1/baseline"];
/// An EA heartbeat older than this means the EA isn't running on that terminal.
pub const EA_STALE_SECS: u64 = 60;

pub struct Bridge {
    /// `...\MetaQuotes\Terminal\Common\Files\DisciplineGuard`.
    pub root: PathBuf,
    pub api: Api,
}

/// What the EA last reported about itself.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct EaStatus {
    pub last_beat: Option<u64>,
    /// None until the EA reports it.
    pub algo_on: Option<bool>,
}

impl EaStatus {
    pub fn running(&self, now: u64) -> bool {
        self.last_beat.is_some_and(|t| now.abs_diff(t) <= EA_STALE_SECS)
    }
}

enum Outcome {
    Reply(Reply),
    SignedOut,
    Failed,
}

impl Bridge {
    pub fn new(common_files: &Path, api: Api) -> Self {
        Bridge { root: common_files.join("DisciplineGuard"), api }
    }

    /// Terminal ids whose EA has made a bridge folder, protected or not.
    pub fn seen_terminals(&self) -> Vec<String> {
        fs::read_dir(&self.root)
            .map(|rd| rd.flatten().filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().into_string().ok()).collect())
            .unwrap_or_default()
    }

    pub fn ea_status(&self, id: &str) -> EaStatus {
        let text = fs::read_to_string(self.root.join(id).join("ea.txt")).unwrap_or_default();
        let mut lines = text.lines().map(str::trim);
        let last_beat = lines.next().and_then(|l| l.parse().ok());
        let algo_on = match lines.next() {
            Some("algo_on") => Some(true),
            Some("algo_off") => Some(false),
            _ => None,
        };
        EaStatus { last_beat, algo_on }
    }

    /// One pass: a heartbeat for every terminal, then at most one request per protected terminal.
    /// `save` is called whenever the state changes. The lock is never held during a network call.
    pub fn tick(&self, shared: &Mutex<AppState>, save: &dyn Fn(&AppState)) {
        let mut ids = self.seen_terminals();
        ids.extend(shared.lock().unwrap().protected.keys().cloned());
        ids.sort();
        ids.dedup();
        for id in ids {
            let dir = self.root.join(&id);
            if fs::create_dir_all(&dir).is_err() {
                continue;
            }
            self.write_heartbeat(&id, &dir, &shared.lock().unwrap());
            let serve = {
                let s = shared.lock().unwrap();
                s.is_protected(&id) && s.signed_in()
            };
            if serve {
                self.serve(&id, &dir, shared, save);
            }
        }
    }

    fn write_heartbeat(&self, id: &str, dir: &Path, s: &AppState) {
        let status = if !s.signed_in() {
            "signed_out"
        } else if s.is_protected(id) {
            "on"
        } else {
            "not_protected"
        };
        let conn = if status == "on" { s.links.get(id).map(|l| l.connection_id.as_str()).unwrap_or("") } else { "" };
        let lines = [
            crate::unix_now().to_string(),
            status.to_string(),
            conn.to_string(),
            s.email.clone().unwrap_or_default(),
            if s.baseline { "baseline".into() } else { String::new() },
        ];
        let _ = write_bytes(&dir.join("app.txt"), lines.join("\n").as_bytes());
    }

    fn serve(&self, id: &str, dir: &Path, shared: &Mutex<AppState>, save: &dyn Fn(&AppState)) {
        let out = dir.join("out.txt");
        let Ok(text) = fs::read_to_string(&out) else { return };
        let _ = fs::remove_file(&out);
        let (head, body) = text.split_once('\n').unwrap_or((text.as_str(), ""));
        let mut parts = head.trim().splitn(2, ' ');
        let seq = parts.next().unwrap_or("").to_string();
        let path = parts.next().unwrap_or("").trim().to_string();
        let reply = match self.forward(id, &path, body, shared, save) {
            Outcome::Reply(r) => r,
            Outcome::SignedOut => Reply { status: 401, body: r#"{"error":"signed_out"}"#.into() },
            Outcome::Failed => Reply { status: 0, body: String::new() },
        };
        let status = if reply.status == 0 { "-1".to_string() } else { reply.status.to_string() };
        // Heartbeat first: the EA reads the connection id before it checks the signed rules in the reply.
        self.write_heartbeat(id, dir, &shared.lock().unwrap());
        let _ = write_bytes(&dir.join("in.txt"), format!("{seq} {status}\n{}", reply.body).as_bytes());
    }

    fn forward(&self, id: &str, path: &str, body: &str, shared: &Mutex<AppState>, save: &dyn Fn(&AppState)) -> Outcome {
        if !ALLOWED.contains(&path) {
            return Outcome::Reply(Reply { status: 400, body: r#"{"error":"not_allowed"}"#.into() });
        }
        let Ok(req) = serde_json::from_str::<Value>(body) else {
            return Outcome::Reply(Reply { status: 400, body: r#"{"error":"bad_json"}"#.into() });
        };
        let result = (|| -> Result<Outcome, Fail> {
            let existing = shared.lock().unwrap().links.get(id).cloned();
            let found = match existing {
                Some(l) => Some(l),
                None => self.register(id, &req, shared, save)?,
            };
            let Some(mut link) = found else {
                return Ok(Outcome::Reply(Reply { status: 400, body: r#"{"error":"no_account"}"#.into() }));
            };
            let mut r = self.api.post(path, Some(&link.token), body)?;
            // The token was rotated or the connection re-created: register once more and retry.
            if r.status == 401 {
                shared.lock().unwrap().links.remove(id);
                if let Some(l) = self.register(id, &req, shared, save)? {
                    link = l;
                    r = self.api.post(path, Some(&link.token), body)?;
                }
            }
            // Removed on the website (a loosening that has taken effect): stop protecting it, never re-register it.
            if r.status == 410 {
                let mut s = shared.lock().unwrap();
                s.unprotect(id);
                save(&s);
            }
            Ok(Outcome::Reply(r))
        })();
        match result {
            Ok(o) => o,
            Err(Fail::SignedOut) => Outcome::SignedOut,
            Err(Fail::Net) => Outcome::Failed,
        }
    }

    /// Registers the terminal and the account its EA reported (`POST /v1/desktop/terminals`).
    fn register(&self, id: &str, req: &Value, shared: &Mutex<AppState>, save: &dyn Fn(&AppState)) -> Result<Option<Link>, Fail> {
        let a = req.get("accounts").and_then(|v| v.get(0)).or_else(|| req.get("account"));
        let Some(a) = a.filter(|a| a.get("login").is_some_and(|l| !l.is_null())) else { return Ok(None) };
        let Some(app_token) = shared.lock().unwrap().app_token.clone() else { return Err(Fail::SignedOut) };
        let body = json!({
            "terminalId": id,
            "kind": a.get("platform").and_then(Value::as_str).unwrap_or("mt5"),
            "server": a.get("server"), "login": a.get("login"), "broker": a.get("broker"), "currency": a.get("currency"),
            "netting": a.get("netting"), "demo": a.get("demo"), "build": req.get("build"), "version": req.get("version"),
        });
        let r = self.api.post("/v1/desktop/terminals", Some(&app_token), &body.to_string())?;
        if r.status == 401 {
            let mut s = shared.lock().unwrap();
            s.app_token = None;
            save(&s);
            return Err(Fail::SignedOut);
        }
        if r.status != 200 {
            return Ok(None);
        }
        let d = api::parse(&r.body);
        let (Some(token), Some(conn)) = (d["token"].as_str(), d["connectionId"].as_str()) else { return Ok(None) };
        let link = Link { token: token.into(), connection_id: conn.into() };
        let mut s = shared.lock().unwrap();
        // Unticked or signed out while the call was in flight: keep nothing.
        if !s.is_protected(id) || s.app_token.as_deref() != Some(&app_token) {
            return Ok(None);
        }
        s.links.insert(id.into(), link.clone());
        save(&s);
        Ok(Some(link))
    }
}

enum Fail {
    SignedOut,
    Net,
}

impl From<NetError> for Fail {
    fn from(_: NetError) -> Self {
        Fail::Net
    }
}
