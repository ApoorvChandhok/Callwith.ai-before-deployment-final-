"use server";

import { createClient } from "./server";
import { getEffectiveBusinessId } from "./leads-actions";

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

    return (logs ?? []).map((row) => {
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
    });
  } catch (err) {
    console.error("[getCallLogsFromSupabase] exception:", err);
    return [];
  }
}
