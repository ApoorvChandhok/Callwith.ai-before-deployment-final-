import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('auth_user_id', user.id)
            .single();

        if (profile?.role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
        const adminClient = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Pull kill_room events from audit log
        const { data: killEvents, error: killErr } = await adminClient
            .from('admin_audit_log')
            .select('*')
            .eq('action', 'kill_room')
            .gte('created_at', since)
            .order('created_at', { ascending: false });

        if (killErr) throw killErr;

        // ── Fetch all workspaces + their DID numbers in one round-trip ───────────
        const { data: allWorkspaces } = await adminClient
            .from('businesses')
            .select('id, name');

        const { data: allConfigs } = await adminClient
            .from('workspace_config')
            .select('business_id, vobiz_did_number');

        // id → name
        const workspaceById: Record<string, string> = {};
        for (const ws of allWorkspaces ?? []) {
            workspaceById[ws.id] = ws.name;
        }

        // First-8-hex-chars of UUID (no hyphens) → name  (for ws- room names)
        // e.g. businessId = "11111111-2222-..." → prefixMap["11111111"] = "CallWith.ai"
        const prefixMap: Record<string, string> = {};
        for (const ws of allWorkspaces ?? []) {
            const raw8 = ws.id.replace(/-/g, '').slice(0, 8).toLowerCase();
            prefixMap[raw8] = ws.name;
        }

        // DID number (digits only, no +/spaces) → { workspaceName, didFormatted }
        // e.g. "918065480288" → { workspaceName: "CallWith.ai", didFormatted: "+918065480288" }
        const didMap: Record<string, { workspaceName: string; didFormatted: string }> = {};
        for (const cfg of allConfigs ?? []) {
            if (cfg.vobiz_did_number && cfg.business_id) {
                const digits = cfg.vobiz_did_number.replace(/\D/g, '');
                const name = workspaceById[cfg.business_id] ?? 'Unknown';
                const formatted = cfg.vobiz_did_number.startsWith('+')
                    ? cfg.vobiz_did_number
                    : `+${digits}`;
                didMap[digits] = { workspaceName: name, didFormatted: formatted };
            }
        }

        // ── Resolve workspace + DID from room name ───────────────────────────────
        //
        // Pattern A — outbound / tenant rooms:
        //   ws-{first8hexChars}-{timestamp}
        //   → workspace from prefixMap
        //   → DID from workspace_config via business_id
        //
        // Pattern B — inbound rooms:
        //   inbound-_{digitString}_{suffix}
        //   → the digit string IS the DID number dialled by the caller
        //   → workspace from didMap

        const resolveRoom = (
            wsIdFromAudit: string | undefined | null,
            roomName: string
        ): { workspaceName: string; didNumber: string | null } => {

            // 1. Direct workspace_id saved in audit log
            if (wsIdFromAudit && workspaceById[wsIdFromAudit]) {
                const ws = workspaceById[wsIdFromAudit];
                // Find the DID for this workspace from configs
                const cfg = (allConfigs ?? []).find(c => c.business_id === wsIdFromAudit);
                const did = cfg?.vobiz_did_number
                    ? (cfg.vobiz_did_number.startsWith('+') ? cfg.vobiz_did_number : `+${cfg.vobiz_did_number.replace(/\D/g, '')}`)
                    : null;
                return { workspaceName: ws, didNumber: did };
            }

            // 2. Pattern B: inbound-_{digits}_{suffix}
            //    The digits = DID number that the caller dialled → look up in didMap
            const inboundMatch = roomName?.match(/^inbound-_(\d+)_/i);
            if (inboundMatch) {
                const digits = inboundMatch[1];
                const entry = didMap[digits];
                if (entry) {
                    return { workspaceName: entry.workspaceName, didNumber: entry.didFormatted };
                }
                // DID found but no workspace match — still show the DID
                return { workspaceName: 'Unknown', didNumber: `+${digits}` };
            }

            // 3. Pattern A: ws-{8hexChars}-{timestamp}
            const wsMatch = roomName?.match(/^ws-([a-f0-9]{8})-/i);
            if (wsMatch) {
                const prefix = wsMatch[1].toLowerCase();
                const wsName = prefixMap[prefix];
                if (wsName) {
                    // Find config for this workspace to get DID
                    const bizId = (allWorkspaces ?? []).find(w =>
                        w.id.replace(/-/g, '').slice(0, 8).toLowerCase() === prefix
                    )?.id;
                    const cfg = bizId ? (allConfigs ?? []).find(c => c.business_id === bizId) : undefined;
                    const did = cfg?.vobiz_did_number
                        ? (cfg.vobiz_did_number.startsWith('+') ? cfg.vobiz_did_number : `+${cfg.vobiz_did_number.replace(/\D/g, '')}`)
                        : null;
                    return { workspaceName: wsName, didNumber: did };
                }
            }

            return { workspaceName: 'Unknown', didNumber: null };
        };

        const enrichedKills = (killEvents ?? []).map((ev) => {
            const wsId = ev.metadata?.workspace_id || ev.metadata?.business_id;
            const { workspaceName, didNumber } = resolveRoom(wsId, ev.target);
            return {
                id: ev.id,
                type: 'kill' as const,
                roomName: ev.target,
                workspaceName,
                didNumber,
                actorId: ev.actor_id,
                participantsRemoved: ev.metadata?.participants_removed ?? 0,
                timestamp: ev.created_at,
                metadata: ev.metadata,
            };
        });

        // Pull call_logs and enrich with workspace name + DID
        let callLogs: any[] = [];
        try {
            const { data, error } = await adminClient
                .from('call_logs')
                .select('room_name, workspace_id, direction, phone_number, started_at, ended_at, duration_seconds, status')
                .gte('started_at', since)
                .order('started_at', { ascending: false })
                .limit(200);
            if (!error && data) {
                callLogs = data.map((log: any) => {
                    const { workspaceName, didNumber } = resolveRoom(log.workspace_id, log.room_name);
                    return {
                        ...log,
                        workspace_name: workspaceName,
                        did_number: didNumber,
                    };
                });
            }
        } catch (_) { /* table may not exist */ }

        return NextResponse.json({ killEvents: enrichedKills, callLogs, since });

    } catch (error: any) {
        console.error('[Room History] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
