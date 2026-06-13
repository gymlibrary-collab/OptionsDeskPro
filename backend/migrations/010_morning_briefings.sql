-- Migration 010: Morning briefings table + new AI entitlement keys
-- Adds morning_briefings table and extends plans features_json with
-- trade_journal, roll_advisor, greeks_coaching flags.

-- ── Morning briefings cache table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.morning_briefings (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    briefing_date date NOT NULL,
    symbols      text[] NOT NULL DEFAULT '{}',
    briefing_text text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT morning_briefings_user_date_unique UNIQUE (user_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS morning_briefings_user_id_idx ON public.morning_briefings (user_id);
CREATE INDEX IF NOT EXISTS morning_briefings_date_idx ON public.morning_briefings (briefing_date);

-- RLS
ALTER TABLE public.morning_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own briefings" ON public.morning_briefings;
CREATE POLICY "Users can read own briefings"
    ON public.morning_briefings FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own briefings" ON public.morning_briefings;
CREATE POLICY "Users can insert own briefings"
    ON public.morning_briefings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ── Extend plans features_json with new AI entitlement keys ──────────────────
-- Trade journal, roll advisor, greeks coaching: false for free/starter,
-- true for pro/enterprise. The existing keys are preserved wholesale.

UPDATE public.plans
SET features_json = features_json ||
    '{"trade_journal": false, "roll_advisor": false, "greeks_coaching": false}'::jsonb
WHERE tier_key IN ('free', 'starter');

UPDATE public.plans
SET features_json = features_json ||
    '{"trade_journal": true, "roll_advisor": true, "greeks_coaching": true}'::jsonb
WHERE tier_key IN ('pro', 'enterprise');
