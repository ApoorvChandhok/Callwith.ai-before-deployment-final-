"use server";

import { createClient } from "./server";
import { getEffectiveBusinessId } from "./leads-actions";

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapCallLogRow(row: Record<string, any>): any {
  // Map Supabase columns back to what the dashboard expects
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
    // Fake cost fields to not break UI if Vobiz data is missing
    cost: 0,
    recording_cost: 0,
    transcription_cost: 0,
    ncc_cost: 0,
    did_cost: 0,
  };
}

export async function getCallLogsFromSupabase(): Promise<any[]> {
  try {
    const { businessId } = await getEffectiveBusinessId();
    if (!businessId) return [];

    const supabase = await createClient();

    const { data: logs, error } = await supabase
      .from("call_logs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getCallLogsFromSupabase] error:", error.message);
      return [];
    }

    return (logs ?? []).map(mapCallLogRow);
  } catch (err) {
    console.error("[getCallLogsFromSupabase] exception:", err);
    return [];
  }
}

export async function updateCallLogAudioUrlInSupabase(id: string, audioUrl: string): Promise<boolean> {
  try {
    const { businessId } = await getEffectiveBusinessId();
    if (!businessId) return false;

    const supabase = await createClient();

    const { error } = await supabase
      .from("call_logs")
      .update({ audio_url: audioUrl })
      .eq("id", id)
      .eq("business_id", businessId);

    if (error) {
      console.error("[updateCallLogAudioUrlInSupabase] error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[updateCallLogAudioUrlInSupabase] exception:", err);
    return false;
  }
}

// ── CRM Sync Status ──────────────────────────────────────────────────────────

// Normalize phone: strip non-digit chars, take last 10 digits for matching
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

export async function getCallLogsWithCrmStatus(): Promise<any[]> {
  try {
    const { businessId } = await getEffectiveBusinessId();
    if (!businessId) return [];

    const supabase = await createClient();

    // Fetch all call logs
    const { data: logs, error: logsError } = await supabase
      .from("call_logs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (logsError) {
      console.error("[getCallLogsWithCrmStatus] logs error:", logsError.message);
      return [];
    }

    // Fetch all leads for this business (for CRM sync status check)
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("phone, id, updated_at")
      .eq("business_id", businessId);

    if (leadsError) {
      console.error("[getCallLogsWithCrmStatus] leads error:", leadsError.message);
      // Return logs without sync status if leads fetch fails
      return (logs ?? []).map(mapCallLogRow);
    }

    // Create a map of normalized phone numbers to lead IDs for quick lookup
    const leadsByPhone = new Map<string, { id: string; updatedAt: string }>();
    (leads ?? []).forEach((lead) => {
      const normalized = normalizePhone(lead.phone || "");
      if (normalized.length >= 7) {
        leadsByPhone.set(normalized, { id: lead.id, updatedAt: lead.updated_at });
      }
    });

    // Map logs with CRM sync status
    return (logs ?? []).map((row) => {
      const log = mapCallLogRow(row);
      const callerPhone = log.phone_number || log.caller_number || "";
      const normalizedCallerPhone = normalizePhone(callerPhone);

      if (normalizedCallerPhone.length >= 7 && leadsByPhone.has(normalizedCallerPhone)) {
        const leadInfo = leadsByPhone.get(normalizedCallerPhone)!;
        log.crm_sync_status = "synced";
        log.crm_lead_id = leadInfo.id;
        log.crm_last_sync = leadInfo.updatedAt;
      } else {
        log.crm_sync_status = "not_synced";
        log.crm_lead_id = null;
        log.crm_last_sync = null;
      }

      return log;
    });
  } catch (err) {
    console.error("[getCallLogsWithCrmStatus] exception:", err);
    return [];
  }
}

// ── Vobiz → Supabase Sync ────────────────────────────────────────────────────

function parseVobizSentimentLocal(sentiment: any): string {
  if (typeof sentiment !== "string") return "Neutral";
  const s = sentiment.trim();
  const lower = s.toLowerCase();
  if (lower === "positive" || lower === "negative" || lower === "neutral") {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  // Parse "CUSTOMER:2.9, AGENT:3.0" format
  const customerMatch = s.match(/CUSTOMER:\s*([0-9.]+)/i);
  const agentMatch = s.match(/AGENT:\s*([0-9.]+)/i);
  if (customerMatch) {
    const custScore = parseFloat(customerMatch[1]);
    const agentScore = agentMatch ? parseFloat(agentMatch[1]) : custScore;
    const avg = (custScore + agentScore) / 2;
    if (avg >= 3.5) return "Positive";
    if (avg <= 2.5) return "Negative";
    return "Neutral";
  }
  return "Neutral";
}

async function fetchVobizCdrs(authId: string, headers: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  // Note: Vobiz /cdr uses 'page' (1-indexed) and 'per_page', unlike /cdr/recent which ignores offset.
  for (let page = 1; page <= 50; page++) {
    try {
      const res = await fetch(
        `https://api.vobiz.ai/api/v1/Account/${authId}/cdr?per_page=100&page=${page}`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) break;
      const json = await res.json();
      const items: any[] = json?.data ?? [];
      if (!json?.success || items.length === 0) break;
      all.push(...items);
      // Check pagination info from Vobiz to exit early
      const pagination = json?.pagination;
      if (pagination && !pagination.has_next) break;
      if (!pagination && items.length < 100) break;
    } catch { break; }
  }
  // Deduplicate by sip_call_id, keep longest duration
  const map = new Map<string, any>();
  for (const cdr of all) {
    const key = cdr.sip_call_id || cdr.uuid;
    if (!key) continue;
    const ex = map.get(key);
    if (!ex || (cdr.duration || 0) > (ex.duration || 0)) map.set(key, cdr);
  }
  return Array.from(map.values());
}

async function fetchVobizTranscripts(authId: string, headers: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    try {
      const res = await fetch(
        `https://api.vobiz.ai/api/v1/Account/${authId}/Transcriptions/?limit=100&offset=${offset}`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) break;
      const json = await res.json();
      const items: any[] = json?.objects ?? json?.data ?? json?.results ?? [];
      if (items.length === 0) break;
      all.push(...items);
      offset += items.length;
      if (items.length < 100) break;
    } catch { break; }
  }
  return all;
}

async function fetchVobizRecordings(authId: string, headers: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    try {
      const res = await fetch(
        `https://api.vobiz.ai/api/v1/Account/${authId}/Recording/?limit=100&offset=${offset}`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) break;
      const json = await res.json();
      const items: any[] = json?.objects ?? json?.data ?? json?.results ?? [];
      if (items.length === 0) break;
      all.push(...items);
      offset += items.length;
      if (items.length < 100) break;
    } catch { break; }
  }
  return all;
}

export interface SyncResult {
  upserted: number;
  errors: number;
  total: number;
  message: string;
}

/**
 * Pulls all CDRs from Vobiz and upserts them into the Supabase call_logs table.
 * Uses cdr.uuid as the primary key so repeated calls are idempotent.
 */
export async function syncVobizToSupabase(): Promise<SyncResult> {
  const empty: SyncResult = { upserted: 0, errors: 0, total: 0, message: "" };

  const authId = process.env.VOBIZ_AUTH_ID;
  const authToken = process.env.VOBIZ_AUTH_TOKEN;
  if (!authId || !authToken || authId === "your_auth_id_here") {
    return { ...empty, message: "Vobiz credentials not configured (VOBIZ_AUTH_ID / VOBIZ_AUTH_TOKEN)" };
  }

  const { businessId } = await getEffectiveBusinessId();
  if (!businessId) {
    return { ...empty, message: "No business ID — are you logged in?" };
  }

  const supabase = await createClient();
  const vobizHeaders = {
    "X-Auth-ID": authId,
    "X-Auth-Token": authToken,
    Accept: "application/json",
  };

  // Fetch all Vobiz data in parallel
  let cdrs: any[] = [];
  let transcripts: any[] = [];
  let recordings: any[] = [];
  try {
    [cdrs, transcripts, recordings] = await Promise.all([
      fetchVobizCdrs(authId, vobizHeaders),
      fetchVobizTranscripts(authId, vobizHeaders),
      fetchVobizRecordings(authId, vobizHeaders),
    ]);
  } catch (err) {
    console.error("[syncVobizToSupabase] fetch error:", err);
    return { ...empty, message: `Vobiz fetch failed: ${err}` };
  }

  if (cdrs.length === 0) {
    return { ...empty, message: "No CDRs found in Vobiz account" };
  }

  // Build lookup maps
  const txMap = new Map<string, any>();
  for (const t of transcripts) {
    const key = t.call_uuid || t.sip_call_id;
    if (key) txMap.set(key, t);
  }
  const recMap = new Map<string, any>();
  for (const r of recordings) {
    const key = r.call_uuid || r.sip_call_id;
    if (key) recMap.set(key, r);
  }

  let upserted = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < cdrs.length; i += BATCH) {
    const batch = cdrs.slice(i, i + BATCH);
    const rows = batch.map((cdr: any) => {
      const tx = txMap.get(cdr.sip_call_id) ?? txMap.get(cdr.uuid);
      const rec = recMap.get(cdr.sip_call_id) ?? recMap.get(cdr.uuid);
      const isInbound = (cdr.call_direction ?? "").toLowerCase() === "inbound";

      return {
        id: cdr.uuid,
        business_id: businessId,
        from_number: isInbound ? cdr.caller_id_number : cdr.destination_number,
        to_number: isInbound ? cdr.destination_number : cdr.caller_id_number,
        direction: cdr.call_direction ?? "inbound",
        status: cdr.hangup_cause_name ?? "Completed",
        duration: typeof cdr.duration === "number"
          ? cdr.duration
          : parseInt(cdr.duration ?? "0", 10),
        transcript: tx?.transcription_text ?? "",
        summary: tx?.summary ?? "",
        sentiment: tx?.sentiment ? parseVobizSentimentLocal(tx.sentiment) : "Neutral",
        audio_url: rec?.url ?? rec?.recording_url ?? rec?.audio_url ?? null,
        room_name: cdr.sip_call_id ?? null,
        created_at: cdr.start_time ?? new Date().toISOString(),
        caller_intent: null,
        campaign_id: null,
      };
    });

    const { error } = await supabase
      .from("call_logs")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: false });

    if (error) {
      console.error("[syncVobizToSupabase] upsert error:", error.message);
      errors += batch.length;
    } else {
      upserted += batch.length;
    }
  }

  return {
    upserted,
    errors,
    total: cdrs.length,
    message: `Synced ${upserted} of ${cdrs.length} CDRs from Vobiz${errors > 0 ? ` (${errors} errors)` : ""}`,
  };
}
