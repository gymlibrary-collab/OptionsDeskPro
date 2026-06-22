-- Add trading_desk_enabled flag to platform_settings
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS trading_desk_enabled BOOLEAN NOT NULL DEFAULT TRUE;
