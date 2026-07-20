import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { SipClient } from 'livekit-server-sdk'
import { SIPTransport, RoomConfiguration } from '@livekit/protocol'
import { createCredential } from '@/lib/credentials-store'

export const dynamic = 'force-dynamic'

// ── LiveKit SIP client (shared credentials, isolated resources per workspace) ─
function getSipClient() {
  const url    = process.env.LIVEKIT_URL!
  const key    = process.env.LIVEKIT_API_KEY!
  const secret = process.env.LIVEKIT_API_SECRET!
  if (!url || !key || !secret) throw new Error('LiveKit env vars not configured')
  return new SipClient(url, key, secret)
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // ── Auth + role guard ────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  const body = await request.json()
  const {
    name,
    slug,
    phone_number,
    admin_email,
    admin_name,
    rate_outbound = 0.02,
    rate_inbound  = 0.01,
    sip_domain,
    vobiz_username,
    vobiz_password,
  } = body

  if (!name || !slug || !admin_email) {
    return NextResponse.json({ error: 'name, slug, and admin_email are required' }, { status: 400 })
  }

  // ── 1. Create the business (workspace) ───────────────────────────────────────
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .insert({ name, slug, phone_number: phone_number ?? null, is_active: true })
    .select('id')
    .single()

  if (bizError) {
    if (bizError.code === '23505') {
      return NextResponse.json({ error: `Slug "${slug}" is already taken. Choose a different one.` }, { status: 409 })
    }
    return NextResponse.json({ error: bizError.message }, { status: 500 })
  }

  const businessId = business.id

  // ── 2. Set billing rates ─────────────────────────────────────────────────────
  await supabase.from('workspace_billing_rates').insert({
    business_id:           businessId,
    rate_outbound_per_min: rate_outbound,
    rate_inbound_per_min:  rate_inbound,
  })

  // ── 3. LiveKit auto-provisioning ─────────────────────────────────────────────
  // Each workspace gets its own SIP trunks + dispatch rule.
  // The LiveKit account is shared (ours); resources are isolated per workspace.
  let outboundTrunkId: string | null = null
  let inboundTrunkId:  string | null = null
  let dispatchRuleId:  string | null = null
  let provisionWarning: string | null = null

  // ── Guard: only provision if ALL 4 Vobiz credentials are present.
  // We NEVER fall back to global .env creds — doing so would mix tenant telecom
  // billing and violate workspace isolation. If creds are missing, skip and warn.
  const canProvision = !!(phone_number && sip_domain && vobiz_username && vobiz_password)

  if (canProvision) {
    try {
      const sip = getSipClient()

      // 3a. Outbound trunk — routes calls FROM this workspace through their Vobiz account
      const outboundTrunk = await sip.createSipOutboundTrunk(
        `${slug}-outbound`,
        sip_domain,           // client's own SIP domain — no .env fallback
        [phone_number],
        {
          transport:    SIPTransport.SIP_TRANSPORT_AUTO,
          authUsername: vobiz_username,  // client's own credentials
          authPassword: vobiz_password,  // client's own credentials
        }
      )
      outboundTrunkId = outboundTrunk.sipTrunkId ?? null

      // 3b. Inbound trunk — receives calls TO this workspace's DID number
      const inboundTrunk = await sip.createSipInboundTrunk(
        `${slug}-inbound`,
        [phone_number],
        {
          // Allow calls from any IP (Vobiz doesn't publish a fixed egress IP)
          allowedAddresses: [],
        }
      )
      inboundTrunkId = inboundTrunk.sipTrunkId ?? null

      // 3c. Dispatch rule — routes inbound calls on this trunk to the shared
      //     inbound-caller agent, embedding workspace_id in room metadata so
      //     the agent knows which tenant config to load from Supabase.
      if (inboundTrunkId) {
        const dispatchRule = await sip.createSipDispatchRule(
          { type: 'individual', roomPrefix: `ws-${businessId.slice(0, 8)}-` },
          {
            name:     `${slug}-dispatch`,
            trunkIds: [inboundTrunkId],
            roomConfig: new RoomConfiguration({
              // workspace_id in metadata = the key the Python agent uses to fetch
              // this workspace's config via get_workspace_config() RPC
              metadata: JSON.stringify({ workspace_id: businessId }),
            }),
          }
        )
        dispatchRuleId = dispatchRule.sipDispatchRuleId ?? null
      }
    } catch (livekitErr) {
      // Non-fatal — workspace is created, trunks can be provisioned manually later.
      console.error('[create-workspace] LiveKit provisioning failed:', livekitErr)
      provisionWarning = livekitErr instanceof Error
        ? livekitErr.message
        : 'LiveKit provisioning failed — trunks will need to be set up manually.'
    }
  } else if (phone_number) {
    // Has a phone number but missing other credentials — partial input, warn clearly
    provisionWarning = 'Telephony skipped: SIP domain, username, or password is missing. Credentials saved — provision trunks manually in workspace settings.'
  } else {
    provisionWarning = 'Telephony skipped: no DID number provided. Add Vobiz credentials later via workspace settings to enable calling.'
  }

  // ── 4. Save workspace_config (with trunk IDs if provisioned) ─────────────────
  await supabase.from('workspace_config').insert({
    business_id:          businessId,
    vobiz_did_number:     phone_number ?? null,
    livekit_trunk_id:     outboundTrunkId,
    inbound_trunk_id:     inboundTrunkId,
    dispatch_rule_id:     dispatchRuleId,
    agent_name_outbound:  'outbound-caller',
    agent_name_inbound:   'inbound-caller',
  })

  // Encrypt Vobiz Credentials
  if (vobiz_username || vobiz_password || sip_domain) {
    try {
      await createCredential(businessId, "Vobiz SIP Account", "vobiz" as any, {
        username: vobiz_username || "",
        password: vobiz_password || "",
        domain: sip_domain || "sip.vobiz.com",
      });
    } catch (err) {
      console.error("[create-workspace] Error storing encrypted credentials:", err);
    }
  }

  // ── 5. Create the invited admin profile ──────────────────────────────────────
  const { error: profileError } = await supabase.from('profiles').insert({
    email:       admin_email,
    full_name:   admin_name ?? '',
    role:        'admin',
    business_id: businessId,
  })

  if (profileError) {
    if (profileError.code === '23505') {
      return NextResponse.json(
        { error: `Email "${admin_email}" is already registered in another workspace.` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // ── 6. Send magic link invite via Supabase Admin ─────────────────────────────
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[create-workspace] Missing SUPABASE_SERVICE_ROLE_KEY in environment variables')
    return NextResponse.json({ error: 'Server configuration error: Missing SUPABASE_SERVICE_ROLE_KEY. Please add it to .env.local' }, { status: 500 })
  }

  const { createClient: createAdminClient } = await import('@supabase/supabase-js')
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(admin_email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback`,
    data: {
      full_name:   admin_name ?? '',
      business_id: businessId,
    },
  })

  if (inviteError) {
    console.error('[create-workspace] invite error:', inviteError)
    // Non-fatal — workspace created, admin can be re-invited later
  }

  // ── 7. Audit log ─────────────────────────────────────────────────────────────
  await supabase.from('admin_audit_log').insert({
    actor_id: user.id,
    action:   'create_workspace',
    target:   businessId,
    metadata: {
      name, slug, admin_email,
      livekit_trunk_id:    outboundTrunkId,
      inbound_trunk_id:    inboundTrunkId,
      provision_warning:   provisionWarning,
    },
  })

  return NextResponse.json({
    success:              true,
    business_id:          businessId,
    name,
    slug,
    livekit_trunk_id:     outboundTrunkId,
    inbound_trunk_id:     inboundTrunkId,
    provision_warning:    provisionWarning,
  })
}
