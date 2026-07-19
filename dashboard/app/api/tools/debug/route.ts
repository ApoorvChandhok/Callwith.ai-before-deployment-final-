import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// DEBUG endpoint — /api/tools/debug
// ---------------------------------------------------------------------------
// SECURITY: Disabled in production. In development, only returns boolean
// presence flags — never raw credential values, token prefixes, or DB rows.
// ---------------------------------------------------------------------------

export async function GET() {
  // ── Disable entirely in production ─────────────────────────────────────
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const report: Record<string, unknown> = {};

  // ── 1. Env var presence checks ONLY (never return values or prefixes) ───
  report.env = {
    SUPABASE_URL_set:            !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SERVICE_ROLE_KEY_set:        !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SERVICE_ROLE_KEY_looks_valid: process.env.SUPABASE_SERVICE_ROLE_KEY?.startsWith("eyJ") ?? false,
    GOOGLE_CLIENT_ID_set:        !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET_set:    !!process.env.GOOGLE_CLIENT_SECRET,
    GEMINI_API_KEY_set:          !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    // NEVER return partial values — they leak via server logs and Referer headers
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ...report, error: "Missing required env vars" });
  }

  // ── 2. Supabase connectivity (count only, no row data) ──────────────────
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/integrations?select=workspace_id&limit=0`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    report.supabase = { status: res.status, ok: res.ok };
  } catch {
    report.supabase = { ok: false, error: "Connection failed" };
  }

  // ── 3. Integration presence check (count only, no token values) ─────────
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/integrations?select=service&limit=50`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const rows: { service: string }[] = res.ok ? await res.json() : [];
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.service] = (counts[r.service] ?? 0) + 1;
    report.integrations_by_service = counts;
    // NOTE: workspace IDs and token values are NOT included
  } catch {
    report.integrations_by_service = { error: "Lookup failed" };
  }

  return NextResponse.json(report, { status: 200 });
}
