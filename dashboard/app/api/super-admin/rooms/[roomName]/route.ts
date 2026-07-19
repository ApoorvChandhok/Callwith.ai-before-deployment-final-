import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { roomService } from '@/lib/server-utils';

export async function DELETE(request: Request, context: any) {
    try {
        // Next.js 15: params must be awaited
        const params = await context.params;
        const roomName = decodeURIComponent(params.roomName);

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("auth_user_id", user.id)
            .single();

        if (profile?.role !== "super_admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        console.log(`[KILL] Super admin ${user.id} terminating room: ${roomName}`);

        // ── STEP 0: Read room metadata BEFORE deleting (to get workspace_id) ───
        let workspaceId: string | null = null;
        try {
            const rooms = await roomService.listRooms([roomName]);
            const room = rooms?.[0];
            if (room?.metadata) {
                const meta = JSON.parse(room.metadata);
                workspaceId = meta.workspace_id || meta.business_id || null;
            }
        } catch (e) {
            console.warn('[KILL] Could not read room metadata:', e);
        }

        // ── STEP 1: Remove all participants first (this kills SIP/phone calls) ──
        // Just deleting the room does NOT hang up the phone call.
        // We must explicitly remove each participant so LiveKit sends BYE to the SIP trunk.
        let participantCount = 0;
        try {
            const participants = await roomService.listParticipants(roomName);
            participantCount = participants.length;
            console.log(`[KILL] Removing ${participantCount} participant(s) from ${roomName}`);
            await Promise.all(
                participants.map(p =>
                    roomService.removeParticipant(roomName, p.identity).catch(e =>
                        console.warn(`[KILL] Could not remove ${p.identity}:`, e.message)
                    )
                )
            );
        } catch (e: any) {
            // Room may have no participants or already be in teardown
            console.warn(`[KILL] Participant removal skipped: ${e.message}`);
        }

        // ── STEP 2: Delete the LiveKit room ────────────────────────────────────
        await roomService.deleteRoom(roomName);
        console.log(`[KILL] Room ${roomName} deleted (${participantCount} participants removed)`);

        // ── STEP 3: Audit log via service role ─────────────────────────────────
        try {
            const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
            const supabaseAdmin = createSupabaseClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            // If metadata didn't have workspace_id, try resolving from room name pattern:
            // ws-{first8hexOfUUID}-{timestamp}
            if (!workspaceId) {
                const roomMatch = roomName.match(/^ws-([a-f0-9]{8})-/i);
                if (roomMatch) {
                    const prefix = roomMatch[1]; // e.g. "11111111"
                    const { data: ws } = await supabaseAdmin
                        .from('businesses')
                        .select('id')
                        .ilike('id', `${prefix}%`)
                        .single();
                    if (ws) workspaceId = ws.id;
                }
            }

            const { error: auditError } = await supabaseAdmin.from("admin_audit_log").insert({
                action: 'kill_room',
                actor_id: user.id,
                target: roomName,
                metadata: {
                    room_name: roomName,
                    participants_removed: participantCount,
                    timestamp: new Date().toISOString(),
                    ...(workspaceId && { workspace_id: workspaceId }),
                },
            });
            if (auditError) console.error("[KILL] Audit log failed:", auditError);
        } catch (auditException) {
            console.error("[KILL] Audit log exception:", auditException);
        }

        return NextResponse.json({ success: true, participantsRemoved: participantCount });

    } catch (error: any) {
        console.error("[KILL] Error terminating room:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
