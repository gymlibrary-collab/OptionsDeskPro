-- AI feature toggles per user
CREATE TABLE IF NOT EXISTS ai_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    narrative_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
    chat_enabled               BOOLEAN NOT NULL DEFAULT FALSE,
    risk_summary_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    strategy_reasoning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai_settings"
    ON ai_settings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
