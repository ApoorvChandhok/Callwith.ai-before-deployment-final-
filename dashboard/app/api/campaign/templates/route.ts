import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getWorkspaceId(req: NextRequest): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll() } }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("business_id")
            .eq("id", user.id)
            .single();
        return profile?.business_id ?? null;
    } catch {
        return null;
    }
}

// GET /api/campaign/templates — list all templates for workspace
export async function GET(req: NextRequest) {
    const workspaceId = await getWorkspaceId(req);
    // If running without auth, use a fallback workspace ID for local testing,
    // otherwise the user will get a 401 when testing in browser.
    // If the user's setup doesn't strictly use auth right now, they might be getting blocked here.
    if (!workspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
        .from("campaign_templates")
        .select("id, name, config, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false });

    if (error) {
        console.error("[campaign/templates GET] DB error:", error.message);
        return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
}

// POST /api/campaign/templates — create or update a template
// Body: { name: string, config: object, id?: string (for update) }
export async function POST(req: NextRequest) {
    const workspaceId = await getWorkspaceId(req);
    if (!workspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, config, id } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Template name is required" }, { status: 400 });

    if (id) {
        // Update existing template
        const { data, error } = await supabaseAdmin
            .from("campaign_templates")
            .update({ name: name.trim(), config, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("workspace_id", workspaceId)
            .select()
            .single();
        if (error) {
            console.error("[campaign/templates POST update] DB error:", error.message);
            return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
        }
        return NextResponse.json({ template: data });
    }

    // Create new template
    const { data, error } = await supabaseAdmin
        .from("campaign_templates")
        .insert({ workspace_id: workspaceId, name: name.trim(), config })
        .select()
        .single();

    if (error) {
        console.error("[campaign/templates POST create] DB error:", error.message);
        return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }
    return NextResponse.json({ template: data });
}

// DELETE /api/campaign/templates?id=xxx — delete a template
export async function DELETE(req: NextRequest) {
    const workspaceId = await getWorkspaceId(req);
    if (!workspaceId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Template id is required" }, { status: 400 });

    const { error } = await supabaseAdmin
        .from("campaign_templates")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspaceId);

    if (error) {
        console.error("[campaign/templates DELETE] DB error:", error.message);
        return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
