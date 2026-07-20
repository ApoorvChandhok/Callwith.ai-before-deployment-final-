"use client";

import { useState, useEffect, useCallback } from "react";
import CallLogsTable from "@/components/CallLogsTable";
import { RefreshCw, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 25;

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [direction, setDirection] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchLogs = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(LIMIT),
        });
        if (startDate) params.set("start", startDate);
        if (endDate) params.set("end", endDate);

        const res = await fetch(`/api/call-logs?${params.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();
        let fetchedLogs: any[] = data.logs ?? [];

        // Client-side filter: search + sentiment + direction
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          fetchedLogs = fetchedLogs.filter(
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
          fetchedLogs = fetchedLogs.filter((l) =>
            l.sentiment?.toLowerCase().includes(sentiment.toLowerCase())
          );
        }
        if (direction) {
          fetchedLogs = fetchedLogs.filter(
            (l) => (l.direction || "").toLowerCase() === direction.toLowerCase()
          );
        }

        setLogs(fetchedLogs);
        setTotal(data.total ?? fetchedLogs.length);
        setTotalPages(data.totalPages ?? 1);
      } catch (e: any) {
        setError(e.message ?? "Failed to load call logs");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, startDate, endDate, debouncedSearch, sentiment, direction]
  );

  // Fetch on mount and whenever filters / page change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, startDate, endDate, sentiment, direction]);

  const clearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setSentiment("");
    setDirection("");
    setPage(1);
  };

  const hasActiveFilters = search || startDate || endDate || sentiment || direction;

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

        <div className="flex items-center gap-2">
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

          {/* Refresh */}
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-[#8b949e] border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] rounded-lg hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl p-4 space-y-3 shadow-sm">
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
      <CallLogsTable logs={logs} loading={loading} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500 dark:text-[#8b949e]">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-gray-600 dark:text-[#8b949e] hover:bg-gray-50 dark:hover:bg-[#21262d] disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-gray-600 dark:text-[#8b949e] hover:bg-gray-50 dark:hover:bg-[#21262d] disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
