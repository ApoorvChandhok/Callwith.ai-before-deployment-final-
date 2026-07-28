'use client'

import { useEffect, useState } from 'react'
import type { WorkspaceRow } from '@/lib/types/super-admin'
import CreateWorkspaceModal from '@/components/super-admin/CreateWorkspaceModal'
import WorkspaceDrawer from '@/components/super-admin/WorkspaceDrawer'
import { useRouter } from 'next/navigation'
import { setImpersonationCookie } from './actions'
import LiveRoomsMonitor from '@/components/super-admin/LiveRoomsMonitor'

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5 flex flex-col gap-1">
      <span className="text-xs text-white/40 uppercase tracking-wider font-medium">{label}</span>
      <span className={`text-2xl font-bold ${color ?? 'text-white'}`}>{value}</span>
      {sub && <span className="text-xs text-white/30">{sub}</span>}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
      active
        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        : 'bg-red-500/10 text-red-400 border border-red-500/20'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}/>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

// ── Trunk badge ───────────────────────────────────────────────────────────────
function TrunkBadge({ id }: { id: string | null }) {
  if (!id) return <span className="text-white/20 text-xs">—</span>
  return (
    <span className="font-mono text-[10px] text-violet-300/70 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/15">
      {id.length > 16 ? id.slice(0, 16) + '…' : id}
    </span>
  )
}

// ── Spend bar ─────────────────────────────────────────────────────────────────
function SpendBar({ spend, max }: { spend: number; max: number }) {
  const pct = max > 0 ? Math.min((spend / max) * 100, 100) : 0
  const color = pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }}/>
      </div>
      <span className="text-xs font-mono text-white/60 w-14 text-right">
        ${spend.toFixed(4)}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const [workspaces, setWorkspaces]           = useState<WorkspaceRow[]>([])
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState<string | null>(null)
  const [showCreate, setShowCreate]           = useState(false)
  const [search, setSearch]                   = useState('')
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceRow | null>(null)
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId]           = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteToast, setDeleteToast]         = useState<string | null>(null)
  const [activeTab, setActiveTab]             = useState<'workspaces' | 'live-rooms'>('workspaces')
  const router = useRouter()

  const handleImpersonate = async (workspaceId: string) => {
    setImpersonatingId(workspaceId)
    try {
      await setImpersonationCookie(workspaceId)
      router.push('/')
      router.refresh()
    } catch (e) {
      console.error(e)
      setImpersonatingId(null)
    }
  }

  const handleDelete = async (ws: WorkspaceRow) => {
    setDeletingId(ws.id)
    setConfirmDeleteId(null)
    try {
      const res = await fetch('/api/super-admin/workspaces/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: ws.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteToast(`❌ ${data.error ?? 'Delete failed'}`)
      } else {
        // Remove from local state immediately
        setWorkspaces(prev => prev.filter(w => w.id !== ws.id))
        const warn = data.livekit_warnings?.length
          ? `⚠️ Deleted — LiveKit cleanup partial: ${data.livekit_warnings.join(', ')}`
          : `✓ "${ws.name}" deleted`
        setDeleteToast(warn)
      }
    } catch (e) {
      setDeleteToast(`❌ ${e instanceof Error ? e.message : 'Network error'}`)
    } finally {
      setDeletingId(null)
      setTimeout(() => setDeleteToast(null), 4000)
    }
  }

  const fetchWorkspaces = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/super-admin/workspaces')
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setWorkspaces(data.workspaces ?? [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load workspaces')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWorkspaces() }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const validWorkspaces = workspaces.filter(w => w.id !== '00000000-0000-0000-0000-000000000000') // hide archive tenant

  const totalSpend  = validWorkspaces.reduce((s, w) => s + w.total_spend_usd, 0)
  const totalCalls  = validWorkspaces.reduce((s, w) => s + w.total_calls, 0)
  const totalMins   = validWorkspaces.reduce((s, w) => s + w.total_minutes, 0)
  const activeCount = validWorkspaces.filter(w => w.is_active).length
  const maxSpend    = Math.max(...validWorkspaces.map(w => w.total_spend_usd), 0.001)

  const filtered = validWorkspaces
    .filter(w =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.slug?.toLowerCase().includes(search.toLowerCase()) ||
      w.owner_email?.toLowerCase().includes(search.toLowerCase())
    )

  return (
    <>
      {/* Header and Tabs */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Super Admin Dashboard</h1>
        <div className="flex gap-4 mt-6 border-b border-white/[0.08]">
          <button
            onClick={() => setActiveTab('workspaces')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'workspaces' ? 'text-white border-violet-500' : 'text-white/40 border-transparent hover:text-white/70'}`}
          >
            Workspaces
          </button>
          <button
            onClick={() => setActiveTab('live-rooms')}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'live-rooms' ? 'text-white border-violet-500' : 'text-white/40 border-transparent hover:text-white/70'}`}
          >
            Live Rooms
          </button>
        </div>
      </div>

      {activeTab === 'workspaces' ? (
        <>
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Workspaces</h2>
              <p className="text-sm text-white/40 mt-0.5">
                {validWorkspaces.length} tenant{validWorkspaces.length !== 1 ? 's' : ''} · 7-day billing window
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchWorkspaces}
                disabled={loading}
                title="Refresh"
                className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/80 transition-all disabled:opacity-30"
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  className={loading ? 'animate-spin' : ''}>
                  <path d="M11.5 2A5.5 5.5 0 1 0 12 7"/>
                  <path d="M11.5 2v3h-3"/>
                </svg>
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 active:scale-[0.98]"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M7 1v12M1 7h12"/>
                </svg>
                New Workspace
              </button>
            </div>
          </div>

      {/* Platform-wide stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Workspaces" value={validWorkspaces.length} sub={`${activeCount} active`} />
        <StatCard label="7-Day Spend" value={`$${totalSpend.toFixed(4)}`} sub="all tenants" color="text-violet-300" />
        <StatCard label="7-Day Calls" value={totalCalls.toLocaleString()} sub="all directions" color="text-sky-300" />
        <StatCard label="7-Day Minutes" value={totalMins.toFixed(1)} sub="talk time" color="text-emerald-300" />
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6" cy="6" r="4.5"/>
          <path d="M9.5 9.5L13 13" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Search workspaces…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-white/25 outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.07] overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_90px_120px] gap-0 bg-white/[0.03] border-b border-white/[0.06]">
          {['Workspace', 'Status', 'Outbound Trunk', 'Inbound Trunk', 'DID Number', '7-Day Spend', 'Total Calls', 'Actions'].map(h => (
            <div key={h} className="px-4 py-3 text-[11px] uppercase tracking-wider text-white/30 font-medium">{h}</div>
          ))}
        </div>

        {loading ? (
          /* Skeleton rows */
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_90px_120px] border-b border-white/[0.04] animate-pulse">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="px-4 py-4">
                  <div className="h-3 rounded bg-white/[0.06]" style={{ width: `${60 + ((i * 7 + j * 13) % 30)}%` }}/>
                </div>
              ))}
            </div>
          ))
        ) : error ? (
          <div className="px-6 py-12 text-center text-red-400 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-white/30 text-sm">
            {search ? 'No workspaces match your search.' : 'No workspaces yet. Create the first one.'}
          </div>
        ) : (
          filtered.map((ws, idx) => (
            <div
              key={ws.id}
              className={`grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_90px_120px] border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors group ${
                idx === filtered.length - 1 ? 'border-b-0' : ''
              }`}
            >
              {/* Workspace name + slug */}
              <div className="px-4 py-3.5 flex flex-col justify-center gap-0.5">
                <span className="text-sm font-semibold text-white/90 truncate">{ws.name}</span>
                <div className="flex items-center gap-2">
                  {ws.slug && (
                    <span className="text-[11px] text-white/30 font-mono">/{ws.slug}</span>
                  )}
                  {ws.owner_email && (
                    <span className="text-[11px] text-white/25 truncate">{ws.owner_email}</span>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="px-4 py-3.5 flex items-center">
                <StatusBadge active={ws.is_active} />
              </div>

              {/* Outbound trunk */}
              <div className="px-4 py-3.5 flex items-center">
                <TrunkBadge id={ws.livekit_trunk_id} />
              </div>

              {/* Inbound trunk */}
              <div className="px-4 py-3.5 flex items-center">
                <TrunkBadge id={ws.inbound_trunk_id} />
              </div>

              {/* DID number */}
              <div className="px-4 py-3.5 flex items-center">
                {ws.vobiz_did_number
                  ? <span className="text-xs font-mono text-white/60">{ws.vobiz_did_number}</span>
                  : <span className="text-white/20 text-xs">—</span>}
              </div>

              {/* 7-day spend with bar */}
              <div className="px-4 py-3.5 flex flex-col justify-center gap-1.5">
                <SpendBar spend={ws.total_spend_usd} max={maxSpend} />
                <div className="flex items-center gap-2 text-[10px] text-white/25">
                  <span>{ws.outbound_calls}↑</span>
                  <span>{ws.inbound_calls}↓</span>
                  <span>{ws.total_minutes.toFixed(1)} min</span>
                </div>
              </div>

              {/* Lifetime calls */}
              <div className="px-4 py-3.5 flex flex-col justify-center gap-0.5">
                <span className="text-sm font-semibold text-white/80">
                  {ws.lifetime_calls.toLocaleString()}
                </span>
                {ws.lifetime_calls > 0 && (
                  <span className="text-[10px] text-white/25">
                    {ws.lifetime_completed} completed
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="px-4 py-3.5 flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                {/* Impersonate */}
                <button
                  onClick={() => handleImpersonate(ws.id)}
                  title="Open as this workspace"
                  disabled={impersonatingId === ws.id}
                  className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/40 hover:text-violet-400 transition-all disabled:opacity-50"
                >
                  {impersonatingId === ws.id ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="animate-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  )}
                </button>

                {/* View details */}
                <button
                  onClick={() => setSelectedWorkspace(ws)}
                  title="View workspace details"
                  className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/40 hover:text-white/80 transition-all"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1 6.5C1 6.5 3 2 6.5 2S12 6.5 12 6.5s-2 4.5-5.5 4.5S1 6.5 1 6.5Z"/>
                    <circle cx="6.5" cy="6.5" r="1.5"/>
                  </svg>
                </button>

                {/* Delete — two-step confirm */}
                {confirmDeleteId === ws.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(ws)}
                      disabled={deletingId === ws.id}
                      title="Confirm delete"
                      className="px-2 py-1 rounded text-[10px] font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all disabled:opacity-50"
                    >
                      {deletingId === ws.id ? '…' : 'Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      title="Cancel"
                      className="p-1.5 rounded-lg hover:bg-white/[0.07] text-white/30 hover:text-white/60 transition-all"
                    >
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M1 1l9 9M10 1L1 10"/>
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(ws.id)}
                    title="Delete workspace"
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all"
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 3.5h9M4.5 3.5V2h4v1.5M5 6v4M8 6v4M3 3.5l.5 7h6l.5-7"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cost breakdown footnote */}
      <p className="mt-4 text-[11px] text-white/20 text-right">
        Spend = Outbound × ${filtered[0]?.rate_outbound_per_min.toFixed(4) ?? '0.0200'}/min + Inbound × ${filtered[0]?.rate_inbound_per_min.toFixed(4) ?? '0.0100'}/min + STT $0.0043 + TTS $0.0040 + LK $0.0010 + LLM tokens
      </p>

      {/* Create Workspace Modal */}
      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchWorkspaces() }}
        />
      )}

      {/* Workspace Detail Drawer */}
      {selectedWorkspace && (
        <WorkspaceDrawer
          workspace={selectedWorkspace}
          onClose={() => setSelectedWorkspace(null)}
        />
      )}

      {deleteToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-2xl backdrop-blur-sm transition-all ${
          deleteToast.startsWith('❌')
            ? 'bg-red-950/80 border-red-500/30 text-red-300'
            : deleteToast.startsWith('⚠️')
            ? 'bg-amber-950/80 border-amber-500/30 text-amber-300'
            : 'bg-zinc-900/90 border-white/10 text-white/80'
        }`}>
          {deleteToast}
        </div>
      )}
      </>
      ) : (
        <LiveRoomsMonitor />
      )}
    </>
  )
}
