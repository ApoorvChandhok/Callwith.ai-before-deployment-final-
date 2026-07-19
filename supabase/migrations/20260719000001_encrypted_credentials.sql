-- Migration to add an encrypted_credentials column to workspace_config
-- This column will store the AES-256-GCM encrypted payloads of the user's integrations and secrets.

ALTER TABLE public.workspace_config
  ADD COLUMN IF NOT EXISTS encrypted_credentials jsonb DEFAULT '[]'::jsonb;

-- Also add a comment for documentation
COMMENT ON COLUMN public.workspace_config.encrypted_credentials IS 'Stores AES-GCM encrypted credentials using credentials-store.ts';
