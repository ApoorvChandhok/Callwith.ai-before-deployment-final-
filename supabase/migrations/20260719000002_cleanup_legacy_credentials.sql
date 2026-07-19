-- Cleanup migration to remove legacy plaintext vobiz columns.
-- These credentials should now be stored in the encrypted_credentials JSONB column.

ALTER TABLE public.workspace_config
  DROP COLUMN IF EXISTS sip_domain,
  DROP COLUMN IF EXISTS vobiz_username,
  DROP COLUMN IF EXISTS vobiz_password;
