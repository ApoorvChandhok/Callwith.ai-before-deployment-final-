"use client";

import React, { useState, useEffect, useRef } from "react";
import CostGraph from "./CostGraph";
import { Clock, Calendar } from "lucide-react";
import { getDateRangeGlobal, onDateRangeChange } from "./DashboardHeader";

interface DashboardChartsProps {
  stats: any;
  logs?: any[];
}

type ChartType = "usage" | "cost" | "inboundOutbound";

// Preset date ranges
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
      const yesterday = y.toISOString().split("T")[0];
      return { start: yesterday, end: yesterday };
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

export default function DashboardCharts({ stats, logs = [] }: DashboardChartsProps) {
  const [viewMode, setViewMode] = useState<"daily" | "hourly">("daily");
  const [, forceUpdate] = useState(0);

  // Listen for date range changes from DashboardHeader
  useEffect(() => {
    return onDateRangeChange(() => forceUpdate(n => n + 1));
  }, []);
  
  const [brushState, setBrushState] = useState<Record<ChartType, { startIndex?: number; endIndex?: number }>>({
    usage: {},
    cost: {},
    inboundOutbound: {}
  });
  
  const isMounted = useRef(false);

  // Initialize state from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem("dashboard-view-mode") as "daily" | "hourly";
    const mode = savedMode === "daily" || savedMode === "hourly" ? savedMode : "daily";
    
    setViewMode(mode);
    
    const charts: ChartType[] = ["usage", "cost", "inboundOutbound"];
    const newState = {
      usage: {},
      cost: {},
      inboundOutbound: {}
    } as Record<ChartType, { startIndex?: number; endIndex?: number }>;

    charts.forEach((chart) => {
      const savedStart = localStorage.getItem(`dashboard-brush-start-${chart}-${mode}`);
      const savedEnd = localStorage.getItem(`dashboard-brush-end-${chart}-${mode}`);
      const parsedStart = savedStart !== null ? parseInt(savedStart, 10) : NaN;
      const parsedEnd = savedEnd !== null ? parseInt(savedEnd, 10) : NaN;
      newState[chart] = {
        startIndex: !isNaN(parsedStart) ? parsedStart : undefined,
        endIndex: !isNaN(parsedEnd) ? parsedEnd : undefined,
      };
    });
    
    setBrushState(newState);
    isMounted.current = true;
  }, []);

  const handleViewModeChange = (mode: "daily" | "hourly") => {
    setViewMode(mode);
    localStorage.setItem("dashboard-view-mode", mode);
    
    // Load brush values for the new mode separately for each chart
    const charts: ChartType[] = ["usage", "cost", "inboundOutbound"];
    const newState = {
      usage: {},
      cost: {},
      inboundOutbound: {}
    } as Record<ChartType, { startIndex?: number; endIndex?: number }>;

    charts.forEach((chart) => {
      const savedStart = localStorage.getItem(`dashboard-brush-start-${chart}-${mode}`);
      const savedEnd = localStorage.getItem(`dashboard-brush-end-${chart}-${mode}`);
      const parsedStart = savedStart !== null ? parseInt(savedStart, 10) : NaN;
      const parsedEnd = savedEnd !== null ? parseInt(savedEnd, 10) : NaN;
      newState[chart] = {
        startIndex: !isNaN(parsedStart) ? parsedStart : undefined,
        endIndex: !isNaN(parsedEnd) ? parsedEnd : undefined,
      };
    });

    setBrushState(newState);
  };

  const handleBrushChange = (chart: ChartType) => (state: any) => {
    if (!isMounted.current) return;
    if (state && typeof state.startIndex === 'number' && !isNaN(state.startIndex) && typeof state.endIndex === 'number' && !isNaN(state.endIndex)) {
      setBrushState((prev) => ({
        ...prev,
        [chart]: { startIndex: state.startIndex, endIndex: state.endIndex }
      }));
      localStorage.setItem(`dashboard-brush-start-${chart}-${viewMode}`, state.startIndex.toString());
      localStorage.setItem(`dashboard-brush-end-${chart}-${viewMode}`, state.endIndex.toString());
    }
  };

  const isDaily = viewMode === "daily";

  // Use global date range from DashboardHeader
  const currentRange = getDateRangeGlobal();

  // Filter data by date range
  const filterByDateRange = (data: any[]) => {
    if (!data || !Array.isArray(data)) return [];
    return data.filter((item: any) => {
      const itemDate = item.date || item.name || "";
      if (!itemDate) return true;

      // Parse "Jul 16" or "Jul 16, 2026" format to ISO date
      const parseChartDate = (d: string): string => {
        try {
          // Handle "Jul 16" format (current chart format)
          const currentYear = new Date().getFullYear();
          const parsed = new Date(`${d}, ${currentYear}`);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split("T")[0];
          }
          // Handle ISO format
          const isoParsed = new Date(d);
          if (!isNaN(isoParsed.getTime())) {
            return isoParsed.toISOString().split("T")[0];
          }
        } catch {}
        return d; // fallback to raw string
      };

      const itemDateISO = parseChartDate(itemDate);
      return itemDateISO >= currentRange.start && itemDateISO <= currentRange.end;
    });
  };

  const usageData = filterByDateRange(isDaily ? stats.usageChartData : stats.hourlyUsageData);
  const costData = filterByDateRange(isDaily ? stats.costChartData : stats.hourlyCostData);
  const inboundOutboundData = filterByDateRange(isDaily ? stats.inboundOutboundData : stats.hourlyInboundOutboundData);

  // Calculate filtered stats based on date range
  const filteredLogs = logs.filter((l: any) => {
    const logDate = l.timestamp || l.start_time || "";
    if (!logDate) return true;
    const dateStr = logDate.split("T")[0].split(" ")[0];
    return dateStr >= currentRange.start && dateStr <= currentRange.end;
  });

  const filteredStats = {
    totalCalls: filteredLogs.length,
    totalCost: filteredLogs.reduce((acc: number, l: any) => {
      const raw = l.cost;
      if (typeof raw === 'number') return acc + raw;
      const costStr = typeof raw === 'string' ? raw.replace(/[^0-9.-]/g, '') : '0';
      return acc + (parseFloat(costStr) || 0);
    }, 0),
    sipTrunkCalls: filteredLogs.filter((l: any) => l.direction === "outbound" || l.call_direction === "outbound").length,
    voiceApiCalls: filteredLogs.filter((l: any) => l.direction === "inbound" || l.call_direction === "inbound").length,
    pickupRate: filteredLogs.length > 0
      ? Math.round((filteredLogs.filter((l: any) => l.duration > 0 || l.billsec > 0).length / filteredLogs.length) * 100)
      : 0,
    activeNumbers: new Set(filteredLogs.filter((l: any) => l.caller_id_number || l.from_number).map((l: any) => l.caller_id_number || l.from_number)).size || 1,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div className="space-y-6 p-5">
      <div className="flex justify-end mb-2">
        {/* Hourly/Daily Toggle */}
        <div className="bg-gray-100 dark:bg-[#111111] border border-gray-200 dark:border-white/5 p-1 rounded-xl flex items-center shadow-sm">
          <button
            onClick={() => handleViewModeChange("hourly")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              !isDaily ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Hourly
          </button>
          <button
            onClick={() => handleViewModeChange("daily")}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              isDaily ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" /> Daily
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-white/5 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Usage Overview</h3>
          <div className="h-[200px] w-full">
            <CostGraph 
              logs={[]} 
              customData={usageData} 
              type="usage" 
              brushStartIndex={brushState.usage.startIndex}
              brushEndIndex={brushState.usage.endIndex}
              onBrushChange={handleBrushChange("usage")}
            />
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs font-semibold text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Total Calls</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SIP Trunk</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> Voice API</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-white/5 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Cost Analysis</h3>
          <div className="h-[200px] w-full">
            <CostGraph 
              logs={[]} 
              customData={costData} 
              type="cost" 
              brushStartIndex={brushState.cost.startIndex}
              brushEndIndex={brushState.cost.endIndex}
              onBrushChange={handleBrushChange("cost")}
            />
          </div>
          <div className="flex items-center gap-3 mt-4 text-[10px] font-semibold text-gray-600 dark:text-gray-400 flex-wrap">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> CDR</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400"></div> Recording</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal-400"></div> Transcription</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400"></div> Ncc</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-400"></div> DID Purchase</span>
          </div>
        </div>
      </div>

      {/* ROW 3: Bar Chart */}
      <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-white/5 p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Inbound & Outbound Calls</h3>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Activity by {isDaily ? "date" : "hour"}</span>
        </div>
        <div className="h-[150px] w-full">
           <CostGraph 
             logs={[]} 
             customData={inboundOutboundData} 
             type="inboundOutbound" 
             brushStartIndex={brushState.inboundOutbound.startIndex}
             brushEndIndex={brushState.inboundOutbound.endIndex}
             onBrushChange={handleBrushChange("inboundOutbound")}
           />
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-green-500"></div> Inbound</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-orange-400"></div> Outbound</span>
        </div>
      </div>
    </div>
  );
}
