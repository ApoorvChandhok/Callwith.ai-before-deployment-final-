-- Migration: Add AI analysis columns to call_logs table
-- These are populated by analytics.py after every call via Groq analysis

ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS sentiment     text DEFAULT 'Neutral',
  ADD COLUMN IF NOT EXISTS summary       text,
  ADD COLUMN IF NOT EXISTS caller_intent text,
  ADD COLUMN IF NOT EXISTS campaign_id   text,
  ADD COLUMN IF NOT EXISTS room_name     text;

-- Index for filtering by campaign
CREATE INDEX IF NOT EXISTS idx_call_logs_campaign_id ON public.call_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_direction   ON public.call_logs(direction);
