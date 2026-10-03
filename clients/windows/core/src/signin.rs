//! Sign-in (SPEC §9.5, §10.9): the app opens the web app's Allow page, the trader presses Allow, and the page hands
//! a single-use code to this app on a loopback address (RFC 8252). Only this app holds the PKCE verifier, so the
//! code is useless to anyone else.

use crate::api::{self, Api};
use crate::state::AppState;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct SignedIn {
    pub token: String,
    pub email: String,
    pub user: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SignInError {
    /// Nobody pressed Allow in time.
    Timeout,
    /// The server refused the code.
    Refused,
    /// No internet.
    Offline,
    /// Signing in as another person needs the old person's protection-off acknowledged first (SEC-01).
    SwitchNeedsInternet,
}

pub struct Allow {
    /// The web app, e.g. https://disciplineguard.com.
    pub app_url: String,
    /// The computer's name, shown on the Allow page and in the security email.
    pub name: String,
    pub timeout: Duration,
}

/// Opens the Allow page with `open` and waits for the code. Returns the app token.
pub fn sign_in(api: &Api, allow: &Allow, open: &dyn Fn(&str)) -> Result<SignedIn, SignInError> {
    let verifier = crate::random_hex(32);
    let challenge = crate::sha256_hex(verifier.as_bytes());
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| SignInError::Refused)?;
    let port = listener.local_addr().map_err(|_| SignInError::Refused)?.port();
    listener.set_nonblocking(true).map_err(|_| SignInError::Refused)?;
    let url = format!("{}/allow?port={port}&challenge={challenge}&name={}", allow.app_url, encode(&allow.name));
    open(&url);
    let code = wait_for_code(&listener, allow.timeout)?;
    let body = serde_json::json!({ "code": code, "verifier": verifier, "version": env!("CARGO_PKG_VERSION") });
    let r = api.post("/v1/auth/desktop", None, &body.to_string()).map_err(|_| SignInError::Offline)?;
    if r.status != 200 {
        return Err(SignInError::Refused);
    }
    let d = api::parse(&r.body);
    match (d["token"].as_str(), d["email"].as_str(), d["user"].as_str()) {
        (Some(t), Some(e), Some(u)) => Ok(SignedIn { token: t.into(), email: e.into(), user: u.into() }),
        _ => Err(SignInError::Refused),
    }
}

fn wait_for_code(listener: &TcpListener, timeout: Duration) -> Result<String, SignInError> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        let Ok((stream, _)) = listener.accept() else {
            std::thread::sleep(Duration::from_millis(100));
            continue;
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let mut line = String::new();
        let _ = BufReader::new(&stream).read_line(&mut line);
        let target = line.split(' ').nth(1).unwrap_or("");
        let code = target
            .strip_prefix("/cb?")
            .and_then(|q| q.split('&').find_map(|kv| kv.strip_prefix("code=")))
            .filter(|c| !c.is_empty() && c.len() <= 100 && c.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
        let mut w = &stream;
        let page = "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width\"><title>DisciplineGuard</title>\
            <body style=\"margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 'Segoe UI',system-ui,sans-serif;color:#0b1322;\
            background:radial-gradient(600px 400px at 85% 0%,rgb(56 232 200/26%),transparent 70%),radial-gradient(600px 400px at 0% 100%,rgb(30 152 242/16%),transparent 70%),#f6f9fc\">\
            <div style=\"text-align:center;padding:24px\"><div style=\"width:64px;height:64px;margin:0 auto 18px;border-radius:20px;display:grid;place-items:center;\
            background:linear-gradient(135deg,#6af4cc,#1cd0d0 33%,#1e98f2 67%,#5262f4);box-shadow:0 14px 30px -12px rgb(30 120 240/65%)\">\
            <svg width=30 height=30 viewBox=\"0 0 24 24\" fill=none stroke=#fff stroke-width=2.6 stroke-linecap=round stroke-linejoin=round><path d=\"m5 12.5 4.5 4.5L19 7.5\"/></svg></div>\
            <h1 style=\"font-size:24px;margin:0 0 6px\">DisciplineGuard is signed in</h1><p style=\"margin:0;color:#526175\">You can close this tab.</p></div>";
        let _ = match code {
            Some(_) => write!(w, "HTTP/1.1 200 OK\r\ncontent-type: text/html; charset=utf-8\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{page}", page.len()),
            None => write!(w, "HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"),
        };
        if let Some(c) = code {
            return Ok(c.to_string());
        }
    }
    Err(SignInError::Timeout)
}

/// Stores a new sign-in. If it is another person and this computer has connected terminals, protection-off with
/// reason `switched_login` goes out first for each of them, and every one must be acknowledged; without server
/// contact the switch is refused and the old sign-in stays (SPEC §9.2, SEC-01).
pub fn apply(api: &Api, s: &mut AppState, signed: SignedIn) -> Result<(), SignInError> {
    let other_person = s.user.as_deref().is_some_and(|u| u != signed.user);
    if other_person {
        for link in s.links.values() {
            if !matches!(api.protection_off(link, "switched_login"), Ok(true)) {
                return Err(SignInError::SwitchNeedsInternet);
            }
        }
        // The terminals stay ticked; they connect again under the new person on their next sync.
        s.links.clear();
        s.alerts_after = None;
    }
    s.app_token = Some(signed.token);
    s.email = Some(signed.email);
    s.user = Some(signed.user);
    Ok(())
}

fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}
