import { NextRequest, NextResponse } from "next/server";
import { getCallLogsWithCrmStatus } from "@/lib/supabase/call-log-actions";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveBusinessId } from "@/lib/supabase/leads-actions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "25")));
    const startDate = req.nextUrl.searchParams.get("start");
    const endDate = req.nextUrl.searchParams.get("end");
    const includeCrmStatus = req.nextUrl.searchParams.get("crm_status") === "true";

    const { businessId } = await getEffectiveBusinessId();
    if (!businessId) {
      return NextResponse.json({ logs: [], total: 0, page, limit, totalPages: 0, hasMore: false });
    }

    const supabase = await createClient();

    // Build date filter range
    const from = startDate ? new Date(startDate) : null;
    if (from) from.setHours(0, 0, 0, 0);

    const to = endDate ? new Date(endDate) : null;
    if (to) to.setHours(23, 59, 59, 999);

    // ── Count query (no limit) ─────────────────────────────────────────────────
    let countQuery = supabase
      .from("call_logs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);

    if (from) countQuery = countQuery.gte("created_at", from.toISOString());
    if (to) countQuery = countQuery.lte("created_at", to.toISOString());

    const { count, error: countError } = await countQuery;
    if (countError) {
      console.error("[GET /api/call-logs] count error:", countError.message);
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // ── Data query (paginated) ─────────────────────────────────────────────────
    let dataQuery = supabase
      .from("call_logs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (from) dataQuery = dataQuery.gte("created_at", from.toISOString());
    if (to) dataQuery = dataQuery.lte("created_at", to.toISOString());

    const { data: rawLogs, error: dataError } = await dataQuery;
    if (dataError) {
      console.error("[GET /api/call-logs] data error:", dataError.message);
      return NextResponse.json({ error: dataError.message }, { status: 500 });
    }

    // Map raw rows to dashboard shape
    const mappedLogs = (rawLogs ?? []).map((row: any) => {
      let transcriptText = "";
      if (Array.isArray(row.transcript)) {
        transcriptText = row.transcript.map((m: any) => m.text).join("\n");
      } else if (typeof row.transcript === "string") {
        transcriptText = row.transcript;
      }

      return {
        id: row.id,
        timestamp: row.created_at,
        phone_number: row.from_number || row.to_number || "",
        caller_number: row.from_number || row.to_number || "",
        direction: row.direction,
        status: row.status,
        duration: row.duration,
        transcript: transcriptText,
        recording_path: row.audio_url,
        summary: row.summary,
        sentiment: row.sentiment,
        caller_intent: row.caller_intent,
        campaign_id: row.campaign_id,
        room_name: row.room_name,
        cost: 0,
        recording_cost: 0,
        transcription_cost: 0,
        ncc_cost: 0,
        did_cost: 0,
        crm_sync_status: null as string | null,
        crm_lead_id: null as string | null,
        crm_last_sync: null as string | null,
      };
    });

    // Optionally enrich with CRM sync status
    let logs = mappedLogs;
    if (includeCrmStatus && mappedLogs.length > 0) {
      try {
        // Fetch leads for phone matching (only need phone + id + updated_at)
        const { data: leads } = await supabase
          .from("leads")
          .select("phone, id, updated_at")
          .eq("business_id", businessId);

        const normalizePhone = (p: string) => (p ?? "").replace(/\D/g, "").slice(-10);

        const leadMap = new Map<string, { id: string; updatedAt: string }>();
        (leads ?? []).forEach((l: any) => {
          const n = normalizePhone(l.phone ?? "");
          if (n.length >= 7) leadMap.set(n, { id: l.id, updatedAt: l.updated_at });
        });

        logs = mappedLogs.map((log) => {
          const phone = normalizePhone(log.phone_number || log.caller_number || "");
          if (phone.length >= 7 && leadMap.has(phone)) {
            const info = leadMap.get(phone)!;
            return { ...log, crm_sync_status: "synced", crm_lead_id: info.id, crm_last_sync: info.updatedAt };
          }
          return { ...log, crm_sync_status: "not_synced" };
        });
      } catch (crmErr) {
        console.error("[GET /api/call-logs] CRM status error:", crmErr);
      }
    }

    return NextResponse.json({
      logs,
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (e: any) {
    console.error("[GET /api/call-logs]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
