'use client'

import { useEffect, useState, useRef } from 'react'

export interface RoomRow {
  id: string;
  name: string;
  creationTime: number;
  durationMs: number;
  metadata: any;
  workspaceName: string;
  participants: Array<{
    identity: string;
    state: string;
    joinedAt: number | null;
  }>;
}

interface KillEvent {
  id: string;
  type: 'kill';
  roomName: string;
  workspaceName: string;
  actorId: string;
  participantsRemoved: number;
  timestamp: string;
  metadata: any;
}

// ── Room Drawer ─────────────────────────────────────────────────────────────

function RoomDrawer({ room, onClose }: { room: RoomRow; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const mins = Math.floor(room.durationMs / 60000)
  const secs = Math.floor((room.durationMs % 60000) / 1000)

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="fixed top-0 right-0 z-[90] h-full w-full max-w-md bg-[#0e0e1c] border-l border-white/[0.08] shadow-2xl flex flex-col"
        style={{ animation: 'slideIn 0.22s cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">{room.name}</h2>
            <span className="text-[11px] font-mono text-white/30">ID: {room.id}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/30 hover:text-white/60 transition-all shrink-0 mt-0.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1 font-medium">Workspace</p>
            <span className="text-sm text-white/90">{room.workspaceName}</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1 font-medium">Duration</p>
            <span className="text-sm text-white/90">{mins}m {secs}s</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/25 mb-1 font-medium">Created At</p>
            <span className="text-sm text-white/90">{new Date(room.creationTime).toLocaleString()}</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/25 mb-2 font-medium">Metadata</p>
            <pre className="text-[10px] text-white/60 bg-white/[0.03] p-3 rounded-lg overflow-x-auto border border-white/[0.05]">
              {JSON.stringify(room.metadata, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/25 mb-2 font-medium">Participants ({room.participants.length})</p>
            {room.participants.length === 0 ? (
              <p className="text-[11px] text-white/30">No participants currently</p>
            ) : (
              <div className="space-y-2">
                {room.participants.map((p, idx) => (
                  <div key={idx} className="flex flex-col gap-1 p-3 rounded-lg border border-white/[0.05] bg-white/[0.02]">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-white/90 font-medium truncate" title={p.identity}>{p.identity}</span>
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${p.state === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-white/50'}`}>
                        {p.state}
                      </span>
                    </div>
                    {p.joinedAt && <span className="text-[10px] text-white/40">Joined: {new Date(p.joinedAt).toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4">
          <button onClick={onClose} className="w-full py-2 rounded-lg border border-white/[0.1] text-white/50 text-sm hover:bg-white/[0.04] hover:text-white/70 transition-all">
            Close
          </button>
        </div>
      </div>
    </>
  )
}

// ── History Row ───────────────────────────────────────────────────────────────

function HistoryPanel({ events, loading, error, onRefresh }: {
  events: KillEvent[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const [wsFilter, setWsFilter] = useState('')

  const filtered = events.filter(ev =>
    !wsFilter || ev.workspaceName.toLowerCase().includes(wsFilter.toLowerCase()) ||
    ev.roomName.toLowerCase().includes(wsFilter.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Filter by workspace or room name…"
          value={wsFilter}
          onChange={e => setWsFilter(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all"
        />
      </div>

      <div className="rounded-xl border border-white/[0.07] overflow-hidden">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] bg-white/[0.03] border-b border-white/[0.06]">
          {['Room Name', 'Workspace', 'Event', 'Participants', 'Timestamp'].map(h => (
            <div key={h} className="px-4 py-3 text-[11px] uppercase tracking-wider text-white/30 font-medium">{h}</div>
          ))}
        </div>

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] border-b border-white/[0.04] animate-pulse">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="px-4 py-4"><div className="h-3 rounded bg-white/[0.06] w-3/4"/></div>
              ))}
            </div>
          ))
        ) : error ? (
          <div className="px-6 py-10 text-center text-red-400 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-white/30 text-sm">
            {wsFilter ? 'No events match your filter.' : 'No room events in the last 24 hours.'}
          </div>
        ) : (
          filtered.map((ev, idx) => (
            <div
              key={ev.id}
              className={`grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${idx === filtered.length - 1 ? 'border-b-0' : ''}`}
            >
              <div className="px-4 py-3 flex items-center">
                <span className="text-xs font-mono text-white/70 truncate">{ev.roomName}</span>
              </div>
              <div className="px-4 py-3 flex items-center">
                <span className="text-sm text-white/60 truncate">{ev.workspaceName}</span>
              </div>
              <div className="px-4 py-3 flex items-center">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                  Terminated
                </span>
              </div>
              <div className="px-4 py-3 flex items-center">
                <span className="text-sm text-white/50">{ev.participantsRemoved} removed</span>
              </div>
              <div className="px-4 py-3 flex items-center">
                <span className="text-xs text-white/40 font-mono">
                  {new Date(ev.timestamp).toLocaleString('en-IN', { hour12: true, hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="text-[11px] text-white/20 text-right">Showing terminated rooms from the last 24 hours</p>
    </div>
  )
}

// ── Main Monitor Component ──────────────────────────────────────────────────

export default function LiveRoomsMonitor() {
  const [innerTab, setInnerTab] = useState<'live' | 'history'>('live')

  // Live state
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<RoomRow | null>(null)
  const [killingRoomId, setKillingRoomId] = useState<string | null>(null)
  const [confirmKillId, setConfirmKillId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [wsFilter, setWsFilter] = useState('')

  // History state
  const [histEvents, setHistEvents] = useState<KillEvent[]>([])
  const [histLoading, setHistLoading] = useState(false)
  const [histError, setHistError] = useState<string | null>(null)

  const fetchRooms = async (background = false) => {
    if (!background) setLoading(true)
    try {
      const res = await fetch('/api/super-admin/rooms')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setRooms(data.rooms ?? [])
      setLastUpdated(new Date())
      setError(null)
    } catch (e: any) {
      setError(e.message || 'Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    setHistLoading(true)
    setHistError(null)
    try {
      const res = await fetch('/api/super-admin/rooms/history')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setHistEvents(data.killEvents ?? [])
    } catch (e: any) {
      setHistError(e.message || 'Failed to load history')
    } finally {
      setHistLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
    const intId = setInterval(() => fetchRooms(true), 10000)
    return () => clearInterval(intId)
  }, [])

  // Load history when tab switches
  useEffect(() => {
    if (innerTab === 'history') fetchHistory()
  }, [innerTab])

  const handleKill = async (roomName: string) => {
    setKillingRoomId(roomName)
    setConfirmKillId(null)
    setRooms(prev => prev.filter(r => r.name !== roomName))
    if (selectedRoom?.name === roomName) setSelectedRoom(null)
    try {
      const res = await fetch(`/api/super-admin/rooms/${encodeURIComponent(roomName)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        await fetchRooms(true)
        showToast(`❌ ${data.error ?? 'Failed to kill room'}`)
      } else {
        const removed = data.participantsRemoved ?? 0
        showToast(`✓ Call terminated — ${removed} participant${removed !== 1 ? 's' : ''} disconnected`)
        setTimeout(() => fetchRooms(true), 2000)
      }
    } catch (e: any) {
      await fetchRooms(true)
      showToast(`❌ ${e.message || 'Network error'}`)
    } finally {
      setKillingRoomId(null)
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 5000)
  }

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}m ${secs}s`
  }

  const getHealthColor = (ms: number) => {
    const mins = ms / 60000
    if (mins < 15) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    if (mins < 30) return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    return 'text-red-400 bg-red-500/10 border-red-500/20'
  }

  const filteredRooms = rooms.filter(r =>
    !wsFilter ||
    r.workspaceName.toLowerCase().includes(wsFilter.toLowerCase()) ||
    r.name.toLowerCase().includes(wsFilter.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Live Rooms</h2>
          <p className="text-sm text-white/40 mt-0.5">
            Real-time monitoring across all tenants
            {lastUpdated && (
              <span className="ml-2 text-white/20 text-[10px] font-mono">· updated {lastUpdated.toLocaleTimeString()}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => innerTab === 'live' ? fetchRooms(false) : fetchHistory()}
          disabled={loading || histLoading}
          title="Refresh"
          className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/80 transition-all disabled:opacity-30"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            className={(loading || histLoading) ? 'animate-spin' : ''}>
            <path d="M11.5 2A5.5 5.5 0 1 0 12 7"/><path d="M11.5 2v3h-3"/>
          </svg>
        </button>
      </div>

      {/* Inner tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06] w-fit">
        {(['live', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setInnerTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              innerTab === tab
                ? 'bg-violet-600/80 text-white shadow'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {tab === 'live' ? (
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${rooms.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`}/>
                Active Calls {rooms.length > 0 && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 rounded-full">{rooms.length}</span>}
              </span>
            ) : 'Room History (24h)'}
          </button>
        ))}
      </div>

      {innerTab === 'live' ? (
        <>
          {/* Workspace filter for live rooms */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Filter by workspace or room name…"
              value={wsFilter}
              onChange={e => setWsFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all"
            />
          </div>

          {/* Live rooms table */}
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            <div className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_120px] bg-white/[0.03] border-b border-white/[0.06]">
              {['Room Name', 'Workspace', 'Duration', 'Participants', 'Created At', 'Actions'].map(h => (
                <div key={h} className="px-4 py-3 text-[11px] uppercase tracking-wider text-white/30 font-medium">{h}</div>
              ))}
            </div>

            {loading && rooms.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_120px] border-b border-white/[0.04] animate-pulse">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <div key={j} className="px-4 py-4"><div className="h-3 rounded bg-white/[0.06] w-3/4"/></div>
                  ))}
                </div>
              ))
            ) : error ? (
              <div className="px-6 py-12 text-center text-red-400 text-sm">{error}</div>
            ) : filteredRooms.length === 0 ? (
              <div className="px-6 py-12 text-center text-white/30 text-sm flex flex-col items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-20">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {wsFilter ? `No active rooms match "${wsFilter}"` : 'No active calls at the moment.'}
              </div>
            ) : (
              filteredRooms.map((room, idx) => (
                <div
                  key={room.id}
                  className={`grid grid-cols-[2fr_1.5fr_1.5fr_1fr_1fr_120px] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group ${idx === filteredRooms.length - 1 ? 'border-b-0' : ''}`}
                >
                  <div className="px-4 py-3.5 flex items-center">
                    <span className="text-xs font-mono text-white/80 break-all">{room.name}</span>
                  </div>
                  <div className="px-4 py-3.5 flex items-center">
                    <span className="text-sm text-white/70 truncate font-medium">{room.workspaceName}</span>
                  </div>
                  <div className="px-4 py-3.5 flex items-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${getHealthColor(room.durationMs)}`}>
                      {formatDuration(room.durationMs)}
                    </span>
                  </div>
                  <div className="px-4 py-3.5 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <span className="text-sm text-white/60">{room.participants.length}</span>
                  </div>
                  <div className="px-4 py-3.5 flex items-center text-xs text-white/40 font-mono">
                    {new Date(room.creationTime).toLocaleTimeString()}
                  </div>
                  <div className="px-4 py-3.5 flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setSelectedRoom(room)} title="View details"
                      className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/40 hover:text-white/80 transition-all">
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M1 6.5C1 6.5 3 2 6.5 2S12 6.5 12 6.5s-2 4.5-5.5 4.5S1 6.5 1 6.5Z"/>
                        <circle cx="6.5" cy="6.5" r="1.5"/>
                      </svg>
                    </button>

                    {confirmKillId === room.name ? (
                      <>
                        <button
                          onClick={() => handleKill(room.name)}
                          disabled={killingRoomId === room.name}
                          className="px-2 py-1 rounded text-[10px] font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all disabled:opacity-50"
                        >
                          {killingRoomId === room.name ? '…' : 'KILL'}
                        </button>
                        <button onClick={() => setConfirmKillId(null)}
                          className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/30 hover:text-white/60 transition-all">
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M1 1l9 9M10 1L1 10"/>
                          </svg>
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmKillId(room.name)} title="Terminate Call"
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
                          <line x1="12" y1="2" x2="12" y2="12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <HistoryPanel
          events={histEvents}
          loading={histLoading}
          error={histError}
          onRefresh={fetchHistory}
        />
      )}

      {selectedRoom && <RoomDrawer room={selectedRoom} onClose={() => setSelectedRoom(null)} />}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-2xl backdrop-blur-sm transition-all ${
          toast.startsWith('❌') ? 'bg-red-950/80 border-red-500/30 text-red-300' : 'bg-zinc-900/90 border-white/10 text-white/80'
        }`}>
          {toast}
        </div>
      )}
    </div>
  )
}
