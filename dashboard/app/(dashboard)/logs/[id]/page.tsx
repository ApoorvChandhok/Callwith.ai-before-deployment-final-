import { getCallDetails } from "@/lib/actions";
import { ArrowLeft, Clock, Phone, Activity, Mic, BrainCircuit, PlayCircle, BarChart3, TrendingUp, AlertTriangle, Headphones, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import path from "path";
import CustomAudioPlayer from "@/components/CustomAudioPlayer";
import TranscriptViewer from "@/components/TranscriptViewer";
import SyncRecordingButton from "@/components/SyncRecordingButton";

export const dynamic = "force-dynamic";


const AGENT_DID = "918065480288";

// VoBiz total_cost is already in INR — format directly, no conversion needed
function formatCostINR(cost: string | number | undefined): string {
  if (cost == null) return "₹0.00";
  const inr = typeof cost === "number" ? cost : (parseFloat(cost.replace(/[^0-9.-]/g, "")) || 0);
  return `₹${inr.toFixed(2)}`;
}

function getCallerNumber(log: any): string {
  if (log.caller_number) return log.caller_number;
  if (log.caller_id && log.caller_id.replace("+", "") !== AGENT_DID) return log.caller_id;
  if (log.phone_number && log.phone_number.replace("+", "") !== AGENT_DID) return log.phone_number;
  return log.phone_number || "Unknown";
}

export default async function SingleCallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const log = await getCallDetails(id);

  if (!log) {
    notFound();
  }

  const isPositive = log.sentiment?.toLowerCase().includes("positive");
  const isNegative = log.sentiment?.toLowerCase().includes("negative");

  // Parse transcript into lines if it's a block of text
  const transcriptLines = log.transcript 
    ? log.transcript.split("\n").filter((line: string) => line.trim() !== "")
    : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 transition-colors duration-200">
      <div className="flex items-center gap-4">
        <Link href="/logs" className="p-2 hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-lg transition-colors text-gray-500 dark:text-[#8b949e] hover:text-gray-900 dark:hover:text-[#e6edf3]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-[#e6edf3] flex items-center gap-3">
            Call Details 
            <span className="text-xs font-mono text-gray-500 dark:text-[#8b949e] bg-gray-100 dark:bg-[#21262d] px-2 py-1 rounded border border-gray-200 dark:border-[#30363d]">
              {log.id}
            </span>
          </h2>
          <p className="text-gray-500 dark:text-[#8b949e]">Detailed analytics, transcript, and audio recording.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Metrics & Info */}
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden shadow-sm transition-colors duration-200">
            <div className="p-5 border-b border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] flex justify-between items-center transition-colors duration-200">
              <h3 className="font-semibold text-gray-900 dark:text-[#e6edf3] flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-500 dark:text-[#2f81f7]" /> Call Info
              </h3>
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-[#2ea043] bg-green-50 dark:bg-[#2ea043]/10 px-2 py-1 rounded-full border border-green-200 dark:border-[#2ea043]/20">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-[#2ea043] animate-pulse"></div>
                {log.status || "Completed"}
              </span>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 bg-blue-50 dark:bg-[#2f81f7]/10 border border-blue-200 dark:border-[#2f81f7]/20 rounded-lg p-3">
                  <p className="text-xs text-blue-600 dark:text-[#2f81f7] uppercase font-semibold tracking-wider mb-1 flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5" /> Agent Number
                  </p>
                  <p className="font-bold text-blue-700 dark:text-[#58a6ff] text-lg font-mono tracking-wide">918065480288</p>
                </div>
                <div className="col-span-2 bg-gray-50 dark:bg-[#21262d] border border-gray-200 dark:border-[#30363d] rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" /> Caller Number
                  </p>
                  <p className="font-bold text-gray-900 dark:text-[#e6edf3] text-lg font-mono tracking-wide">{getCallerNumber(log)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-1">Mode</p>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold border inline-flex w-fit ${
                    log.direction === "inbound" ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-[#2f81f7]/10 dark:text-[#2f81f7] dark:border-[#2f81f7]/20" : "bg-purple-50 text-purple-600 border-purple-200 dark:bg-[#a371f7]/10 dark:text-[#a371f7] dark:border-[#a371f7]/20"
                  }`}>
                    {log.mode || (log.direction === "inbound" ? "Voice Agent" : "Outbound Dialer")}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-1">Duration</p>
                  <p className="font-medium text-gray-900 dark:text-[#e6edf3] flex items-center gap-1.5"><Clock className="w-4 h-4 text-gray-400 dark:text-[#8b949e]"/> {log.duration}s</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-1">Cost</p>
                  <p className="font-medium text-gray-900 dark:text-[#e6edf3] font-mono">{formatCostINR(log.cost)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-1">Timestamp</p>
                  <p className="text-sm text-gray-900 dark:text-[#e6edf3]">{new Date(log.timestamp).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden shadow-sm transition-colors duration-200">
            <div className="p-5 border-b border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] transition-colors duration-200">
              <h3 className="font-semibold text-gray-900 dark:text-[#e6edf3] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-500 dark:text-[#fb8f24]" /> Quality Metrics
              </h3>
            </div>
            <div className="p-5 space-y-4">
               <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-[#30363d]/50">
                  <span className="text-gray-500 dark:text-[#8b949e] text-sm">MOS Score</span>
                  <span className="text-gray-900 dark:text-[#e6edf3] font-bold text-lg">{log.mos}</span>
               </div>
               <div className="flex justify-between items-center pb-3 border-b border-gray-100 dark:border-[#30363d]/50">
                  <span className="text-gray-500 dark:text-[#8b949e] text-sm">Packet Loss</span>
                  <span className="text-green-600 dark:text-[#2ea043] font-medium text-sm">0.02%</span>
               </div>
               <div className="flex justify-between items-center">
                  <span className="text-gray-500 dark:text-[#8b949e] text-sm">Jitter</span>
                  <span className="text-gray-900 dark:text-[#e6edf3] font-medium text-sm">12ms</span>
               </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden shadow-sm transition-colors duration-200">
            <div className="p-5 border-b border-gray-200 dark:border-[#30363d] bg-gradient-to-r from-purple-50 dark:from-[#a371f7]/10 to-transparent transition-colors duration-200">
              <h3 className="font-semibold text-gray-900 dark:text-[#e6edf3] flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-purple-500 dark:text-[#a371f7]" /> AI Analysis
              </h3>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-2">Sentiment</p>
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium border shadow-sm ${
                  isPositive ? "bg-green-50 text-green-600 border-green-200 dark:bg-[#2ea043]/10 dark:text-[#2ea043] dark:border-[#2ea043]/30" :
                  isNegative ? "bg-red-50 text-red-600 border-red-200 dark:bg-[#da3633]/10 dark:text-[#da3633] dark:border-[#da3633]/30" :
                  "bg-gray-100 text-gray-600 border-gray-200 dark:bg-[#8b949e]/10 dark:text-[#8b949e] dark:border-[#8b949e]/30"
                }`}>
                  {log.sentiment || "Neutral"}
                </span>
              </div>
              
              <div>
                <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-2">Detected Intent</p>
                <div className="bg-gray-50 dark:bg-[#0d1117] p-3 rounded-lg border border-gray-200 dark:border-[#30363d]">
                   <p className="text-gray-900 dark:text-[#e6edf3] text-sm">{log.caller_intent}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-[#8b949e] uppercase font-semibold tracking-wider mb-2">Executive Summary</p>
                <p className="text-gray-600 dark:text-[#8b949e] text-sm leading-relaxed">{log.summary}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Audio & Transcript */}
        <div className="space-y-6 lg:col-span-2">
          
          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden shadow-sm transition-colors duration-200">
            <div className="p-5 border-b border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] transition-colors duration-200">
              <h3 className="font-semibold text-gray-900 dark:text-[#e6edf3] flex items-center gap-2">
                <Mic className="w-4 h-4 text-green-500 dark:text-[#2ea043]" /> Call Recording
              </h3>
            </div>
            <div className="p-6 flex flex-col items-center justify-center bg-gray-50 dark:bg-gradient-to-b dark:from-[#161b22] dark:to-[#0d1117] transition-colors duration-200">
              <div className="w-full max-w-lg space-y-4">
                <CustomAudioPlayer
                  src={(log.sip_call_id || log.recording_path)
                    ? `/api/recordings/${log.sip_call_id ? `${log.sip_call_id}.wav` : path.basename(log.recording_path)}`
                    : ""}
                />
                <p className="text-xs text-center text-gray-400 dark:text-[#8b949e]">
                  {log.sip_call_id ? `Audio proxied from Vobiz Cloud (${log.mode})` : (log.recording_path ? `Audio recorded via Trunk (${log.mode})` : `No audio recording available for this call`)}
                </p>
                {!(log.sip_call_id || log.recording_path) && (
                  <SyncRecordingButton logId={log.id} phone={log.phone_number} timestamp={log.timestamp} />
                )}
              </div>
            </div>
          </div>

          <TranscriptViewer transcriptLines={transcriptLines} />

        </div>
      </div>
    </div>
  );
}
