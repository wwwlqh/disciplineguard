//! What the app remembers between runs. Stored with Windows DPAPI ([`crate::store`]), since it holds tokens.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

/// One MT5 terminal on this computer. Its id is the name of its data folder, the same id the EA computes.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Terminal {
    pub id: String,
    /// The data folder, which holds `MQL5` and `config`.
    pub data_dir: PathBuf,
    /// `terminal64.exe`, when known.
    pub exe: Option<PathBuf>,
    /// Shown to the trader, e.g. "IC Markets MetaTrader 5".
    pub name: String,
    /// Started with `/portable`: the data folder is the install folder.
    pub portable: bool,
}

/// The device token the server issued for one terminal (SPEC §10.9).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Link {
    pub token: String,
    pub connection_id: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AppState {
    /// The app's own token from "Allow". None when signed out.
    pub app_token: Option<String>,
    /// Masked, for display only.
    pub email: Option<String>,
    /// The signed-in user's id, so a sign-in as someone else is noticed (SEC-01).
    pub user: Option<String>,
    /// Terminals the trader protected, by id.
    pub protected: BTreeMap<String, Terminal>,
    /// Device tokens, one per terminal.
    pub links: BTreeMap<String, Link>,
    /// Terminals whose MT profile still needs the EA. Done the next time that MetaTrader is closed.
    pub pending: Vec<String>,
    /// Terminals the trader chose not to protect, so they aren't offered again.
    pub dismissed: Vec<String>,
    /// The trader agreed to upload the last 90 days for their own before/after comparison (SPEC §14).
    pub baseline: bool,
}

impl AppState {
    pub fn signed_in(&self) -> bool {
        self.app_token.is_some()
    }

    pub fn is_protected(&self, id: &str) -> bool {
        self.protected.contains_key(id)
    }

    /// Stops serving a terminal (removed on the website, or its protection-off was acknowledged).
    pub fn unprotect(&mut self, id: &str) {
        self.protected.remove(id);
        self.links.remove(id);
        self.pending.retain(|t| t != id);
    }
}
