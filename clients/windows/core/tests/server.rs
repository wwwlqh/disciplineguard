//! The app against the real server handler (`server/dev.ts` on an empty in-memory database).
//! `npm test` in clients/windows starts the server and sets DG_TEST_API; without it these tests are skipped.

use dg_core::api::Api;
use dg_core::bridge::Bridge;
use dg_core::signin::{self, Allow, SignInError};
use dg_core::state::{AppState, Terminal};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

static SERIAL: Mutex<()> = Mutex::new(());

fn api_url() -> Option<String> {
    std::env::var("DG_TEST_API").ok()
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder().http_status_as_error(false).build().into()
}

struct Web {
    api: String,
    cookie: String,
}

fn call(url: &str, method: &str, body: Option<Value>, cookie: Option<&str>) -> (u16, Value, Option<String>) {
    let a = agent();
    let mut res = match (method, body) {
        ("GET", _) => {
            let mut r = a.get(url);
            if let Some(c) = cookie {
                r = r.header("cookie", c);
            }
            r.call().unwrap()
        }
        (m, b) => {
            let mut r = if m == "DELETE" { a.delete(url).force_send_body() } else { a.post(url) };
            r = r.header("content-type", "application/json");
            if let Some(c) = cookie {
                r = r.header("cookie", c).header("x-dg", "1");
            }
            r.send(b.unwrap_or(json!({})).to_string()).unwrap()
        }
    };
    let status = res.status().as_u16();
    let set_cookie = res.headers().get("set-cookie").and_then(|v| v.to_str().ok()).map(|s| s.split(';').next().unwrap().to_string());
    let text = res.body_mut().read_to_string().unwrap_or_default();
    (status, serde_json::from_str(&text).unwrap_or(Value::Null), set_cookie)
}

impl Web {
    /// Signs in through the dev outbox and onboards a new user.
    fn sign_in(api: &str, email: &str) -> Web {
        let (s, _, _) = call(&format!("{api}/v1/auth/email"), "POST", Some(json!({ "email": email })), None);
        assert_eq!(s, 200, "sign-in request");
        let (_, outbox, _) = call(&format!("{api}/dev/outbox"), "GET", None, None);
        let mail = outbox.as_array().unwrap().iter().find(|m| m["to_email"] == email).unwrap();
        let body = mail["body"].as_str().unwrap();
        let i = body.find("code is ").unwrap() + 8;
        let code = &body[i..i + 6];
        let (s, _, cookie) = call(&format!("{api}/v1/auth/verify"), "POST", Some(json!({ "email": email, "code": code })), None);
        assert_eq!(s, 200, "verify");
        let web = Web { api: api.into(), cookie: cookie.unwrap() };
        let onboard = json!({
            "tz": "UTC", "reset": { "preset": "midnight" }, "riskNotice": true, "analyticsConsent": false,
            "rules": { "R1": { "on": true, "max": 5 } }, "notes": [{ "text": "Stand up and breathe.", "tag": "any" }],
            "plan": "close the chart for 10 minutes",
        });
        assert_eq!(web.send("POST", "/api/onboarding/apply", onboard).0, 200, "onboarding");
        web
    }

    fn send(&self, method: &str, path: &str, body: Value) -> (u16, Value) {
        let (s, v, _) = call(&format!("{}{path}", self.api), method, Some(body), Some(&self.cookie));
        (s, v)
    }

    fn me(&self) -> Value {
        call(&format!("{}/api/me", self.api), "GET", None, Some(&self.cookie)).1
    }

    /// The app's sign-in, with this web session pressing Allow in place of the browser.
    fn allow_app(&self) -> signin::SignedIn {
        let allow = Allow { app_url: "http://app.test".into(), name: "DESKTOP-TEST".into(), timeout: Duration::from_secs(10) };
        signin::sign_in(&Api::new(&self.api), &allow, &|url| {
            let q: std::collections::HashMap<String, String> = url.split_once('?').unwrap().1.split('&').map(|kv| {
                let (k, v) = kv.split_once('=').unwrap();
                (k.to_string(), v.to_string())
            }).collect();
            let (s, d) = self.send("POST", "/api/desktop/allow", json!({ "challenge": q["challenge"], "name": q["name"] }));
            assert_eq!(s, 200, "allow");
            let port = q["port"].clone();
            let code = d["code"].as_str().unwrap().to_string();
            std::thread::spawn(move || call(&format!("http://127.0.0.1:{port}/cb?code={code}"), "GET", None, None));
        })
        .unwrap()
    }
}

fn advance(api: &str, ms: u64) {
    assert_eq!(call(&format!("{api}/dev/advance?ms={ms}"), "POST", None, None).0, 200);
}

struct Setup {
    _serial: MutexGuard<'static, ()>,
    api: String,
    web: Web,
    bridge: Bridge,
    state: Mutex<AppState>,
    common: PathBuf,
}

impl Setup {
    fn new(email: &str) -> Option<Setup> {
        let Some(api) = api_url() else {
            eprintln!("skipped: run `npm test` in clients/windows to start the server");
            return None;
        };
        let serial = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
        let web = Web::sign_in(&api, email);
        let signed = web.allow_app();
        let mut state = AppState::default();
        signin::apply(&Api::new(&api), &mut state, signed).unwrap();
        state.protected.insert("TERMA".into(), terminal("TERMA"));
        let common = std::env::temp_dir().join(format!("dg-common-{}", dg_core::random_hex(6)));
        fs::create_dir_all(common.join("DisciplineGuard").join("TERMA")).unwrap();
        let bridge = Bridge::new(&common, Api::new(&api));
        Some(Setup { _serial: serial, api, web, bridge, state: Mutex::new(state), common })
    }

    fn dir(&self, id: &str) -> PathBuf {
        self.common.join("DisciplineGuard").join(id)
    }

    fn request(&self, id: &str, seq: u32, path: &str, body: &str) {
        fs::write(self.dir(id).join("out.txt"), format!("{seq} {path}\n{body}")).unwrap();
        self.bridge.tick(&self.state, &|_| {});
    }

    fn reply_head(&self, id: &str) -> String {
        fs::read_to_string(self.dir(id).join("in.txt")).unwrap().lines().next().unwrap().to_string()
    }

    fn heartbeat(&self, id: &str) -> Vec<String> {
        fs::read_to_string(self.dir(id).join("app.txt")).unwrap().split('\n').map(String::from).collect()
    }
}

impl Drop for Setup {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.common).ok();
    }
}

fn terminal(id: &str) -> Terminal {
    Terminal { id: id.into(), data_dir: Path::new("unused").into(), exe: None, name: "MT5".into(), portable: false }
}

fn sync_body(login: &str) -> String {
    json!({
        "role": "primary", "version": "0.1.0", "signedHash": "", "events": [],
        "accounts": [{ "key": format!("{login}@FTMO-Demo"), "platform": "mt5", "server": "FTMO-Demo", "login": login,
                       "currency": "USD", "netting": false, "balance": 10000, "equity": 10000 }],
    })
    .to_string()
}

#[test]
fn connects_on_the_first_request_and_relays_the_reply_with_no_pairing_step() {
    let Some(t) = Setup::new("connect@test.dev") else { return };
    t.request("TERMA", 7, "/v1/sync", &sync_body("1234567"));
    assert!(!t.dir("TERMA").join("out.txt").exists());
    assert_eq!(t.reply_head("TERMA"), "7 200");
    let reply = fs::read_to_string(t.dir("TERMA").join("in.txt")).unwrap();
    let body: Value = serde_json::from_str(reply.split_once('\n').unwrap().1).unwrap();
    assert!(body["signed"]["payload"].is_string());
    let hb = t.heartbeat("TERMA");
    assert_eq!(hb[1], "on");
    assert!(hb[2].starts_with("c_"));
    assert_eq!(t.web.me()["connections"].as_array().unwrap().len(), 1);
}

#[test]
fn an_unticked_terminal_is_told_to_be_ticked_and_never_forwarded() {
    let Some(t) = Setup::new("unticked@test.dev") else { return };
    fs::create_dir_all(t.dir("TERMB")).unwrap();
    t.request("TERMB", 1, "/v1/sync", &sync_body("1234567"));
    assert_eq!(t.heartbeat("TERMB")[1], "not_protected");
    assert!(!t.dir("TERMB").join("in.txt").exists());
}

#[test]
fn refuses_paths_other_than_sync_and_baseline() {
    let Some(t) = Setup::new("paths@test.dev") else { return };
    t.request("TERMA", 3, "/api/me", "{}");
    assert_eq!(t.reply_head("TERMA"), "3 400");
}

#[test]
fn registers_again_once_when_the_device_token_was_rotated() {
    let Some(t) = Setup::new("rotated@test.dev") else { return };
    t.request("TERMA", 1, "/v1/sync", &sync_body("1234567"));
    t.state.lock().unwrap().links.get_mut("TERMA").unwrap().token = "x".repeat(43);
    t.request("TERMA", 2, "/v1/sync", &sync_body("1234567"));
    assert_eq!(t.reply_head("TERMA"), "2 200");
}

#[test]
fn reports_signed_out_when_the_app_token_is_revoked() {
    let Some(t) = Setup::new("revoked@test.dev") else { return };
    t.state.lock().unwrap().app_token = Some("y".repeat(43));
    t.request("TERMA", 1, "/v1/sync", &sync_body("1234567"));
    assert_eq!(t.reply_head("TERMA"), "1 401");
    assert!(t.state.lock().unwrap().app_token.is_none());
    t.bridge.tick(&t.state, &|_| {});
    assert_eq!(t.heartbeat("TERMA")[1], "signed_out");
}

#[test]
fn stops_protecting_a_terminal_removed_on_the_website() {
    let Some(t) = Setup::new("removed@test.dev") else { return };
    t.request("TERMA", 1, "/v1/sync", &sync_body("1234567"));
    let conn = t.web.me()["connections"][0]["id"].as_str().unwrap().to_string();
    assert_eq!(t.web.send("DELETE", &format!("/api/connections/{conn}"), json!({})).0, 200);
    advance(&t.api, 2 * 24 * 3600 * 1000);
    t.request("TERMA", 2, "/v1/sync", &sync_body("1234567"));
    assert_eq!(t.reply_head("TERMA"), "2 410");
    assert!(!t.state.lock().unwrap().is_protected("TERMA"));
    assert_eq!(t.heartbeat("TERMA")[1], "not_protected");
}

/// SEC-01: signing in as another person first turns off the old person's connections, and needs the server for it.
#[test]
fn signing_in_as_another_person_turns_off_the_old_connections_first() {
    let Some(t) = Setup::new("sec01-a@test.dev") else { return };
    t.request("TERMA", 1, "/v1/sync", &sync_body("7654321"));
    let b = Web::sign_in(&t.api, "sec01-b@test.dev");
    let signed_b = b.allow_app();

    let before = t.state.lock().unwrap().clone();
    let mut offline = before.clone();
    assert_eq!(signin::apply(&Api::new("http://127.0.0.1:9"), &mut offline, signed_b.clone()), Err(SignInError::SwitchNeedsInternet));
    assert_eq!(offline.app_token, before.app_token);
    assert_eq!(offline.links.len(), 1);

    let mut s = t.state.lock().unwrap();
    signin::apply(&Api::new(&t.api), &mut s, signed_b).unwrap();
    assert!(s.links.is_empty());
    assert!(s.is_protected("TERMA"));
    drop(s);
    let conn = &t.web.me()["connections"][0];
    assert_eq!(conn["status"], "off");
    assert_eq!(conn["offReason"], "switched_login");

    // The same terminal connects again, now for the new person.
    t.request("TERMA", 2, "/v1/sync", &sync_body("7654321"));
    assert_eq!(t.reply_head("TERMA"), "2 200");
    assert_eq!(b.me()["connections"].as_array().unwrap().len(), 1);
}
