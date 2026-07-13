import { NextResponse } from 'next/server';
import { sipClient, roomService, agentDispatchClient } from '@/lib/server-utils';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("business_id, role")
            .eq("auth_user_id", user.id)
            .single();

        let workspaceId = profile?.business_id;

        if (profile?.role === "super_admin") {
            const cookieStore = await cookies();
            const activeWorkspaceId = cookieStore.get("active_workspace_id")?.value;
            if (activeWorkspaceId) {
                workspaceId = activeWorkspaceId;
            } else {
                // No cookie set — fall back to first available workspace
                const { data: firstWorkspace } = await supabase
                    .from("businesses")
                    .select("id")
                    .eq("is_active", true)
                    .order("created_at", { ascending: true })
                    .limit(1)
                    .single();
                if (firstWorkspace?.id) {
                    workspaceId = firstWorkspace.id;
                    console.log(`[DISPATCH] super_admin fallback workspace: ${workspaceId}`);
                }
            }
        }

        if (!workspaceId) {
            return NextResponse.json({ error: "No workspace associated with your account. Please create a workspace first." }, { status: 403 });
        }

        const body = await request.json();
        const { phoneNumber, prompt, modelProvider, voice } = body;

        // Campaign / lead enrichment fields (optional — used by BulkDialer + Workflow engine)
        const leadName       = body.leadName       || "";
        const leadEmail      = body.leadEmail      || "";
        const leadData       = body.leadData       || {};   // extra columns from spreadsheet
        const ragContent     = body.ragContent     || "";   // extracted text from RAG file
        const campaignId     = body.campaignId     || "";   // ties call log to campaign result file
        const leadRowIndex   = body.leadRowIndex   ?? -1;   // row number in original leads file
        const workflowRunId  = body.workflowRunId  || "";   // set when triggered from Workflow engine
        
        const overrideSystemPrompt = body.overrideSystemPrompt || false;
        const greeting             = body.greeting || "";
        const agentName            = body.agentName || "";

        // ── Dynamic per-call agent config (set from UI on every call) ─────────
        // These override the static data/agent_config.json on the Python side.
        const systemPrompt    = body.systemPrompt    || "";   // full system prompt from UI
        const llmModel        = body.llmModel        || "";   // e.g. "llama-3.3-70b-versatile"
        const llmTemperature  = body.llmTemperature  ?? null; // e.g. 0.7
        const initialGreeting = body.initialGreeting || greeting; // primary greeting field
        const fallbackGreeting = body.fallbackGreeting || "";

        if (!phoneNumber) {
            return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
        }

        // Fetch workspace's SIP trunk from DB (multi-tenant architecture).
        // The Python agent handles the actual SIP dial-out using this trunk ID.
        // We validate here so the user gets a clear error before the room is created.
        const { data: wsConfig } = await supabase
            .from("workspace_config")
            .select("livekit_trunk_id")
            .eq("business_id", workspaceId)
            .single();

        const trunkId = wsConfig?.livekit_trunk_id ?? process.env.VOBIZ_SIP_TRUNK_ID;
        if (!trunkId) {
            console.warn(`[DISPATCH] No SIP trunk for workspace ${workspaceId} — telephony not provisioned`);
            return NextResponse.json({ error: "SIP Trunk not configured for this workspace. Please provision telephony in Super Admin settings." }, { status: 503 });
        }

        console.log(`[DISPATCH] Using trunk ${trunkId} for workspace ${workspaceId}`);

        // Generate a unique room name for this call with workspace ID embedded
        const shortWorkspaceId = workspaceId.slice(0, 8);
        const roomName = `ws-${shortWorkspaceId}-${Date.now()}`;
        const participantIdentity = `sip_${phoneNumber}`;

        // Check if workspace has embedded knowledge base (for dynamic RAG)
        let hasDynamicRag = false;
        try {
            const { data: kbDocs } = await supabase
                .from("knowledge_base_documents")
                .select("id")
                .eq("business_id", workspaceId)
                .eq("status", "ready")
                .limit(1);
            hasDynamicRag = !!(kbDocs && kbDocs.length > 0);
        } catch {
            // Table may not exist yet — graceful fallback
        }

        const metadata = JSON.stringify({
            phone_number:     phoneNumber,
            user_prompt:      prompt || systemPrompt || "",  // pass system prompt as user_prompt too, so Python agent uses it directly
            model_provider:   modelProvider || "openrouter",
            voice_id:         voice || "alloy",
            tts_provider:     body.ttsProvider,
            tts_language:     body.ttsLanguage,
            tts_speed:        body.ttsSpeed,
            workspace_id:     workspaceId,
            triggered_by:     user.email,
            // Campaign / lead enrichment (populated by BulkDialer & Workflow engine)
            lead_name:        leadName,
            lead_email:       leadEmail,
            lead_data:        leadData,
            rag_content:      ragContent,
            campaign_id:      campaignId,
            lead_row_index:   leadRowIndex,
            workflow_run_id:  workflowRunId,
            override_system_prompt: overrideSystemPrompt,
            initial_greeting: initialGreeting,
            agent_name:       agentName,
            // Dynamic RAG flag — tells agent to use search_knowledge_base tool
            has_dynamic_rag:  hasDynamicRag,
            // ── Dynamic per-call agent config from UI ──────────────────────────
            // Python agents read these and override ws_config fields directly,
            // bypassing the static data/agent_config.json file entirely.
            system_prompt:     systemPrompt,
            llm_model:         llmModel,
            llm_temperature:   llmTemperature,
            fallback_greeting: fallbackGreeting,
        });

        console.log(`[DISPATCH] Step 1: Creating room ${roomName}`);
        console.log(`[DISPATCH] system_prompt length: ${systemPrompt.length} chars, override: ${overrideSystemPrompt}`);
        console.log(`[DISPATCH] rag_content length: ${ragContent.length} chars`);
        if (ragContent.length > 0) {
            console.log(`[DISPATCH] rag_content preview: ${ragContent.substring(0, 200)}...`);
        }
        if (systemPrompt.length > 0) {
            console.log(`[DISPATCH] system_prompt preview: ${systemPrompt.substring(0, 200)}...`);
        }

        // STEP 1: Create the room explicitly with metadata
        await roomService.createRoom({
            name: roomName,
            metadata: metadata,
            emptyTimeout: 60 * 10, // 10 minutes
        });

        console.log(`[DISPATCH] Step 2: Dispatching agent 'outbound-caller' to room ${roomName}`);

        // STEP 2: Tell the agent worker to join this room
        // The agent name "outbound-caller" must match agent.py's WorkerOptions.agent_name
        const dispatch = await agentDispatchClient.createDispatch(roomName, "outbound-caller", {
            metadata: metadata,
        });

        console.log(`[DISPATCH] Agent dispatched. Dispatch ID: ${dispatch.id}`);
        // NOTE: The agent (agent_outbound.py) handles the SIP dial-out itself
        // via create_sip_participant. Do NOT call sipClient here — it causes a double-dial.

        return NextResponse.json({
            success: true,
            roomName,
            dispatchId: dispatch.id,
        });

    } catch (error: any) {
        console.error("Error dispatching call:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
