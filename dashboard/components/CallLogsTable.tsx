"use client";

import React, { useState, useRef, useEffect } from "react";
import { Activity, Clock, ChevronDown, ChevronUp, FileText, CheckCircle2, XCircle, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";

// Agent DID number - configurable via environment variable, falls back to default
const AGENT_DID = process.env.NEXT_PUBLIC_AGENT_DID || "918065480288";

// Format duration from seconds to MM:SS
function formatDuration(seconds: number | string | undefined): string {
  if (seconds == null || seconds === 0) return "0:00";
  const totalSeconds = typeof seconds === "string" ? parseInt(seconds, 10) : seconds;
  if (isNaN(totalSeconds)) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Sync to CRM function
async function syncToCrm(log: any): Promise<boolean> {
  try {
    const response = await fetch("/api/real-estate/crm-sync", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        results: [
          {
            phone_number: log.phone_number || log.caller_number,
            lead_name: log.user_info?.name || "",
            lead_email: log.user_info?.email || "",
            sentiment: log.sentiment || "",
            intent: log.caller_intent || "",
            status: "Called",
            remarks: log.summary || "",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("CRM sync failed:", errorData.error || response.statusText);
      return false;
    }

    const result = await response.json();
    console.log("CRM sync result:", result);
    return true;
  } catch (error) {
    console.error("CRM sync error:", error);
    return false;
  }
}

function formatCostINR(cost: string | number | undefined): string {
  if (cost == null) return "₹0.00";
  const inr = typeof cost === "number" ? cost : parseFloat(cost.replace(/[^0-9.-]/g, "")) || 0;
  return `₹${inr.toFixed(2)}`;
}

function getCallerNumber(log: any): string {
  if (log.caller_number) return log.caller_number;
  if (log.caller_id && log.caller_id.replace("+", "") !== AGENT_DID) return log.caller_id;
  if (log.phone_number && log.phone_number.replace("+", "") !== AGENT_DID) return log.phone_number;
  return log.phone_number || "Unknown";
}

// ── Animated expandable row ──────────────────────────────────────────────────
function ExpandedDetails({ log, isExpanded }: { log: any; isExpanded: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isExpanded ? contentRef.current.scrollHeight : 0);
    }
  }, [isExpanded]);

  return (
    <tr className="border-b border-gray-100 dark:border-white/5">
      <td colSpan={8} className="p-0">
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: `${height}px`, opacity: isExpanded ? 1 : 0 }}
        >
          <div ref={contentRef} className="px-8 py-6 bg-gray-50/50 dark:bg-[#21262d]/50">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Left Col: Analysis & Summary */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    Call Summary
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-[#8b949e] bg-white dark:bg-[#161b22] p-3 rounded-lg border border-gray-200/50 dark:border-white/5 shadow-sm">
                    {log.summary || "No summary available."}
                  </p>
                </div>

                {log.transcript && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      Transcript
                    </h4>
                    <div className="text-xs text-gray-600 dark:text-[#8b949e] bg-white dark:bg-[#161b22] p-3 rounded-lg border border-gray-200/50 dark:border-white/5 shadow-sm max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                      {log.transcript}
                    </div>
                  </div>
                )}

                {Object.keys(log.user_info || {}).length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Extracted Information</h4>
                    <div className="bg-white dark:bg-[#161b22] p-3 rounded-lg border border-gray-200/50 dark:border-white/5 shadow-sm">
                      <dl className="space-y-2">
                        {Object.entries(log.user_info).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-3 gap-2">
                            <dt className="text-xs font-medium text-gray-500 dark:text-[#8b949e] capitalize">{key.replace(/_/g, ' ')}</dt>
                            <dd className="text-xs text-gray-900 dark:text-[#e6edf3] col-span-2">{String(value || '-')}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <Link
                    href={`/logs/${log.id}`}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-white bg-white dark:bg-[#21262d] border border-gray-200 dark:border-[#30363d] rounded-md hover:bg-gray-50 dark:hover:bg-[#30363d] transition-colors shadow-sm"
                  >
                    Open Full Details Page
                  </Link>
                </div>
              </div>

              {/* Right Col: Transcript */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-gray-500" />
                  Transcript Snapshot
                </h4>
                <div className="bg-white dark:bg-[#161b22] p-4 rounded-lg border border-gray-200/50 dark:border-white/5 shadow-sm max-h-[300px] overflow-y-auto">
                  {log.transcript ? (
                    <div className="space-y-3">
                      {log.transcript.split('\n').filter(Boolean).map((line: string, i: number) => {
                        const isAgent = line.toLowerCase().startsWith('assistant:') || line.toLowerCase().startsWith('agent:');
                        return (
                          <div key={i} className={`text-sm ${isAgent ? 'text-blue-600 dark:text-[#2f81f7]' : 'text-gray-700 dark:text-[#e6edf3]'}`}>
                            <span className="font-semibold text-xs opacity-70 block mb-0.5">
                              {isAgent ? 'Agent' : 'User'}
                            </span>
                            {line.replace(/^(assistant|user|agent):\s*/i, '')}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No transcript available.</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main table ───────────────────────────────────────────────────────────────
export default function CallLogsTable({ logs, loading }: { logs: any[]; loading?: boolean }) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [syncingLogs, setSyncingLogs] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200/50 dark:border-white/8 bg-white/80 dark:bg-[#161b22]/60 backdrop-blur-md shadow-sm flex-1 overflow-hidden flex flex-col">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 dark:text-gray-400 uppercase bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200/50 dark:border-white/5 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-4 w-10"></th>
              <th className="px-4 py-4 font-medium tracking-wider">Timestamp</th>
              <th className="px-4 py-4 font-medium tracking-wider">Status &amp; Mode</th>
              <th className="px-4 py-4 font-medium tracking-wider">Caller Details</th>
              <th className="px-4 py-4 font-medium tracking-wider max-w-[200px]">What is said</th>
              <th className="px-4 py-4 font-medium tracking-wider">Metrics</th>
              <th className="px-4 py-4 font-medium tracking-wider">Sentiment</th>
              <th className="px-4 py-4 font-medium tracking-wider">CRM Status</th>
              <th className="px-4 py-4 font-medium tracking-wider">Recording</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80 dark:divide-white/5">
            {logs.length === 0 && !loading ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-gray-400 dark:text-[#8b949e]">
                  <div className="flex flex-col items-center justify-center">
                    <Activity className="w-8 h-8 mb-3 text-gray-200 dark:text-[#30363d]" />
                    No calls logged yet. Complete a call to generate analytics.
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log: any, idx: number) => {
                const isPositive = log.sentiment?.toLowerCase().includes("positive");
                const isNegative = log.sentiment?.toLowerCase().includes("negative");
                const callerNumber = getCallerNumber(log);
                const costDisplay = formatCostINR(log.cost);
                const hasRecording = !!(log.recording_path || log.sip_call_id);
                const rowKey = `${log.sip_call_id || log.id || 'log'}-${idx}`;
                const isExpanded = expandedRows.has(rowKey);

                const userName = log.user_info?.name || "Unknown Caller";
                const whatIsSaid = log.caller_intent || log.summary || "No details available.";

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className={`hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors duration-150 group cursor-pointer ${isExpanded ? 'bg-gray-50 dark:bg-[#21262d]' : ''}`}
                      onClick={() => toggleRow(rowKey)}
                    >
                      <td className="px-4 py-4">
                        <button className="text-gray-400 hover:text-gray-700 dark:text-[#8b949e] dark:hover:text-white transition-all duration-200">
                          <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            <ChevronDown className="w-5 h-5" />
                          </div>
                        </button>
                      </td>
                      <td suppressHydrationWarning className="px-4 py-4 whitespace-nowrap text-gray-800 dark:text-[#e6edf3]">
                        {new Date(log.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-[#2ea043]">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-[#2ea043]"></div>
                            {log.status || "Completed"}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border inline-flex w-fit ${
                            log.direction === "inbound"
                              ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-[#2f81f7]/10 dark:text-[#2f81f7] dark:border-[#2f81f7]/20"
                              : "bg-purple-50 text-purple-600 border-purple-200 dark:bg-[#a371f7]/10 dark:text-[#a371f7] dark:border-[#a371f7]/20"
                          }`}>
                            {log.mode || "Voice Agent"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white">{userName}</span>
                          <span className="text-gray-500 dark:text-[#8b949e] text-xs mt-0.5">{callerNumber}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs text-gray-600 dark:text-[#8b949e] line-clamp-2 max-w-[250px]" title={whatIsSaid}>
                          {whatIsSaid}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="text-gray-500 dark:text-[#8b949e]">Dur: <span className="text-gray-800 dark:text-[#e6edf3] font-medium">{formatDuration(log.duration)}</span></span>
                          <span className="text-gray-500 dark:text-[#8b949e]">MOS: <span className="text-gray-800 dark:text-[#e6edf3] font-medium">{log.mos}</span></span>
                          <span className="text-gray-500 dark:text-[#8b949e]">Cost: <span className="text-gray-800 dark:text-[#e6edf3] font-medium">{costDisplay}</span></span>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border shadow-sm ${
                          isPositive
                            ? "bg-green-50 text-green-600 border-green-200 dark:bg-[#2ea043]/10 dark:text-[#2ea043] dark:border-[#2ea043]/30"
                            : isNegative
                            ? "bg-red-50 text-red-600 border-red-200 dark:bg-[#da3633]/10 dark:text-[#da3633] dark:border-[#da3633]/30"
                            : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#8b949e]/10 dark:text-[#8b949e] dark:border-[#8b949e]/30"
                        }`}>
                          {log.sentiment || "Neutral"}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {log.crm_sync_status === "synced" ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-[#2ea043]" />
                              <span className="text-xs font-medium text-green-600 dark:text-[#2ea043]">Synced</span>
                            </>
                          ) : log.crm_sync_status === "pending" || syncingLogs.has(rowKey) ? (
                            <>
                              <RefreshCw className="w-4 h-4 text-yellow-500 dark:text-[#d29922] animate-spin" />
                              <span className="text-xs font-medium text-yellow-600 dark:text-[#d29922]">Syncing...</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 text-red-400 dark:text-[#f85149]" />
                              <span className="text-xs font-medium text-red-500 dark:text-[#f85149]">Not Synced</span>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setSyncingLogs(prev => new Set(prev).add(rowKey));
                                  const success = await syncToCrm(log);
                                  if (success) {
                                    // Update the log's sync status
                                    log.crm_sync_status = "synced";
                                    // Force re-render
                                    setExpandedRows(prev => new Set(prev));
                                  }
                                  setSyncingLogs(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(rowKey);
                                    return newSet;
                                  });
                                }}
                                className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
                                title="Sync to CRM"
                              >
                                <Upload className="w-3.5 h-3.5 text-blue-500 dark:text-[#2f81f7]" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {hasRecording ? (
                          <Link
                            href={`/logs/${log.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-[#2f81f7] bg-blue-50 dark:bg-[#2f81f7]/10 border border-blue-200 dark:border-[#2f81f7]/20 rounded-md hover:bg-blue-100 dark:hover:bg-[#2f81f7]/20 transition-colors"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {formatDuration(log.duration)}
                          </Link>
                        ) : (
                          <span className="text-gray-300 dark:text-[#30363d] text-xs">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Animated Expanded Details Row */}
                    <ExpandedDetails log={log} isExpanded={isExpanded} />
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
