ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS workflow_settings JSONB
  DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_preferences.workflow_settings IS
  'Stores Flux&File workflow preferences as JSON';
