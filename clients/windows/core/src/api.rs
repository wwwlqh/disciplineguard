//! The few server calls the app makes. Only the app talks to the network; the EA never does (SPEC §9.2).

use crate::state::Link;
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct Reply {
    pub status: u16,
    pub body: String,
}

#[derive(Debug)]
pub struct NetError(pub String);

pub struct Api {
    pub base: String,
    agent: ureq::Agent,
}

impl Api {
    pub fn new(base: &str) -> Self {
        let builder = ureq::Agent::config_builder();
        // Windows' own TLS and certificate store, so a company proxy's certificate works like it does in the browser.
        #[cfg(windows)]
        let builder = builder.tls_config(
            ureq::tls::TlsConfig::builder()
                .provider(ureq::tls::TlsProvider::NativeTls)
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        );
        let agent = builder
            .http_status_as_error(false)
            .timeout_global(Some(Duration::from_secs(15)))
            .user_agent(concat!("DisciplineGuard-Windows/", env!("CARGO_PKG_VERSION")))
            .build()
            .into();
        Api { base: base.trim_end_matches('/').to_string(), agent }
    }

    /// POST with a JSON body and an optional bearer token.
    pub fn post(&self, path: &str, token: Option<&str>, body: &str) -> Result<Reply, NetError> {
        let mut req = self.agent.post(format!("{}{}", self.base, path)).header("content-type", "application/json");
        if let Some(t) = token {
            req = req.header("authorization", format!("Bearer {t}"));
        }
        let mut res = req.send(body).map_err(|e| NetError(e.to_string()))?;
        let status = res.status().as_u16();
        let body = res.body_mut().read_to_string().map_err(|e| NetError(e.to_string()))?;
        Ok(Reply { status, body })
    }

    /// Sends protection-off for one terminal's connection (SPEC §10.6). True once the server has it: a 200, or a
    /// connection the server already removed or no longer knows (nothing is protected by it any more).
    pub fn protection_off(&self, link: &Link, reason: &str) -> Result<bool, NetError> {
        let now_ms = crate::unix_now() * 1000;
        let body = json!({
            "role": "secondary",
            "state": "off",
            "version": env!("CARGO_PKG_VERSION"),
            "accounts": [],
            "events": [{ "type": "protection_off", "id": format!("off_{}", crate::random_hex(8)), "t": now_ms, "reason": reason }],
        });
        let r = self.post("/v1/sync", Some(&link.token), &body.to_string())?;
        Ok(matches!(r.status, 200 | 401 | 410))
    }
}

pub fn parse(body: &str) -> Value {
    serde_json::from_str(body).unwrap_or(Value::Null)
}
