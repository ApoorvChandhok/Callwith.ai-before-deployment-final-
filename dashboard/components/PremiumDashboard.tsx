"use client";

import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Copy, Plus, ArrowUpRight, Lock, CreditCard, ChevronDown, RefreshCw, Bot } from "lucide-react";

// Mock data for the chart to match the beautiful smooth curve in the screenshot
const chartData = [
  { name: "Oct", value: 10000 },
  { name: "Nov", value: 15000 },
  { name: "Dec", value: 12000 },
  { name: "Jan", value: 22433 },
  { name: "Feb", value: 18000 },
];

// Mock recent transactions (calls)
const recentCalls = [
  { id: 1, name: "Rafael", role: "Sales Follow-up", avatar: "https://i.pravatar.cc/150?img=11", agent: "Outbound Agent", amount: "+$25.00", time: "10 Oct 2024, 6:20 PM", positive: true },
  { id: 2, name: "Netflix", role: "Support Inquiry", avatar: "https://i.pravatar.cc/150?img=1", agent: "Inbound Agent", amount: "-$9.99", time: "8 Oct 2024, 10:54 AM", positive: false },
  { id: 3, name: "Annie Weilder", role: "Lead Gen", avatar: "https://i.pravatar.cc/150?img=5", agent: "Outbound Agent", amount: "+$13.25", time: "4 Oct 2024, 6:20 PM", positive: true },
  { id: 4, name: "Spotify", role: "Support Inquiry", avatar: "https://i.pravatar.cc/150?img=8", agent: "Inbound Agent", amount: "-$12.99", time: "4 Oct 2024, 2:58 PM", positive: false },
];

export default function PremiumDashboard() {
  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-10 fade-in-up">
      
      {/* Top Row Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 1. Balance Card (col-span-3) */}
        <div className="lg:col-span-4 bg-white dark:bg-[#1A1A1A] rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[13px] text-gray-500 font-medium mb-1">Total wallet balance</p>
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">$19,232.00</h2>
            
            <div className="mt-8 space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-1">Active Agent ID:</p>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-medium text-gray-900 dark:text-gray-200">ag_000 000 000</span>
                  <button className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-md text-[10px] font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
              </div>
              
              <div>
                <p className="text-xs text-gray-400 mb-1">API Key:</p>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-medium text-gray-900 dark:text-gray-200">sk_1370 0591 5155</span>
                  <button className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-white/5 rounded-md text-[10px] font-medium hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <button className="mt-8 w-max flex items-center gap-2 bg-black dark:bg-white text-white dark:text-black px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-black/20 dark:shadow-white/20">
            <Plus className="w-4 h-4" /> Fund account
          </button>
        </div>

        {/* 2. Chart Card (col-span-5) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#1A1A1A] rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[13px] text-gray-500 font-medium mb-1">Total API calls over time</p>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">124,648</h2>
            </div>
            
            {/* Segmented Control */}
            <div className="flex bg-gray-50 dark:bg-[#111] rounded-lg p-1 border border-gray-100 dark:border-white/5">
              <button className="px-3 py-1 bg-white dark:bg-[#222] shadow-sm rounded-md text-[11px] font-semibold text-gray-900 dark:text-white">Area Chart</button>
              <button className="px-3 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Line Chart</button>
              <button className="px-3 py-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Pie Chart</button>
            </div>
          </div>
          
          <div className="flex-1 min-h-[200px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(val) => `${val/1000}k`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
                  labelStyle={{ fontWeight: 'bold', color: '#111' }}
                />
                <Area type="monotone" dataKey="value" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
            
            {/* Custom Tooltip Overlay Marker */}
            <div className="absolute top-[35%] right-[25%] flex flex-col items-center pointer-events-none">
              <div className="bg-black text-white text-[10px] font-bold px-2 py-1 rounded-full mb-1">15,433</div>
              <div className="w-[1px] h-24 border-l border-dashed border-gray-800 dark:border-gray-400"></div>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-4">
            <button className="flex items-center gap-2 text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <CreditCard className="w-3.5 h-3.5" /> CallWith.ai Outbound <ChevronDown className="w-3 h-3 ml-1" />
            </button>
            <button className="flex items-center gap-2 text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              All time <ChevronDown className="w-3 h-3 ml-1" />
            </button>
          </div>
        </div>

        {/* 3. Card Settings (col-span-3) */}
        <div className="lg:col-span-3 bg-white dark:bg-[#1A1A1A] rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm flex flex-col">
          <p className="text-[13px] text-gray-500 font-medium mb-4">Agent settings</p>
          
          <button className="flex items-center justify-between text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors w-full mb-4">
            <div className="flex items-center gap-2"><Bot className="w-3.5 h-3.5" /> Sales Agent *2432</div>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          
          {/* Virtual Card Visual */}
          <div className="w-full aspect-[1.6/1] rounded-2xl relative overflow-hidden p-5 flex flex-col justify-between shadow-xl mb-4 group cursor-pointer hover:scale-[1.02] transition-transform duration-300">
            {/* Background Gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#1A0B2E] via-[#4A00E0] to-[#8E2DE2] z-0"></div>
            <div className="absolute top-[-50%] right-[-20%] w-full h-full bg-[#FF416C] rounded-full blur-[80px] opacity-40 mix-blend-screen"></div>
            
            <div className="relative z-10 flex justify-between items-start">
              <span className="text-white text-sm font-semibold tracking-widest opacity-90">2456 **** **** 2432</span>
              <ArrowUpRight className="w-4 h-4 text-white opacity-70 group-hover:opacity-100 transition-opacity" />
            </div>
            
            <div className="relative z-10">
              <span className="bg-white/20 backdrop-blur-md border border-white/30 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">CallWith.ai Business</span>
            </div>
            
            <div className="relative z-10 flex justify-between items-end mt-4">
              <div className="flex gap-4">
                <div className="flex flex-col">
                  <span className="text-white/50 text-[8px] uppercase tracking-wider mb-0.5">Valid Thru</span>
                  <span className="text-white text-[11px] font-medium">12/28</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-white/50 text-[8px] uppercase tracking-wider mb-0.5 border border-white/20 px-1 rounded cursor-pointer hover:bg-white/20 transition-colors">See KEY</span>
                </div>
              </div>
              <div className="text-white font-black italic tracking-tighter text-lg">VISA</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-auto">
            <button className="flex items-center justify-center gap-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <RefreshCw className="w-3 h-3" /> Reset stats
            </button>
            <button className="flex items-center justify-center gap-2 text-[11px] font-semibold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <Lock className="w-3 h-3" /> Lock agent
            </button>
          </div>
        </div>
        
      </div>

      {/* Bottom Row Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 4. Transactions List (col-span-8) */}
        <div className="lg:col-span-8 bg-white dark:bg-[#1A1A1A] rounded-3xl p-6 border border-gray-100 dark:border-white/5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Calls</h3>
            <button className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              All calls <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          
          <div className="w-full">
            <div className="grid grid-cols-4 text-[11px] font-semibold text-gray-400 pb-3 border-b border-gray-100 dark:border-white/5 mb-2 px-2">
              <div className="col-span-1">Contact</div>
              <div className="col-span-1 text-center">Agent</div>
              <div className="col-span-1 text-center">Cost</div>
              <div className="col-span-1 text-right">Time</div>
            </div>
            
            <div className="flex flex-col gap-1">
              {recentCalls.map((call) => (
                <div key={call.id} className="grid grid-cols-4 items-center p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer">
                  <div className="col-span-1 flex items-center gap-3">
                    <img src={call.avatar} alt={call.name} className="w-9 h-9 rounded-full object-cover shadow-sm border border-gray-100 dark:border-gray-800" />
                    <div className="flex flex-col">
                      <span className="text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{call.name}</span>
                      <span className="text-[10px] font-medium text-gray-400">{call.role}</span>
                    </div>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className="text-[12px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/5 px-2 py-1 rounded-md">{call.agent}</span>
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`text-[12px] font-bold px-2 py-1 rounded-md ${call.positive ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                      {call.amount}
                    </span>
                  </div>
                  <div className="col-span-1 text-right text-[11px] font-medium text-gray-400">
                    {call.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Bonus CTA Card (col-span-4) */}
        <div className="lg:col-span-4 bg-[#111111] rounded-3xl p-1 relative overflow-hidden shadow-2xl flex flex-col group">
          {/* Stunning Background Gradients inside the dark card */}
          <div className="absolute bottom-[-20%] left-[-10%] w-[80%] h-[60%] bg-[#FF5F1F] rounded-full blur-[80px] opacity-40 mix-blend-screen transition-transform duration-700 group-hover:scale-110"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[60%] bg-[#B100FF] rounded-full blur-[80px] opacity-40 mix-blend-screen transition-transform duration-700 group-hover:scale-110"></div>
          
          <div className="bg-[#1A1A1A]/80 backdrop-blur-xl rounded-[20px] p-6 h-full flex flex-col relative z-10 border border-white/10">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Bonus</div>
            
            {/* Cutout Ticket Shape */}
            <div className="bg-white rounded-2xl p-5 relative mb-auto shadow-xl">
              <h3 className="text-xl font-extrabold text-black leading-tight mb-8">
                Complete a 5-step onboarding to earn $100 to spend on your favorite workflows
              </h3>
              
              {/* Dashed line cutout */}
              <div className="absolute left-0 right-0 bottom-[60px] border-t-2 border-dashed border-gray-200 w-full"></div>
              <div className="absolute left-[-10px] bottom-[50px] w-5 h-5 bg-[#1A1A1A] rounded-full"></div>
              <div className="absolute right-[-10px] bottom-[50px] w-5 h-5 bg-[#1A1A1A] rounded-full"></div>
              
              <div className="flex items-end justify-between mt-8 pt-4">
                <span className="text-[12px] font-bold text-gray-400">Free coupon</span>
                <span className="text-2xl font-black text-black">$100</span>
              </div>
            </div>
            
            <div className="mt-8">
              <p className="text-[13px] font-bold text-white mb-2">Step 3/5.</p>
              <div className="flex gap-1.5 mb-6">
                <div className="h-1 flex-1 bg-white rounded-full"></div>
                <div className="h-1 flex-1 bg-white rounded-full"></div>
                <div className="h-1 flex-1 bg-white rounded-full"></div>
                <div className="h-1 flex-1 bg-white/20 rounded-full"></div>
                <div className="h-1 flex-1 bg-white/20 rounded-full"></div>
              </div>
              
              <button className="w-max flex items-center gap-2 bg-white text-black px-4 py-2 rounded-xl text-[12px] font-bold hover:bg-gray-100 transition-colors shadow-lg">
                Continue onboarding <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
