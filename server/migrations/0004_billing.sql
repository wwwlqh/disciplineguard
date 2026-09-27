-- Full checkout, self-serve plan changes, export and deletion (SPEC §12, §13.4).
ALTER TABLE users ADD COLUMN first_paid_at INTEGER;       -- the 14-day refund window starts here
ALTER TABLE users ADD COLUMN portal_url TEXT;             -- the payment provider's billing portal
ALTER TABLE users ADD COLUMN update_card_url TEXT;
ALTER TABLE users ADD COLUMN deletion_at INTEGER;         -- when a requested deletion runs (SPEC §12.6)

CREATE TABLE export_tokens (                              -- emailed export links: single use, 24 hours
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
