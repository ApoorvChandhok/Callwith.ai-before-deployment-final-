"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import CallLogsTable from "@/components/CallLogsTable";
import { RefreshCw, Search, Filter, Calendar, Loader2, Upload, DatabaseZap } from "lucide-react";

export const dynamic = "force-dynamic";

const LIMIT = 25;

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Infinite scroll sentinel ref
  const lastLogRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !refreshing) {
          setPage((p) => p + 1);
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [loadingMore, hasMore, loading, refreshing]
  );

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [direction, setDirection] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
    setLogs([]);
  }, [debouncedSearch, startDate, endDate, sentiment, direction]);

  // ── Core fetch (reads from Supabase via API) ────────────────────────────────
  const fetchLogs = useCallback(
    async (resetToPage1 = false) => {
      const fetchPage = resetToPage1 ? 1 : page;

      if (resetToPage1) {
        setRefreshing(true);
        setLogs([]);
        setPage(1);
      } else if (fetchPage === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(fetchPage),
          limit: String(LIMIT),
          crm_status: "true",
        });
        if (startDate) params.set("start", startDate);
        if (endDate) params.set("end", endDate);

        const res = await fetch(`/api/call-logs?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();
        let fetched: any[] = data.logs ?? [];

        // Client-side filters (search, sentiment, direction — not yet server-side)
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          fetched = fetched.filter(
            (l) =>
              l.phone_number?.toLowerCase().includes(q) ||
              l.caller_number?.toLowerCase().includes(q) ||
              l.summary?.toLowerCase().includes(q) ||
              l.caller_intent?.toLowerCase().includes(q) ||
              l.transcript?.toLowerCase().includes(q) ||
              l.status?.toLowerCase().includes(q)
          );
        }
        if (sentiment) {
          fetched = fetched.filter((l) =>
            l.sentiment?.toLowerCase().includes(sentiment.toLowerCase())
          );
        }
        if (direction) {
          fetched = fetched.filter(
            (l) => (l.direction || "").toLowerCase() === direction.toLowerCase()
          );
        }

        // Append for infinite scroll or replace for page 1 / refresh
        if (!resetToPage1 && fetchPage > 1) {
          setLogs((prev) => [...prev, ...fetched]);
        } else {
          setLogs(fetched);
        }

        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setHasMore(data.hasMore ?? false);
      } catch (e: any) {
        setError(e.message ?? "Failed to load call logs");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [page, startDate, endDate, debouncedSearch, sentiment, direction]
  );

  // Initial load + page changes
  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, startDate, endDate, debouncedSearch, sentiment, direction]);

  // ── Refresh: sync Vobiz → Supabase, then re-fetch ──────────────────────────
  const handleRefresh = async () => {
    setSyncing(true);
    setSyncMessage("Syncing from Vobiz…");
    setError(null);

    try {
      const res = await fetch("/api/call-logs/sync", {
        method: "POST",
        cache: "no-store",
      });
      const result = await res.json();
      setSyncMessage(result.message ?? "Sync complete");
    } catch (err: any) {
      setSyncMessage("Sync failed — showing existing records");
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }

    // Always re-fetch after sync (even if sync errored)
    await fetchLogs(true);
    setTimeout(() => setSyncMessage(null), 5000);
  };

  // ── Date presets ────────────────────────────────────────────────────────────
  const getDatePresets = () => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const sub = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() - n); return r; };
    return [
      { label: "Today", range: { start: fmt(today), end: fmt(today) } },
      { label: "Yesterday", range: { start: fmt(sub(today, 1)), end: fmt(sub(today, 1)) } },
      { label: "Last 7 days", range: { start: fmt(sub(today, 7)), end: fmt(today) } },
      { label: "Last 30 days", range: { start: fmt(sub(today, 30)), end: fmt(today) } },
      {
        label: "This Month",
        range: { start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: fmt(today) },
      },
      {
        label: "Last Month",
        range: {
          start: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
          end: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
        },
      },
    ];
  };

  const datePresets = getDatePresets();

  const clearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setSentiment("");
    setDirection("");
    setSelectedPreset(null);
  };

  const hasActiveFilters = search || startDate || endDate || sentiment || direction || selectedPreset;

  // ── Sync All to CRM ─────────────────────────────────────────────────────────
  // Fetches ALL logs from Supabase (not just the current page) then sends them
  // to the CRM in batches of 200.
  const syncAllToCrm = async () => {
    setSyncingAll(true);
    setSyncResult(null);

    try {
      // Step 1: Fetch every log from Supabase (bypass pagination)
      setSyncResult("Fetching all logs…");
      const params = new URLSearchParams({
        page: "1",
        limit: "9999",
        crm_status: "true",
      });
      if (startDate) params.set("start", startDate);
      if (endDate) params.set("end", endDate);

      const fetchRes = await fetch(`/api/call-logs?${params.toString()}`, {
        cache: "no-store",
      });
      if (!fetchRes.ok) throw new Error(`Failed to fetch logs: ${fetchRes.status}`);
      const fetchData = await fetchRes.json();
      const allLogs: any[] = fetchData.logs ?? [];

      if (allLogs.length === 0) {
        setSyncResult("No logs found to sync");
        setTimeout(() => setSyncResult(null), 3000);
        setSyncingAll(false);
        return;
      }

      // Step 2: Filter out already-synced if needed (keep all for a full sync)
      const unsyncedLogs = allLogs.filter((log) => log.crm_sync_status !== "synced");
      if (unsyncedLogs.length === 0) {
        setSyncResult(`All ${allLogs.length} logs already synced to CRM`);
        setTimeout(() => setSyncResult(null), 4000);
        setSyncingAll(false);
        return;
      }

      setSyncResult(`Syncing ${unsyncedLogs.length} logs to CRM…`);

      // Step 3: Send in batches of 200 to avoid request size limits
      const BATCH = 200;
      let totalCreated = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      for (let i = 0; i < unsyncedLogs.length; i += BATCH) {
        const batch = unsyncedLogs.slice(i, i + BATCH);
        const results = batch.map((log: any) => ({
          phone_number: log.phone_number || log.caller_number || "",
          lead_name: log.user_info?.name || "",
          lead_email: log.user_info?.email || "",
          sentiment: log.sentiment || "",
          intent: log.caller_intent || "",
          status: "Called",
          remarks: log.summary || "",
        })).filter((r: any) => r.phone_number); // skip entries without a phone number

        if (results.length === 0) continue;

        const response = await fetch("/api/real-estate/crm-sync", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`${errorData.error || response.statusText} (${response.status})`);
        }

        const batchResult = await response.json();
        totalCreated += batchResult.created || 0;
        totalUpdated += batchResult.updated || 0;
        totalErrors += batchResult.errors || 0;

        // Show running progress
        const done = Math.min(i + BATCH, unsyncedLogs.length);
        setSyncResult(`Syncing… ${done}/${unsyncedLogs.length} processed`);
      }

      const summary = `Synced ${unsyncedLogs.length} logs — ${totalCreated} new leads, ${totalUpdated} updated${totalErrors > 0 ? `, ${totalErrors} errors` : ""}`;
      setSyncResult(summary);
      setTimeout(() => setSyncResult(null), 6000);

      // Refresh to show updated CRM status badges
      fetchLogs(true);
    } catch (error: any) {
      console.error("Sync all to CRM failed:", error);
      setSyncResult(`Sync failed: ${error.message}`);
      setTimeout(() => setSyncResult(null), 6000);
    } finally {
      setSyncingAll(false);
    }
  };

  const isWorking = refreshing || syncing || loading;

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-[#e6edf3]">
            Call Logs
          </h2>
          <p className="text-gray-500 dark:text-[#8b949e] mt-1">
            Transcripts, summaries, and sentiment analysis of all completed calls.
            {total > 0 && (
              <span className="ml-2 text-xs font-medium text-gray-400 dark:text-[#6e7681]">
                {total} total
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
              showFilters || hasActiveFilters
                ? "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30"
                : "text-gray-600 dark:text-[#8b949e] border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:bg-gray-50 dark:hover:bg-[#21262d]"
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" />
            )}
          </button>

          {/* Sync All to CRM */}
          <button
            onClick={syncAllToCrm}
            disabled={syncingAll || logs.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 dark:text-[#2f81f7] border border-blue-200 dark:border-[#2f81f7]/30 bg-blue-50 dark:bg-[#2f81f7]/10 rounded-lg hover:bg-blue-100 dark:hover:bg-[#2f81f7]/20 transition-colors disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 ${syncingAll ? "animate-spin" : ""}`} />
            {syncingAll ? "Syncing…" : "Sync All to CRM"}
          </button>

          {/* CRM Sync Result */}
          {syncResult && (
            <span
              className={`text-xs font-medium px-2 py-1 rounded ${
                syncResult.includes("failed") || syncResult.includes("No logs")
                  ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                  : "bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400"
              }`}
            >
              {syncResult}
            </span>
          )}

          {/* Refresh + Sync from Vobiz */}
          <button
            onClick={handleRefresh}
            disabled={isWorking}
            title="Sync latest calls from Vobiz then reload"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-[#8b949e] border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] rounded-lg hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors disabled:opacity-50"
          >
            {syncing ? (
              <DatabaseZap className="w-4 h-4 animate-pulse text-violet-500" />
            ) : (
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            )}
            {syncing ? "Syncing…" : refreshing ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Sync status message */}
      {syncMessage && (
        <div
          className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${
            syncMessage.toLowerCase().includes("fail") || syncMessage.toLowerCase().includes("error")
              ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400"
              : "bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400"
          }`}
        >
          <DatabaseZap className="w-4 h-4 flex-shrink-0" />
          {syncMessage}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl p-4 space-y-3 shadow-sm">
          {/* Date Range Presets */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-500 dark:text-[#8b949e] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Date Range
            </label>
            <div className="flex flex-wrap gap-2">
              {datePresets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setStartDate(preset.range.start);
                    setEndDate(preset.range.end);
                    setSelectedPreset(preset.label);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    selectedPreset === preset.label
                      ? "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30"
                      : "text-gray-600 dark:text-[#8b949e] border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:bg-gray-50 dark:hover:bg-[#21262d]"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setSelectedPreset("Custom")}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  selectedPreset === "Custom"
                    ? "bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/30"
                    : "text-gray-600 dark:text-[#8b949e] border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:bg-gray-50 dark:hover:bg-[#21262d]"
                }`}
              >
                Custom
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by phone, summary, transcript…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Sentiment */}
            <select
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>

            {/* Direction */}
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">All Directions</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>

            {/* Start Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-[#8b949e]">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 text-sm bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* End Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 dark:text-[#8b949e]">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 text-sm bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            {/* Clear filters */}
            {hasActiveFilters && (
              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="text-sm text-red-500 dark:text-red-400 hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <CallLogsTable logs={logs} loading={loading} />
      </div>

      {/* Infinite scroll sentinel */}
      {hasMore && !loading && !loadingMore && logs.length > 0 && (
        <div ref={lastLogRef} className="h-10" />
      )}

      {/* Loading more */}
      {loadingMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
          <span className="ml-2 text-sm text-gray-500 dark:text-[#8b949e]">Loading more logs…</span>
        </div>
      )}

      {/* End of logs */}
      {!hasMore && !loading && logs.length > 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-400 dark:text-[#6e7681]">
            Showing all {logs.length} logs
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && logs.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <DatabaseZap className="w-12 h-12 text-gray-300 dark:text-[#30363d] mb-4" />
          <p className="text-gray-500 dark:text-[#8b949e] text-base font-medium">No call logs found</p>
          <p className="text-gray-400 dark:text-[#6e7681] text-sm mt-1">
            Click <strong>Refresh</strong> to sync the latest calls from Vobiz into your database.
          </p>
          <button
            onClick={handleRefresh}
            disabled={isWorking}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {syncing ? "Syncing from Vobiz…" : "Sync & Load Logs"}
          </button>
        </div>
      )}
    </div>
  );
}
