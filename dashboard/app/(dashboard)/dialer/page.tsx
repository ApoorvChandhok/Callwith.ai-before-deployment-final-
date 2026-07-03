"use client";

import { useState } from 'react';
import CallDispatcher from '@/components/CallDispatcher';
import BulkDialer from '@/components/BulkDialer';
import { PhoneOutgoing, Users } from 'lucide-react';

export default function DialerPage() {
  const [activeTab, setActiveTab] = useState<'manual' | 'bulk'>('manual');

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* Header with integrated info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-[#e6edf3]">Outbound Campaigns</h2>
          <p className="text-gray-500 dark:text-[#8b949e] text-sm">
            {activeTab === 'manual'
              ? "Deploy a single voice agent immediately. Enter the recipient's phone number and provide specific context that the agent should know before dialing."
              : "Upload a CSV file to deploy agents in bulk. The CSV must contain a 'phone' column. The agent will dial each number sequentially."}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-[#8b949e]">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-[#2ea043]" />Ultra-low latency</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-[#2ea043]" />Noise cancellation</span>
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-[#2ea043]" />Sentiment analysis</span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200/50 dark:border-white/8 pb-px">
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 ${
            activeTab === 'manual'
              ? "border-indigo-500 dark:border-indigo-400 text-gray-900 dark:text-white"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300/50 dark:hover:border-white/10"
          }`}
        >
          <PhoneOutgoing className="w-4 h-4" />
          Single Dispatch
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 ${
            activeTab === 'bulk'
              ? "border-violet-500 dark:border-violet-400 text-gray-900 dark:text-white"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300/50 dark:hover:border-white/10"
          }`}
        >
          <Users className="w-4 h-4" />
          Bulk Campaign
        </button>
      </div>

      <div className="bg-white/80 dark:bg-[#161b22]/60 backdrop-blur-md border border-gray-200/50 dark:border-white/8 rounded-2xl shadow-sm flex-1 overflow-hidden">
        {activeTab === 'manual' ? <CallDispatcher /> : <BulkDialer />}
      </div>
    </div>
  );
}
