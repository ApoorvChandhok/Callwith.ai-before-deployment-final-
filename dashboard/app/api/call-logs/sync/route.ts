import { NextResponse } from "next/server";
import { syncVobizToSupabase } from "@/lib/supabase/call-log-actions";

export const dynamic = "force-dynamic";

/**
 * POST /api/call-logs/sync
 * Pulls all CDRs / transcripts / recordings from Vobiz and upserts them
 * into the Supabase call_logs table for the logged-in business.
 *
 * Returns:
 *   { upserted, errors, total, message }
 */
export async function POST() {
  try {
    const result = await syncVobizToSupabase();
    const status = result.errors > 0 && result.upserted === 0 ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (err: any) {
    console.error("[POST /api/call-logs/sync]", err);
    return NextResponse.json(
      { upserted: 0, errors: 1, total: 0, message: err.message ?? "Sync failed" },
      { status: 500 }
    );
  }
}
