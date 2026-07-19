import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ---------------------------------------------------------------------------
// Gmail OAuth Callback — /api/auth/gmail/callback
// ---------------------------------------------------------------------------
// SECURITY FIX (CRIT-1): Tokens are stored server-side in Supabase and NEVER
// passed back to the client via URL query parameters. The redirect only carries
// a success/error flag — no credential data in the URL bar, browser history,
// or server access logs.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state"); // workspace_id encoded in OAuth state

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!;

  if (error || !code) {
    // Sanitize: only pass a generic error code, never the raw OAuth error message
    return NextResponse.redirect(
      `${BASE_URL}/integrations?gmail_error=access_denied`
    );
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri  = `${BASE_URL}/api/auth/gmail/callback`;

  // ── Step 1: Exchange authorization code for tokens ──────────────────────
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    // Log server-side only — never expose OAuth error details to the client
    console.error("[Gmail OAuth] Token exchange failed:", tokenRes.status);
    return NextResponse.redirect(
      `${BASE_URL}/integrations?gmail_error=token_exchange_failed`
    );
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token } = tokens;

  // ── Step 2: Fetch user profile using the access token ───────────────────
  const userRes  = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const userInfo = userRes.ok ? await userRes.json() : {};
  const email    = userInfo.email || "unknown@gmail.com";
  const name     = userInfo.name  || email;
  const picture  = userInfo.picture || "";

  // ── Step 3: Persist tokens server-side in Supabase ─────────────────────
  // Derive workspace_id from OAuth state param, or use a default
  const workspaceId = state || "default";

  const { error: dbError } = await supabaseAdmin
    .from("integrations")
    .upsert(
      {
        workspace_id: workspaceId,
        service: "gmail",
        tokens: {
          access_token,
          refresh_token,
          email,
          name,
          picture,
          connected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,service" }
    );

  if (dbError) {
    console.error("[Gmail OAuth] Failed to persist tokens:", dbError.message);
    return NextResponse.redirect(
      `${BASE_URL}/integrations?gmail_error=storage_failed`
    );
  }

  // ── Step 4: Redirect with ONLY a success flag — no token data in URL ────
  // The integrations page will reload its data from the DB via a fresh API call.
  return NextResponse.redirect(
    `${BASE_URL}/integrations?gmail_success=1&gmail_email=${encodeURIComponent(email)}`
  );
}
