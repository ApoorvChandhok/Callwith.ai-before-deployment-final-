"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "All Time", value: "all" },
];

function getDateRange(preset: string): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  switch (preset) {
    case "today": return { start: today, end: today };
    case "yesterday": { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: y.toISOString().split("T")[0], end: y.toISOString().split("T")[0] }; }
    case "7d": { const s = new Date(now); s.setDate(s.getDate() - 6); return { start: s.toISOString().split("T")[0], end: today }; }
    case "30d": { const s = new Date(now); s.setDate(s.getDate() - 29); return { start: s.toISOString().split("T")[0], end: today }; }
    case "this_month": { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { start: s.toISOString().split("T")[0], end: today }; }
    case "last_month": { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] }; }
    default: return { start: "2026-01-01", end: today };
  }
}

// Store date range globally so DashboardCharts can read it
let globalDateRange = { start: "2026-01-01", end: new Date().toISOString().split("T")[0] };
let globalDateListeners: Array<() => void> = [];

export function getDateRangeGlobal() { return globalDateRange; }
export function onDateRangeChange(cb: () => void) { globalDateListeners.push(cb); return () => { globalDateListeners = globalDateListeners.filter(l => l !== cb); }; }

export default function DashboardHeader() {
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [showPicker, setShowPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowPicker(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const range = getDateRange(datePreset);
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  const handleSelect = (preset: string) => {
    setDatePreset(preset);
    globalDateRange = getDateRange(preset);
    globalDateListeners.forEach(l => l());
    setShowPicker(false);
  };

  return (
    <div className="flex justify-end mb-2">
      <div className="relative" ref={ref}>
        <button onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-100 dark:bg-[#111111] border border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/5 transition-all shadow-sm">
          <Calendar className="w-3.5 h-3.5" />
          {formatDate(range.start)} — {formatDate(range.end)}
          <ChevronDown className="w-3 h-3" />
        </button>
        {showPicker && (
          <div className="absolute top-full right-0 mt-2 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl p-3 z-50 min-w-[240px]">
            <div className="grid grid-cols-2 gap-1.5">
              {DATE_PRESETS.map((p) => (
                <button key={p.value} onClick={() => handleSelect(p.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${datePreset === p.value ? "bg-indigo-500 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
