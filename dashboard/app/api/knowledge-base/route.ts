import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Knowledge Base — /api/knowledge-base
// GET: List documents for a workspace
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get("businessId");
    const mode = searchParams.get("mode") || "inbound";

    if (!businessId) {
      return NextResponse.json({ error: "businessId is required" }, { status: 400 });
    }

    const params = new URLSearchParams({
      select: "id,file_name,file_type,total_chars,chunk_count,status,error_message,created_at,updated_at",
      business_id: `eq.${businessId}`,
      mode: `eq.${mode}`,
      order: "created_at.desc",
    });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base_documents?${params.toString()}`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[KB List] Supabase error:", err);
      return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
    }

    const documents = await res.json();
    return NextResponse.json({ documents });
  } catch (err: unknown) {
    console.error("[KB List]", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to list documents";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
