import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ── GET /api/real-estate/crm-leads ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("business_id")
      .eq("auth_user_id", user.id)
      .single();

    if (!profile?.business_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    let query = supabase
      .from("leads")
      .select("*")
      .eq("business_id", profile.business_id)
      .order("updated_at", { ascending: false })
      .limit(200);

    // Search by phone or name
    if (search) {
      query = query.or(`phone.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    // Filter by status
    if (status) {
      query = query.eq("status", status);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error("[CRM Leads]", error);
      return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [] });
  } catch (err: any) {
    console.error("[CRM Leads]", err);
    return NextResponse.json({ error: err.message || "Failed to fetch leads" }, { status: 500 });
  }
}
