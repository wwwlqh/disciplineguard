-- Trader alerts, shown by the Windows app as Windows notifications (SPEC §11).
ALTER TABLE users ADD COLUMN alerts_json TEXT;          -- switches per alert, summary time, amounts

CREATE TABLE alerts (                                   -- the app fetches these; kept 7 days
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX alerts_user ON alerts(user_id, id);

CREATE TABLE alert_state (                              -- at most 1 message per alert per 30 minutes (SPEC §11.2)
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  held INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind)
);
