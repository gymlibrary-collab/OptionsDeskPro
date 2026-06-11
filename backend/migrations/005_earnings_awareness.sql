-- Earnings awareness feature toggle
ALTER TABLE ai_settings
    ADD COLUMN IF NOT EXISTS earnings_awareness_enabled BOOLEAN NOT NULL DEFAULT FALSE;
