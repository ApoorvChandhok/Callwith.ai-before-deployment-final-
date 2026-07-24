import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveBusinessId } from "@/lib/supabase/leads-actions";
import { analyzeTranscript } from "@/lib/groq-analyzer";

export const dynamic = "force-dynamic";

/**
 * POST /api/call-logs/enrich
 *
 * Finds calls with missing transcript or sentiment, runs Gemini analysis,
 * and stores results back in Supabase. Processes in batches to avoid timeouts.
 *
 * Query params:
 *   ?limit=20  — max calls to enrich per request (default 50, max 100)
 *   ?force=true — re-analyze even if sentiment already exists
 *   ?ids=id1,id2,id3 — enrich specific call IDs only (targeted enrichment)
 */
export async function POST(req: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50")));
    const force = req.nextUrl.searchParams.get("force") === "true";
    const idsParam = req.nextUrl.searchParams.get("ids");
    const targetIds = idsParam ? idsParam.split(",").filter(Boolean) : null;

    const { businessId } = await getEffectiveBusinessId();
    if (!businessId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const supabase = await createClient();

    let calls: any[] = [];

    if (targetIds && targetIds.length > 0) {
      // ── Targeted enrichment: fetch only the specified IDs ──────────────────
      const { data, error: fetchError } = await supabase
        .from("call_logs")
        .select("id, transcript, sentiment, summary, caller_intent")
        .eq("business_id", businessId)
        .in("id", targetIds);

      if (fetchError) {
        console.error("[Enrich] Fetch error (targeted):", fetchError.message);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }
      calls = data ?? [];
    } else {
      // ── Global enrichment: fetch latest N calls that need enrichment ────────
      // Fetch a larger window so we can filter to those needing enrichment
      const { data, error: fetchError } = await supabase
        .from("call_logs")
        .select("id, transcript, sentiment, summary, caller_intent")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(500); // Wider window to catch more un-enriched calls

      if (fetchError) {
        console.error("[Enrich] Fetch error:", fetchError.message);
        return NextResponse.json({ error: fetchError.message }, { status: 500 });
      }
      calls = data ?? [];
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json({
        enriched: 0,
        skipped: 0,
        message: "No calls found to enrich",
      });
    }

    // Filter to calls that actually need enrichment
    const needsEnrichment = calls.filter((call) => {
      // Parse transcript — it may be JSON array, string, or null
      let transcriptText = "";
      if (Array.isArray(call.transcript)) {
        transcriptText = call.transcript.map((m: any) => m?.text || "").join("\n");
      } else if (typeof call.transcript === "string") {
        transcriptText = call.transcript;
      }

      // Has no transcript at all — cannot enrich
      if (!transcriptText || transcriptText.trim().length < 10) return false;

      if (force) return true;

      // Needs enrichment if any of these fields are missing/default
      const hasBadSentiment = !call.sentiment || call.sentiment === "Neutral";
      const hasBadSummary = !call.summary || call.summary.length < 10;
      const hasNoIntent = !call.caller_intent;

      return hasBadSentiment || hasBadSummary || hasNoIntent;
    }).slice(0, targetIds ? targetIds.length : limit);

    if (needsEnrichment.length === 0) {
      return NextResponse.json({
        enriched: 0,
        skipped: calls.length,
        message: "All fetched calls already enriched",
      });
    }

    let enriched = 0;
    let skipped = 0;
    let errors = 0;
    const enrichedResults: Record<string, { sentiment?: string; summary?: string; caller_intent?: string }> = {};

    for (const call of needsEnrichment) {
      // Parse transcript from JSON array or string
      let transcriptText = "";
      if (Array.isArray(call.transcript)) {
        transcriptText = call.transcript.map((m: any) => m?.text || "").join("\n");
      } else if (typeof call.transcript === "string") {
        transcriptText = call.transcript;
      }

      try {
        const analysis = await analyzeTranscript(transcriptText);
        if (!analysis) {
          skipped++;
          continue;
        }

        const updateData: Record<string, any> = {};

        // Always update if force, or if current value is missing/default
        if (force || !call.sentiment || call.sentiment === "Neutral") {
          updateData.sentiment = analysis.sentiment || call.sentiment;
        }
        if (force || !call.summary || call.summary.length < 10) {
          updateData.summary = analysis.short_summary || call.summary;
        }
        if (force || !call.caller_intent) {
          updateData.caller_intent = analysis.lead_info?.intent || call.caller_intent;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from("call_logs")
            .update(updateData)
            .eq("id", call.id)
            .eq("business_id", businessId);

          if (updateError) {
            console.error(`[Enrich] Update error for ${call.id}:`, updateError.message);
            errors++;
          } else {
            enriched++;
            // Return enriched data to the client so it can update state immediately
            enrichedResults[call.id] = updateData;
          }
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`[Enrich] Analysis error for ${call.id}:`, err);
        errors++;
      }
    }

    const result = {
      enriched,
      skipped,
      errors,
      total: calls.length,
      enrichedResults, // Client can use this to update local state without re-fetching
      message: `Enriched ${enriched} of ${calls.length} calls (${skipped} skipped, ${errors} errors)`,
    };

    console.log(`[Enrich] ${result.message}`);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Enrich] Fatal error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
