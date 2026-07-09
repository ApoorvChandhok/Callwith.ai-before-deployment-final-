"use server";

import { createClient } from "./server";
import { revalidatePath } from "next/cache";
import type {
  EnrichedLead,
  LeadStatus,
  LeadPriority,
  LeadSource,
} from "@/lib/actions";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getEffectiveBusinessId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { businessId: null, user: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) return { businessId: null, user };

  let businessId = profile.business_id;

  if (profile.role === "super_admin") {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const activeWorkspaceId = cookieStore.get("active_workspace_id")?.value;
    if (activeWorkspaceId) {
      businessId = activeWorkspaceId;
    } else {
      // Fallback: use first active workspace for super_admin
      const { data: firstWorkspace } = await supabase
        .from("businesses")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (firstWorkspace?.id) {
        businessId = firstWorkspace.id;
      }
    }
  }

  return { businessId, user };
}

function mapRow(lead: Record<string, unknown>): EnrichedLead {
  return {
    timestamp:    (lead.created_at as string) ?? "",
    name:         (lead.name as string) ?? "",
    phone:        (lead.phone as string) ?? "",
    email:        (lead.email as string) ?? "",
    city:         (lead.city as string) ?? "",
    status:       (lead.status as LeadStatus) ?? "New",
    priority:     (lead.priority as LeadPriority) ?? "Medium",
    source:       (lead.source as LeadSource) ?? "Manual",
    businessType: (lead.business_type as string) ?? "Unknown",
    tags:         (lead.tags as string[]) ?? [],
    notes:        (lead.notes as EnrichedLead["notes"]) ?? [],
    assignedTo:   (lead.assigned_to as string) ?? "",
    lastActivity: (lead.last_activity_at as string) ?? (lead.created_at as string) ?? "",
    callCount:    (lead.call_count as number) ?? 0,
    sentiment:    (lead.sentiment as string) ?? "",
    callerIntent: (lead.caller_intent as string) ?? "",
  };
}

// ── READ ─────────────────────────────────────────────────────────────────────

export async function getLeadsFromSupabase(): Promise<EnrichedLead[]> {
  try {
    const { businessId } = await getEffectiveBusinessId();
    if (!businessId) return [];

    const supabase = await createClient();

    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getLeadsFromSupabase]", error.message);
      return [];
    }

    return (leads ?? []).map(mapRow);
  } catch (err) {
    console.error("[getLeadsFromSupabase]", err);
    return [];
  }
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function addLeadToSupabase(data: {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  company?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
}) {
  const supabase = await createClient();
  const { businessId, user } = await getEffectiveBusinessId();
  if (!businessId || !user) throw new Error("No business or user associated with your account");

  const { error } = await supabase.from("leads").insert({
    business_id:         businessId,
    created_by_user_id:  user.id,
    name:                data.name,
    phone:               data.phone,
    email:               data.email ?? null,
    city:                data.city ?? null,
    company:             data.company ?? null,
    status:              data.status ?? "New",
    priority:            data.priority ?? "Medium",
    source:              data.source ?? "Manual",
    last_activity_at:    new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function updateLeadInSupabase(
  phone: string,
  updates: Partial<EnrichedLead>
) {
  const supabase = await createClient();
  const { businessId } = await getEffectiveBusinessId();
  if (!businessId) throw new Error("No business associated with your account");

  const patch: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  if (updates.status   !== undefined) patch.status    = updates.status;
  if (updates.priority !== undefined) patch.priority  = updates.priority;
  if (updates.source   !== undefined) patch.source    = updates.source;
  if (updates.tags     !== undefined) patch.tags      = updates.tags;
  if (updates.notes    !== undefined) patch.notes     = updates.notes;
  if (updates.sentiment    !== undefined) patch.sentiment     = updates.sentiment;
  if (updates.callerIntent !== undefined) patch.caller_intent = updates.callerIntent;
  if (updates.assignedTo   !== undefined) patch.assigned_to  = updates.assignedTo || null;

  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("phone", phone)
    .eq("business_id", businessId);

  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function deleteLeadFromSupabase(phone: string) {
  const supabase = await createClient();
  const { businessId } = await getEffectiveBusinessId();
  if (!businessId) throw new Error("No business associated with your account");
  const { error } = await supabase.from("leads").delete().eq("phone", phone).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function bulkDeleteLeadsFromSupabase(phones: string[]) {
  const supabase = await createClient();
  const { businessId } = await getEffectiveBusinessId();
  if (!businessId) throw new Error("No business associated with your account");
  const { error } = await supabase.from("leads").delete().in("phone", phones).eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function bulkUpdateLeadsInSupabase(
  phones: string[],
  status: LeadStatus
) {
  const supabase = await createClient();
  const { businessId } = await getEffectiveBusinessId();
  if (!businessId) throw new Error("No business associated with your account");
  const { error } = await supabase
    .from("leads")
    .update({ status, last_activity_at: new Date().toISOString() })
    .in("phone", phones)
    .eq("business_id", businessId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}
