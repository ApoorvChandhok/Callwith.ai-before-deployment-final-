import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveBusinessId } from "@/lib/supabase/leads-actions";

// ── Phone normalization ─────────────────────────────────────────────────────
// Strip all non-digit chars, take last 10 digits for matching
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

interface CrmResult {
  phone_number: string;
  lead_email?: string;
  lead_name?: string;
  lead_data?: Record<string, string>;
  status?: string;
  remarks?: string;
  sentiment?: string;
  intent?: string;
  interested_projects?: string[];
  brochure_sent?: string;
  campaign_id?: string;
}

// ── POST /api/real-estate/crm-sync ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Get business_id using the same logic as other endpoints
    const { businessId, user } = await getEffectiveBusinessId();

    console.log("[CRM Sync] User:", user?.id || "null");
    console.log("[CRM Sync] Business ID:", businessId || "null");

    if (!user) {
      console.error("[CRM Sync] No user found in session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!businessId) {
      console.error("[CRM Sync] No business_id found for user:", user.id);
      console.error("[CRM Sync] This means your profile doesn't have a business_id set.");
      console.error("[CRM Sync] Please check your profile in the profiles table in Supabase.");
      return NextResponse.json({
        error: "No workspace found. Please ensure you have an active workspace assigned to your profile.",
        details: "Your user ID: " + user.id
      }, { status: 403 });
    }

    // Create Supabase client for database operations
    const supabase = await createClient();

    const { results } = await req.json();

    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ error: "results array is required" }, { status: 400 });
    }

    const synced = { created: 0, updated: 0, errors: 0 };

    for (const result of results) {
      try {
        const phone = result.phone_number?.trim();
        if (!phone) continue;

        const normalized = normalizePhone(phone);
        if (normalized.length < 7) continue; // skip invalid numbers

        // Parse name
        const fullName = result.lead_name?.trim() || "";
        const nameParts = fullName.split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ") || "";

        // Build custom_fields for real estate
        const customFields: Record<string, any> = {
          ...(result.lead_data || {}),
          email: result.lead_email || result.lead_data?.email || "",
          last_call_date: new Date().toISOString(),
          last_sentiment: result.sentiment || "",
          last_intent: result.intent || "",
          call_status: result.status === "Called" ? "contacted" :
                      result.status === "No Answer" ? "no_answer" : "failed",
          brochure_sent: result.brochure_sent || "",
          interested_projects: result.interested_projects || [],
          property_requirements: result.property_requirements || {},
          source_campaign: result.campaign_id || "",
          notes: result.remarks || "",
        };

        // Remove csv_data from custom_fields to avoid duplication
        delete customFields.csv_data;

        // Check if lead exists by normalized phone (match last 10 digits)
        const { data: existing } = await supabase
          .from("leads")
          .select("id, custom_fields")
          .eq("business_id", businessId)
          .like("phone", `%${normalized}`)
          .limit(1)
          .maybeSingle();

        if (existing) {
          // UPDATE: merge custom_fields
          const merged = {
            ...(existing.custom_fields || {}),
            ...customFields,
            call_count: ((existing.custom_fields as any)?.call_count || 0) + 1,
          };

          const { error: updateError } = await supabase
            .from("leads")
            .update({
              first_name: firstName || undefined,
              last_name: lastName || undefined,
              custom_fields: merged,
              status: customFields.call_status === "contacted" ? "Contacted" : undefined,
            })
            .eq("id", existing.id);

          if (updateError) throw new Error(`Update failed: ${updateError.message}`);
          synced.updated++;
        } else {
          // INSERT: new lead
          const { error: insertError } = await supabase
            .from("leads")
            .insert({
              business_id: businessId,
              first_name: firstName,
              last_name: lastName,
              phone: phone, // store original format
              status: "New",
              custom_fields: {
                ...customFields,
                call_count: 1,
                normalized_phone: normalized,
              },
            });

          if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
          synced.created++;
        }
      } catch (err: any) {
        console.error(`[CRM Sync] Error processing ${result.phone_number}:`, err.message);
        synced.errors++;
      }
    }

    console.log(`[CRM Sync] Business ${businessId}: ${synced.created} created, ${synced.updated} updated, ${synced.errors} errors`);

    return NextResponse.json({ success: true, ...synced });
  } catch (err: any) {
    console.error("[CRM Sync]", err);
    return NextResponse.json({ error: err.message || "CRM sync failed" }, { status: 500 });
  }
}
