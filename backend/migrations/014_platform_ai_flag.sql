-- Add ai_features_enabled flag to platform_settings
ALTER TABLE public.platform_settings
    ADD COLUMN IF NOT EXISTS ai_features_enabled BOOLEAN NOT NULL DEFAULT TRUE;
