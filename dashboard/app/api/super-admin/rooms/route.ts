import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { roomService } from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
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

        const rooms = await roomService.listRooms();
        
        // Enrich rooms with metadata and calculate duration
        const enrichedRooms = await Promise.all(rooms.map(async (room) => {
            let meta: any = {};
            try {
                if (room.metadata) {
                    meta = JSON.parse(room.metadata);
                }
            } catch (e) {
                console.error("Failed to parse room metadata", e);
            }
            
            const creationTimeMs = room.creationTime ? Number(room.creationTime) * 1000 : Date.now();
            const durationMs = Date.now() - creationTimeMs;

            // Retrieve participants for this room
            let participants: import('livekit-server-sdk').ParticipantInfo[] = [];
            try {
                participants = await roomService.listParticipants(room.name);
            } catch(e) {
                console.error(`Failed to get participants for ${room.name}`);
            }

            // ── Resolve workspace_id ──────────────────────────────────────────
            // Priority: room metadata → job/participant metadata → room name prefix
            let wsId = meta.workspace_id || meta.business_id;
            let didNumber: string | null = null;
            let callerNumber: string | null = null;

            if (!wsId) {
                // Fallback: check each participant's metadata for workspace_id
                for (const p of participants) {
                    if (p.metadata) {
                        try {
                            const pm = JSON.parse(p.metadata);
                            if (pm.workspace_id || pm.business_id) {
                                wsId = pm.workspace_id || pm.business_id;
                                break;
                            }
                        } catch (_) {}
                    }
                    // Also check participant attributes (LiveKit SIP sets these)
                    const attrs = (p as any).attributes as Record<string, string> | undefined;
                    if (attrs) {
                        wsId = wsId || attrs['workspace_id'] || attrs['business_id'];
                        // SIP callee = DID number dialled, SIP caller = caller's phone number
                        didNumber = didNumber || attrs['sip.calleeNumber'] || attrs['sip.callee'] || null;
                        callerNumber = callerNumber || attrs['sip.callerNumber'] || attrs['sip.caller'] || null;
                    }
                }
            }

            // Fallback: for INBOUND rooms, the room name encodes the CALLER's number, not the DID.
            // Format: inbound-_<CALLER_PHONE>_<random_suffix>
            if (!callerNumber) {
                const callerFromRoom = room.name.match(/^inbound-_(\d+)_/);
                if (callerFromRoom) {
                    callerNumber = `+${callerFromRoom[1]}`;
                }
            }

            // Fallback: caller from SIP participant identity (e.g. "sip_919999424997")
            if (!callerNumber) {
                for (const p of participants) {
                    const match = p.identity.match(/^sip_(\d+)$/);
                    if (match) { callerNumber = `+${match[1]}`; break; }
                }
            }

            // Fallback: DID from workspace_config table (the Vobiz DID assigned to this tenant)
            // This is the number callers DIAL to reach this workspace.
            if (!didNumber && wsId) {
                const { data: wsCfg } = await supabase
                    .from("workspace_config")
                    .select("vobiz_did_number")
                    .eq("workspace_id", wsId)
                    .single();
                if (wsCfg?.vobiz_did_number) didNumber = wsCfg.vobiz_did_number;
            }

            // ── Resolve workspace name from DB ────────────────────────────────
            let workspaceName = "Unknown";
            if (wsId) {
                const { data: ws } = await supabase
                    .from("businesses")
                    .select("name")
                    .eq("id", wsId)
                    .single();
                if (ws) workspaceName = ws.name;
            }
            
            return {
                id: room.sid,
                name: room.name,
                creationTime: creationTimeMs,
                durationMs,
                metadata: meta,
                workspaceName,
                didNumber,      // DID line the call came in on (or outbound caller ID)
                callerNumber,   // Phone number of the external caller
                participants: participants.map(p => ({
                    identity: p.identity,
                    state: p.state,
                    joinedAt: p.joinedAt ? Number(p.joinedAt) * 1000 : null,
                    attributes: (p as any).attributes ?? {},
                }))
            };
        }));
        
        // Sort by duration descending (longest running first)
        enrichedRooms.sort((a, b) => b.durationMs - a.durationMs);

        return NextResponse.json({ rooms: enrichedRooms });

    } catch (error: any) {
        console.error("Error listing rooms:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
