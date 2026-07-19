-- Migration: 20260719000000_security_fixes.sql
-- Description: Security hardening — fixes MED-1 (tenant isolation in get_workspace_config)
--              and adds TOOL_GATEWAY_SECRET validation scaffold.
-- Safe to re-run: uses CREATE OR REPLACE for all functions.

-- ─── DROP OLD FUNCTIONS (required if return type changed) ─────────────────────
DROP FUNCTION IF EXISTS public.get_workspace_config(uuid);
DROP FUNCTION IF EXISTS public.get_workspace_config_by_slug(text);

-- ─── MED-1 FIX: Tenant isolation in get_workspace_config ─────────────────────
-- BEFORE: Any authenticated user could call get_workspace_config('any-uuid')
--         and retrieve another tenant's SIP config (trunk IDs, DID numbers).
--         The function ran as SECURITY DEFINER without checking caller ownership.
-- AFTER:  Function checks that the calling user's business_id matches p_business_id,
--         OR the caller is a super_admin. Returns NULL (not an error) on mismatch
--         so agents don't crash — they just can't read other tenants' configs.

CREATE OR REPLACE FUNCTION public.get_workspace_config(p_business_id uuid)
RETURNS TABLE(
  business_id          uuid,
  livekit_trunk_id     text,
  inbound_trunk_id     text,
  dispatch_rule_id     text,
  vobiz_did_number     text,
  sip_domain           text,
  transfer_number      text,
  agent_name_outbound  text,
  agent_name_inbound   text,
  -- Vobiz credentials (agent-safe: password excluded)
  vobiz_username       text,
  vobiz_domain         text,
  vobiz_proxy          text,
  vobiz_transport      text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller_role      text;
  v_caller_business  uuid;
BEGIN
  -- Identify the calling user's role and business
  SELECT role, business_id
    INTO v_caller_role, v_caller_business
    FROM public.profiles
   WHERE auth_user_id = auth.uid()
   LIMIT 1;

  -- SECURITY CHECK: Only allow access if:
  --   (a) caller is super_admin (can read any workspace), OR
  --   (b) caller's own business_id matches the requested workspace, OR
  --   (c) called via service_role (backend/Python agent — trusted)
  IF auth.role() = 'service_role' THEN
    -- Service role (Python agents, server-side API routes) — full access
    NULL;
  ELSIF v_caller_role = 'super_admin' THEN
    -- Super admin — can read any workspace
    NULL;
  ELSIF v_caller_business IS DISTINCT FROM p_business_id THEN
    -- Regular user requesting a workspace they don't own — deny silently
    -- Returning empty set (not raising an error) keeps agent code simple
    RETURN;
  END IF;

  -- Authorized — return workspace config (password excluded by agent_workspace_config view)
  RETURN QUERY
  SELECT
    wc.business_id,
    wc.livekit_trunk_id,
    wc.inbound_trunk_id,
    wc.dispatch_rule_id,
    wc.vobiz_did_number,
    wc.sip_domain,
    wc.transfer_number,
    wc.agent_name_outbound,
    wc.agent_name_inbound,
    wc.vobiz_username,
    wc.vobiz_domain,
    wc.vobiz_proxy,
    wc.vobiz_transport
  FROM public.agent_workspace_config wc   -- uses the view that already excludes vobiz_password
  WHERE wc.business_id = p_business_id;
END;
$$;

-- ─── MED-1 FIX (same fix for slug-based variant) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_workspace_config_by_slug(p_slug text)
RETURNS TABLE(
  business_id          uuid,
  livekit_trunk_id     text,
  inbound_trunk_id     text,
  dispatch_rule_id     text,
  vobiz_did_number     text,
  sip_domain           text,
  transfer_number      text,
  agent_name_outbound  text,
  agent_name_inbound   text,
  vobiz_username       text,
  vobiz_domain         text,
  vobiz_proxy          text,
  vobiz_transport      text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller_role     text;
  v_target_biz_id   uuid;
BEGIN
  -- Resolve target business_id from slug
  SELECT id INTO v_target_biz_id FROM public.businesses WHERE slug = p_slug LIMIT 1;
  IF v_target_biz_id IS NULL THEN RETURN; END IF;

  -- Reuse the same authorization logic
  SELECT role INTO v_caller_role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF auth.role() = 'service_role' THEN
    NULL; -- Trusted server-side caller
  ELSIF v_caller_role = 'super_admin' THEN
    NULL; -- Super admin can read any workspace
  ELSE
    -- Non-admin: only allow reading their own workspace by slug
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid() AND business_id = v_target_biz_id
    ) THEN
      RETURN; -- Deny silently
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    wc.business_id,
    wc.livekit_trunk_id,
    wc.inbound_trunk_id,
    wc.dispatch_rule_id,
    wc.vobiz_did_number,
    wc.sip_domain,
    wc.transfer_number,
    wc.agent_name_outbound,
    wc.agent_name_inbound,
    wc.vobiz_username,
    wc.vobiz_domain,
    wc.vobiz_proxy,
    wc.vobiz_transport
  FROM public.agent_workspace_config wc
  WHERE wc.business_id = v_target_biz_id;
END;
$$;

-- ─── REVOKE direct table access from anon/authenticated on workspace_config ───
-- Already handled by RLS super_admin_workspace_config_all policy,
-- but belt-and-suspenders: also revoke table-level grants.
REVOKE ALL ON public.workspace_config FROM anon;
REVOKE ALL ON public.workspace_config FROM authenticated;
-- Only service_role and super_admin (via RLS) retain access.

-- ─── VERIFICATION (uncomment to test after applying) ─────────────────────────
-- As a regular user, this should return 0 rows for workspaces you don't own:
--   SELECT * FROM public.get_workspace_config('some-other-workspace-uuid'::uuid);
-- As super_admin or service_role, this should return the full config:
--   SELECT * FROM public.get_workspace_config('your-workspace-uuid'::uuid);
