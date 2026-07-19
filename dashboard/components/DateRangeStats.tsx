"use client";

import React, { useState, useEffect, useRef } from "react";
import { Phone, CheckCircle, Hash, Calendar, ChevronDown } from "lucide-react";

interface DateRangeStatsProps {
  logs: any[];
}

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
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: y.toISOString().split("T")[0], end: y.toISOString().split("T")[0] };
    }
    case "7d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: s.toISOString().split("T")[0], end: today };
    }
    case "30d": {
      const s = new Date(now);
      s.setDate(s.getDate() - 29);
      return { start: s.toISOString().split("T")[0], end: today };
    }
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: s.toISOString().split("T")[0], end: today };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] };
    }
    case "all":
    default:
      return { start: "2026-01-01", end: today };
  }
}

export default function DateRangeStats({ logs = [] }: DateRangeStatsProps) {
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentRange = customStart && customEnd
    ? { start: customStart, end: customEnd }
    : getDateRange(datePreset);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  // Filter logs by date range
  const filteredLogs = logs.filter((l: any) => {
    const logDate = l.timestamp || l.start_time || "";
    if (!logDate) return true;
    const dateStr = logDate.split("T")[0].split(" ")[0];
    return dateStr >= currentRange.start && dateStr <= currentRange.end;
  });

  // Calculate stats
  const totalCalls = filteredLogs.length;
  const totalCost = filteredLogs.reduce((acc: number, l: any) => {
    const raw = l.cost;
    if (typeof raw === 'number') return acc + raw;
    const costStr = typeof raw === 'string' ? raw.replace(/[^0-9.-]/g, '') : '0';
    return acc + (parseFloat(costStr) || 0);
  }, 0);
  const sipTrunkCalls = filteredLogs.filter((l: any) => l.direction === "outbound" || l.call_direction === "outbound").length;
  const voiceApiCalls = filteredLogs.filter((l: any) => l.direction === "inbound" || l.call_direction === "inbound").length;
  const pickupRate = totalCalls > 0
    ? Math.round((filteredLogs.filter((l: any) => l.duration > 0 || l.billsec > 0).length / totalCalls) * 100)
    : 0;
  const activeNumbers = new Set(filteredLogs.filter((l: any) => l.caller_id_number || l.from_number).map((l: any) => l.caller_id_number || l.from_number)).size || 1;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const statCards = [
    { label: "Calls Made", value: totalCalls, color: "text-amber-500", icon: Phone },
    { label: "Total Spend", value: formatCurrency(totalCost), color: "text-blue-500", icon: null },
    { label: "Call Pickup Rate", value: `${pickupRate}%`, color: "text-emerald-500", icon: CheckCircle },
    { label: "SIP Trunk Calls", value: sipTrunkCalls, color: "text-blue-500", icon: Phone },
    { label: "Voice API Calls", value: voiceApiCalls, color: "text-orange-500", icon: Phone },
    { label: "Active Numbers", value: activeNumbers, color: "text-violet-500", icon: Hash },
  ];

  return (
    <div className="space-y-4">
      {/* Date Picker */}
      <div className="flex justify-end">
        <div className="relative" ref={datePickerRef}>
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-100 dark:bg-[#111111] border border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/5 transition-all shadow-sm"
          >
            <Calendar className="w-3.5 h-3.5" />
            {formatDate(currentRange.start)} — {formatDate(currentRange.end)}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showDatePicker && (
            <div className="absolute top-full right-0 mt-2 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl p-3 z-50 min-w-[280px]">
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => {
                      setDatePreset(p.value);
                      setCustomStart("");
                      setCustomEnd("");
                      setShowDatePicker(false);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                      datePreset === p.value && !customStart
                        ? "bg-indigo-500 text-white"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-[#30363d] pt-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Custom Range</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                  />
                  <span className="text-gray-400 text-xs">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="flex-1 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                {customStart && customEnd && (
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="mt-2 w-full px-3 py-1.5 text-xs font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                  >
                    Apply
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-[#111111] rounded-xl border border-gray-100 dark:border-white/5 p-3 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
