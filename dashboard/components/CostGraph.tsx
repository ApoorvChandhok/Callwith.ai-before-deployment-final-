"use client";

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from "recharts";
import { useAppContext } from "./app-provider";

const CustomTooltipUsage = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-[#0d1117] p-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 min-w-[150px] z-50 relative">
        <p className="text-gray-800 dark:text-white text-xs font-bold mb-2">{label}</p>
        <div className="space-y-2">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-gray-300">{entry.name}</span>
              </div>
              <span className="text-gray-900 dark:text-white font-bold ml-6">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const CustomTooltipCost = ({ active, payload, label, formatCurrency }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
    return (
      <div className="bg-white dark:bg-[#0d1117] p-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 min-w-[160px] z-50 relative">
        <p className="text-gray-800 dark:text-white text-xs font-bold mb-2">{label}</p>
        <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold mb-2">Breakdown</p>
        <div className="space-y-2 border-b border-gray-700 pb-3 mb-3">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
                <span className="text-gray-300">{entry.name}</span>
              </div>
              <span className="text-gray-900 dark:text-white font-bold ml-6">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-900 dark:text-white font-bold">Total</span>
          <span className="text-gray-900 dark:text-white font-bold">{formatCurrency(total)}</span>
        </div>
      </div>
    );
  }
  return null;
};

interface CostGraphProps {
  logs?: any[];
  customData?: any[];
  type?: "usage" | "cost" | "inboundOutbound" | "default";
  brushStartIndex?: number;
  brushEndIndex?: number;
  onBrushChange?: (state: any) => void;
}

export default function CostGraph({ logs, customData, type = "default", brushStartIndex, brushEndIndex, onBrushChange }: CostGraphProps) {
  const { formatCurrency } = useAppContext();

  if (type === "usage" && customData) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={customData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
          <defs>
            <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorSip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorVoice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#eab308" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.1} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} dx={-10} />
          <Tooltip content={<CustomTooltipUsage />} cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '5 5' }} />
          <Area type="monotone" dataKey="totalCalls" name="Total Calls" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorCalls)" />
          <Area type="monotone" dataKey="sipTrunk" name="SIP Trunk" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSip)" />
          <Area type="monotone" dataKey="voiceApi" name="Voice API" stroke="#eab308" strokeWidth={3} fillOpacity={1} fill="url(#colorVoice)" />
          <Brush
            dataKey="date"
            height={15}
            stroke="#8b949e"
            fill="rgba(139, 148, 158, 0.1)"
            travellerWidth={10}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === "cost" && customData) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={customData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
          <defs>
            <linearGradient id="colorCdr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorRec" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#fb923c" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorTrans" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorNcc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f87171" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorDid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#c084fc" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.1} />
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7280" }} dy={10} />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#6b7280" }}
            tickFormatter={(value: number) => {
              if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
              if (value >= 100) return `₹${Math.round(value)}`;
              return `₹${value.toFixed(0)}`;
            }}
            dx={-10}
            width={50}
          />
          <Tooltip content={<CustomTooltipCost formatCurrency={formatCurrency} />} cursor={{ stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '5 5' }} />
          <Area type="monotone" dataKey="cdr" name="CDR" stackId="1" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCdr)" />
          <Area type="monotone" dataKey="recording" name="Recording" stackId="1" stroke="#fb923c" strokeWidth={2} fillOpacity={1} fill="url(#colorRec)" />
          <Area type="monotone" dataKey="transcription" name="Transcription" stackId="1" stroke="#2dd4bf" strokeWidth={2} fillOpacity={1} fill="url(#colorTrans)" />
          <Area type="monotone" dataKey="ncc" name="Ncc" stackId="1" stroke="#f87171" strokeWidth={2} fillOpacity={1} fill="url(#colorNcc)" />
          <Area type="monotone" dataKey="didPurchase" name="DID Purchase" stackId="1" stroke="#c084fc" strokeWidth={2} fillOpacity={1} fill="url(#colorDid)" />
          <Brush
            dataKey="date"
            height={15}
            stroke="#8b949e"
            fill="rgba(139, 148, 158, 0.1)"
            travellerWidth={10}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (type === "inboundOutbound" && customData) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={customData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }} barSize={10}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: "#6b7280" }} 
            dy={10} 
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: "#6b7280" }} 
            dx={-10}
          />
          <Tooltip 
            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)", zIndex: 100 }}
            itemStyle={{ fontSize: "12px", fontWeight: 600 }}
            labelStyle={{ fontSize: "10px", color: "#6b7280", marginBottom: "4px" }}
            cursor={{ fill: 'transparent' }}
          />
          <Bar dataKey="inbound" name="Inbound" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
          <Bar dataKey="outbound" name="Outbound" stackId="a" fill="#f97316" radius={[4, 4, 0, 0]} />
          <Brush
            dataKey="date"
            height={15}
            stroke="#8b949e"
            fill="rgba(139, 148, 158, 0.1)"
            travellerWidth={10}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return <div>No Data</div>;
}
