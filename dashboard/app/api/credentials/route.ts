/**
 * Credentials API — CRUD for encrypted credential storage
 *
 * GET    /api/credentials        — List all credentials (metadata only)
 * POST   /api/credentials        — Create a new credential
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  listCredentials,
  createCredential,
  type CredentialType,
} from "@/lib/credentials-store";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getWorkspaceId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("business_id")
      .eq("id", user.id)
      .single();
    return profile?.business_id ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const credentials = await listCredentials(workspaceId);
    return NextResponse.json({ credentials });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, type, data } = body;

    if (!name || !type || !data) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, data" },
        { status: 400 }
      );
    }

    const credential = await createCredential(workspaceId, name, type as CredentialType, data);
    return NextResponse.json({ credential }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
