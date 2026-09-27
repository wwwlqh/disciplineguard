-- A pause named a reason before the trader answered "Save the reasons you pick?" (SPEC §13.2).
ALTER TABLE users ADD COLUMN reason_asked_at INTEGER;
