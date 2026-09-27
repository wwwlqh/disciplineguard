-- Tighten for today (SPEC §6.5): a lower max trades and daily loss limit until the next reset.
ALTER TABLE user_state ADD COLUMN tighten_json TEXT;      -- {"r1": 3, "r8": 150, "until": <next reset>}
