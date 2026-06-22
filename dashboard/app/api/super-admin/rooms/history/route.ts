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

        // Use service role to bypass RLS on audit log
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

        // Pull room creation events from call_logs (if table exists)
        // Fallback gracefully if the table doesn't exist
        let callLogs: any[] = [];
        try {
            const { data, error } = await adminClient
                .from('call_logs')
                .select('room_name, workspace_id, direction, phone_number, started_at, ended_at, duration_seconds, status')
                .gte('started_at', since)
                .order('started_at', { ascending: false })
                .limit(200);
            if (!error && data) callLogs = data;
        } catch (_) { /* table may not exist */ }

        // Enrich kill events with workspace names
        const workspaceCache: Record<string, string> = {};
        const enrichedKills = await Promise.all((killEvents ?? []).map(async (ev) => {
            const wsId = ev.metadata?.workspace_id;
            if (wsId && !workspaceCache[wsId]) {
                const { data: ws } = await supabase
                    .from('businesses')
                    .select('name')
                    .eq('id', wsId)
                    .single();
                if (ws) workspaceCache[wsId] = ws.name;
            }
            return {
                id: ev.id,
                type: 'kill' as const,
                roomName: ev.target,
                workspaceName: workspaceCache[wsId] ?? 'Unknown',
                actorId: ev.actor_id,
                participantsRemoved: ev.metadata?.participants_removed ?? 0,
                timestamp: ev.created_at,
                metadata: ev.metadata,
            };
        }));

        return NextResponse.json({
            killEvents: enrichedKills,
            callLogs,
            since,
        });

    } catch (error: any) {
        console.error('[Room History] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
