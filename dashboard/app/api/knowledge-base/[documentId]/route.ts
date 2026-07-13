import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Knowledge Base Document — /api/knowledge-base/[documentId]
// DELETE: Remove a document and all its chunks (cascading via FK)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;

    if (!documentId) {
      return NextResponse.json({ error: "documentId is required" }, { status: 400 });
    }

    // Delete the document — chunks are cascade-deleted via FK
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge_base_documents?id=eq.${documentId}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[KB Delete] Supabase error:", err);
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
    }

    console.log(`[KB Delete] ✅ Deleted document ${documentId}`);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[KB Delete]", err);
    const errorMessage = err instanceof Error ? err.message : "Failed to delete document";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
