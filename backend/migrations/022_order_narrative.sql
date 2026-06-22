ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS narrative_json JSONB;
