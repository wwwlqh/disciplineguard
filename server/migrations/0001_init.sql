-- DisciplineGuard server schema (SPEC §10.8). D1 / SQLite. Times are UTC epoch milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_norm TEXT NOT NULL,              -- lowercased, +tag stripped, gmail dots removed (SPEC §12.5)
  first_name TEXT,
  created_at INTEGER NOT NULL,
  setup_mode INTEGER NOT NULL DEFAULT 1,
  locked_at INTEGER,
  locked_by TEXT,
  first_on_at INTEGER,                   -- first connection reached On (trial start, auto-lock)
  lock_notice_sent INTEGER NOT NULL DEFAULT 0,
  last_real_pause_at INTEGER,
  plan_state TEXT NOT NULL DEFAULT 'trial',   -- trial | active | past_due | ended
  plan_kind TEXT,                        -- earlybird_yearly | yearly | monthly
  paid_until INTEGER,
  past_due_since INTEGER,
  provider_end_at INTEGER,               -- refund, chargeback or provider cancel: protection ends here (SPEC §12.2)
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  is_beta INTEGER NOT NULL DEFAULT 1,
  magic INTEGER NOT NULL,                -- per-user magic number (PHASE0 §2)
  analytics_consent INTEGER,             -- NULL = not answered
  analytics_id TEXT NOT NULL,            -- random, never the user id (SPEC §13.2)
  reason_consent INTEGER,
  hide_amounts INTEGER NOT NULL DEFAULT 0,
  country TEXT,
  risk_notice_version TEXT,
  risk_notice_at INTEGER,
  onboarding_json TEXT,
  deletion_requested_at INTEGER,
  deleted_at INTEGER,
  trial_eligible INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX users_email_norm ON users(email_norm);

-- Protected settings: one active value and at most one pending value (SPEC §6.4).
CREATE TABLE settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  active_json TEXT,
  pending_json TEXT,
  effective_at INTEGER,
  requested_at INTEGER,
  set_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE setting_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  from_json TEXT,
  to_json TEXT,
  direction TEXT NOT NULL,               -- stricter | looser | same | cancel | activated
  applies_at INTEGER,
  created_at INTEGER NOT NULL,
  actor TEXT NOT NULL DEFAULT 'user'
);
CREATE INDEX setting_changes_user ON setting_changes(user_id, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  user_agent TEXT,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  link_hash TEXT NOT NULL UNIQUE,
  browser_nonce_hash TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_codes_email ON login_codes(email, created_at);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE desktop_codes (             -- "Allow" in the web app, exchanged once by the Windows app (SPEC §9.5)
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  challenge TEXT NOT NULL,               -- sha256 hex of the app's PKCE verifier
  name TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE desktop_installs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                    -- computer name shown in Devices
  version TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  revoked_at INTEGER
);
CREATE INDEX desktop_installs_user ON desktop_installs(user_id);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  desktop_id TEXT,                       -- the Windows app that connected this terminal
  install_id TEXT,                       -- MT: terminal id (data folder name)
  role TEXT,
  version TEXT,
  build_hash TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  first_on_at INTEGER,
  last_seen INTEGER,
  acked_seq INTEGER NOT NULL DEFAULT 0,
  push_ready INTEGER NOT NULL DEFAULT 0,
  status TEXT,                           -- last reported protection state
  last_error TEXT,
  removed_at INTEGER,
  off_reason TEXT
);
CREATE INDEX connections_user ON connections(user_id);

CREATE TABLE trading_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,                -- mt5 | mt4 | tv
  server_hash TEXT NOT NULL,
  account_hash TEXT NOT NULL,
  last3 TEXT NOT NULL,
  server_name TEXT,
  broker TEXT,
  nickname TEXT,
  firm TEXT,
  currency TEXT,
  netting INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  trade_allowed INTEGER NOT NULL DEFAULT 1,
  not_enforced INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  last_entry_at INTEGER,
  removed_at INTEGER,
  balance REAL,
  equity REAL,
  credit REAL,
  state_at INTEGER,
  history_cursor TEXT                    -- last reported deal, kept on the server (SPEC §10.5)
);
CREATE INDEX trading_accounts_user ON trading_accounts(user_id);
CREATE INDEX trading_accounts_hash ON trading_accounts(platform, server_hash, account_hash);

CREATE TABLE seen_by (
  connection_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (connection_id, account_id)
);

-- One trial per trading account (SPEC §12.5). Kept 12 months after deletion.
CREATE TABLE trial_marks (
  platform TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  account_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (platform, server_hash, account_hash)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,                   -- deterministic for platform data, random otherwise (SPEC §4.3)
  user_id TEXT NOT NULL,
  connection_id TEXT,
  account_id TEXT,
  seq INTEGER,
  type TEXT NOT NULL,
  t INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  void_at INTEGER,                       -- a pending entry cancelled unfilled stops counting
  payload TEXT
);
CREATE INDEX events_user_type_t ON events(user_id, type, t);
CREATE INDEX events_account_t ON events(account_id, t);

CREATE TABLE day_start (
  account_id TEXT NOT NULL,
  day_start_utc INTEGER NOT NULL,
  balance REAL NOT NULL,
  reported_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, day_start_utc)
);

CREATE TABLE limit_state (
  account_id TEXT NOT NULL,
  day_start_utc INTEGER NOT NULL,
  reached_at INTEGER NOT NULL,
  loss REAL,
  limit_value REAL,
  PRIMARY KEY (account_id, day_start_utc)
);

CREATE TABLE user_state (
  user_id TEXT PRIMARY KEY,
  break_until INTEGER,
  done_until INTEGER,
  last_skip_json TEXT
);

CREATE TABLE coverage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  from_utc INTEGER NOT NULL,
  to_utc INTEGER NOT NULL
);
CREATE INDEX coverage_account ON coverage(account_id, to_utc);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,              -- idempotency
  run_at INTEGER NOT NULL,
  payload TEXT,
  done_at INTEGER
);
CREATE INDEX jobs_due ON jobs(done_at, run_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE outbox_email (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  error TEXT
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,                   -- provider event id, for idempotency
  user_id TEXT,
  type TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT,
  country TEXT,
  plan_kind TEXT,
  created_at INTEGER NOT NULL,
  data TEXT
);

CREATE TABLE problem_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  type TEXT NOT NULL,
  text TEXT,
  diagnostics TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  analytics_id TEXT NOT NULL,
  name TEXT NOT NULL,
  t INTEGER NOT NULL,
  props TEXT NOT NULL,
  forwarded_at INTEGER
);

CREATE TABLE baseline (
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,                    -- entry | close
  ticket TEXT NOT NULL,
  t INTEGER NOT NULL,
  payload TEXT,
  PRIMARY KEY (account_id, kind, ticket)
);

CREATE TABLE waitlist (
  email TEXT PRIMARY KEY,
  platform TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE tell_me (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, platform)
);
