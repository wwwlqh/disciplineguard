-- Free for everyone with one trading account (SPEC §12.1, §12.5). No trial, so no trial marks, and every account is enforced.
UPDATE trading_accounts SET not_enforced = 0;
DROP TABLE trial_marks;
ALTER TABLE trading_accounts DROP COLUMN not_enforced;
DELETE FROM jobs WHERE kind IN ('trial_3days', 'trial_ended') AND done_at IS NULL;
