"use server";

import fs from "fs";
import path from "path";

import { analyzeTranscript } from "./groq-analyzer";
import { revalidatePath } from "next/cache";

// Supabase sync helpers — imported lazily to avoid breaking if Supabase is not configured
import {
  updateLeadInSupabase,
  deleteLeadFromSupabase,
  bulkDeleteLeadsFromSupabase,
  bulkUpdateLeadsInSupabase,
  addLeadToSupabase,
  getLeadsFromSupabase,
} from "@/lib/supabase/leads-actions";
import { getCallLogsFromSupabase } from "@/lib/supabase/call-log-actions";

// Define paths relative to the root project (one level up from dashboard)
const DATA_DIR = path.join(process.cwd(), "..", "data");
const LOGS_FILE = path.join(DATA_DIR, "call_logs.json");
const LEADS_FILE = path.join(DATA_DIR, "leads.csv");
const ANALYSIS_CACHE_FILE = path.join(DATA_DIR, "analysis_cache.json");
const LEADS_META_FILE = path.join(DATA_DIR, "leads_meta.json");

import crypto from "crypto";

export async function getCallLogs() {
  try {
    // 0. Load env variables manually since dashboard runs in a subdirectory
    const envPath = path.join(process.cwd(), "..", ".env");
    let authId = process.env.VOBIZ_AUTH_ID;
    let authToken = process.env.VOBIZ_AUTH_TOKEN;
    
    if (fs.existsSync(envPath) && (!authId || !authToken)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split("\n").forEach(line => {
        const [key, ...values] = line.split("=");
        if (key === "VOBIZ_AUTH_ID") authId = values.join("=").trim().replace(/\r/g, "");
        if (key === "VOBIZ_AUTH_TOKEN") authToken = values.join("=").trim().replace(/\r/g, "");
      });
    }

    // 1. Fetch local logs (for AI Sentiment, Summary, Transcript)
    let localLogs: any[] = await getCallLogsFromSupabase();
    
    // Fallback to local JSON if Supabase has no records (e.g. fresh clone or un-migrated DB)
    if ((!localLogs || localLogs.length === 0) && fs.existsSync(LOGS_FILE)) {
      localLogs = JSON.parse(fs.readFileSync(LOGS_FILE, "utf-8"));
    }

    // Load Groq Analysis Cache
    let analysisCache: Record<string, any> = {};
    if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
      analysisCache = JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, "utf-8"));
    }
    
    // 2. Fetch Vobiz CDRs, Transcripts, and Recordings
    let vobizCdrs: any[] = [];
    let vobizTranscripts: any[] = [];
    let vobizRecordings: any[] = [];
    
    if (authId && authToken && authId !== "your_auth_id_here") {
      const headers = {
        "X-Auth-ID": authId,
        "X-Auth-Token": authToken,
        "Accept": "application/json"
      };
      
      try {
        [vobizCdrs, vobizTranscripts, vobizRecordings] = await Promise.all([
          fetchAllVobizCdrs(authId, headers),
          fetchAllVobizTranscripts(authId, headers),
          fetchAllVobizRecordings(authId, headers)
        ]);
      } catch (err) {
        console.error("Failed to fetch Vobiz data:", err);
      }
    }
    
    // 3. Merge Local Logs and Vobiz CDRs
    let mergedLogs: any[] = [];
    
    const matchedLocalLogIndices = new Set<number>();

    // Process all Vobiz CDRs first
    vobizCdrs.forEach((cdr: any) => {
      const normalizedDest = cdr.destination_number?.replace("+", "");
      const normalizedCaller = cdr.caller_id_number?.replace("+", "");
      
      const cdrTime = new Date(cdr.start_time || new Date()).getTime();

      // Find matching local log - closest in time that hasn't been matched yet
      let bestMatchIndex = -1;
      let minTimeDiff = Infinity;

      localLogs.forEach((log: any, index: number) => {
        if (matchedLocalLogIndices.has(index)) return;
        
        const logPhone = log.phone_number?.replace("+", "");
        if (logPhone === normalizedDest || logPhone === normalizedCaller) {
          const logTime = new Date(log.timestamp).getTime();
          const diff = Math.abs(logTime - cdrTime);
          if (diff < minTimeDiff && diff < 1000 * 60 * 60) { // within 1 hour
            minTimeDiff = diff;
            bestMatchIndex = index;
          }
        }
      });
      
      const localMatch = bestMatchIndex !== -1 ? localLogs[bestMatchIndex] : undefined;
      if (bestMatchIndex !== -1) {
        matchedLocalLogIndices.add(bestMatchIndex);
      }
      
      // Find matching Vobiz Transcript and Recording
      const vobizTranscript = vobizTranscripts.find((t: any) => t.call_uuid === cdr.sip_call_id);
      const vobizRecording = vobizRecordings.find((r: any) => r.call_uuid === cdr.sip_call_id);

      // We use the local match for transcript/sentiment if it exists, otherwise fallback to Vobiz
      const transcriptStr = localMatch?.transcript || vobizTranscript?.transcription_text || "";
      
      // Use cached Groq analysis if available
      const cachedAnalysis = analysisCache[cdr.uuid] || analysisCache[cdr.sip_call_id];
      const sentimentStr = cachedAnalysis?.sentiment || localMatch?.sentiment || (vobizTranscript?.sentiment ? parseVobizSentiment(vobizTranscript.sentiment) : "Neutral");
      const summaryStr = cachedAnalysis?.short_summary || localMatch?.summary || vobizTranscript?.summary || "Summary generated locally or missing.";
      const intentStr = cachedAnalysis?.lead_info?.intent || "";
      
      const parsedTransCost = vobizTranscript?.transcription_cost != null ? parseFloat(vobizTranscript.transcription_cost) : 0;
      const parsedRecRate = vobizRecording?.recording_storage_rate != null ? parseFloat(vobizRecording.recording_storage_rate) : 0;
      const parsedRecDur = vobizRecording?.recording_storage_duration != null ? parseFloat(vobizRecording.recording_storage_duration) : 0;

      // Extract actual recording URL from Vobiz response
      const recordingUrl = vobizRecording?.url || vobizRecording?.recording_url || vobizRecording?.audio_url || null;

      mergedLogs.push({
        ...localMatch, // Inherit local fields
        transcript: transcriptStr,
        summary: summaryStr,
        sentiment: sentimentStr,
        caller_intent: intentStr,
        id: cdr.uuid,
        sip_call_id: cdr.sip_call_id,
        recording_path: recordingUrl,
        timestamp: cdr.start_time || localMatch?.timestamp || new Date().toISOString(),
        phone_number: cdr.destination_number || cdr.caller_id_number,
        caller_number: cdr.call_direction === "inbound" ? cdr.caller_id_number : cdr.destination_number,
        caller_id: cdr.caller_id_number,
        duration: cdr.duration,
        mos: cdr.mos || 4.2,
        cost: cdr.total_cost != null ? parseFloat(cdr.total_cost) : 0,
        recording_cost: (parsedRecRate * parsedRecDur) || (cdr.recording_cost != null ? parseFloat(cdr.recording_cost) : 0),
        transcription_cost: parsedTransCost || (cdr.transcription_cost != null ? parseFloat(cdr.transcription_cost) : 0),
        ncc_cost: cdr.ncc_cost != null ? parseFloat(cdr.ncc_cost) : 0,
        did_cost: cdr.did_cost != null ? parseFloat(cdr.did_cost) : 0,
        status: cdr.hangup_cause_name || "Completed",
        mode: cdr.call_direction === "inbound" ? "Voice Agent" : "Outbound Dialer",
        direction: cdr.call_direction,
      });
    });

    // Process any local logs that didn't have a matching CDR
    localLogs.forEach((log: any, index: number) => {
      if (!matchedLocalLogIndices.has(index)) {
        const idStr = `${log.timestamp}-${log.phone_number}`;
        const id = crypto.createHash('md5').update(idStr).digest('hex').substring(0, 8);
        const wordCount = log.transcript ? log.transcript.split(" ").length : 0;
        const simulatedDuration = log.duration || Math.max(15, Math.floor(wordCount / 2.5)); 
        const cachedAnalysis = analysisCache[id] || analysisCache[log.sip_call_id];
        
        const isPositive = log.sentiment?.toLowerCase().includes("positive") || cachedAnalysis?.sentiment === "Positive";
        const mos = log.mos || (isPositive ? (4.0 + Math.random() * 0.8).toFixed(1) : (3.5 + Math.random() * 0.5).toFixed(1));

        mergedLogs.push({
          ...log,
          id,
          duration: simulatedDuration,
          mos,
          sentiment: cachedAnalysis?.sentiment || log.sentiment,
          summary: cachedAnalysis?.short_summary || log.summary,
          caller_intent: cachedAnalysis?.lead_info?.intent,
          mode: log.direction === "inbound" ? "Voice Agent" : "Outbound Dialer",
          status: "Completed",
          cost: parseFloat((simulatedDuration * 0.0015).toFixed(4))
        });
      }
    });

    // Deduplicate final merged logs by phone + timestamp (within 5 minutes)
    const dedupedLogs: any[] = [];
    const seenKeys = new Set<string>();

    mergedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    for (const log of mergedLogs) {
      const phone = (log.caller_number || log.phone_number || "").replace("+", "");
      const time = new Date(log.timestamp).getTime();
      // Create a key from phone number and time rounded to 5 minutes
      const timeKey = Math.floor(time / (1000 * 60 * 5));
      const key = `${phone}_${timeKey}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        dedupedLogs.push(log);
      }
    }

    return dedupedLogs;
  } catch (error) {
    console.error("Error reading call logs:", error);
    return [];
  }
}

// ── Lead Types ─────────────────────────────────────────────────────────────

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Proposal" | "Negotiation" | "Won" | "Lost";
export type LeadPriority = "Low" | "Medium" | "High" | "Urgent";
export type LeadSource = "AI Agent (Inbound)" | "AI Agent (Outbound)" | "Website" | "Referral" | "Google Ads" | "Social Media" | "Walk-in" | "Manual" | "Other";

export interface LeadNote {
  text: string;
  timestamp: string;
}

export interface EnrichedLead {
  // Base (from CSV)
  timestamp: string;
  name: string;
  phone: string;
  city: string;
  // Enriched (from meta JSON)
  email: string;
  status: LeadStatus;
  priority: LeadPriority;
  source: LeadSource;
  businessType: string;  // "Real Estate", "Car Dealership", "Inbound", etc.
  tags: string[];
  notes: LeadNote[];
  assignedTo: string;
  lastActivity: string;
  callCount: number;
  sentiment: string;
  callerIntent: string;
}

interface LeadMeta {
  name?: string;
  city?: string;
  email?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  tags?: string[];
  notes?: LeadNote[];
  assignedTo?: string;
  lastActivity?: string;
}

function readLeadsMeta(): Record<string, LeadMeta> {
  try {
    if (!fs.existsSync(LEADS_META_FILE)) return {};
    return JSON.parse(fs.readFileSync(LEADS_META_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeLeadsMeta(meta: Record<string, LeadMeta>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEADS_META_FILE, JSON.stringify(meta, null, 2), "utf-8");
}

function parseLeadsCsv(): { timestamp: string; name: string; phone: string; city: string }[] {
  try {
    if (!fs.existsSync(LEADS_FILE)) return [];
    const data = fs.readFileSync(LEADS_FILE, "utf-8");
    const lines = data.split("\n").filter(line => line.trim() !== "");
    if (lines.length <= 1) return [];
    return lines.slice(1).map(line => {
      const parts = line.replace(/"/g, "").split(",");
      return {
        timestamp: parts[0] || "",
        name: parts[1] || "",
        phone: parts[2] || "",
        city: parts[3] || "",
      };
    });
  } catch {
    return [];
  }
}

export async function getLeads(): Promise<EnrichedLead[]> {
  try {
    // Try Supabase first
    const sbLeads = await getLeadsFromSupabase();
    if (sbLeads && sbLeads.length > 0) {
      return sbLeads;
    }

    // Fallback to local files if Supabase is empty
    const csvLeads = parseLeadsCsv();
    const meta = readLeadsMeta();

    // Cross-reference call logs for sentiment, intent, call count
    let callLogs: any[] = [];
    try {
      if (fs.existsSync(LOGS_FILE)) {
        callLogs = JSON.parse(fs.readFileSync(LOGS_FILE, "utf-8"));
      }
    } catch { /* ignore */ }

    let analysisCache: Record<string, any> = {};
    try {
      if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
        analysisCache = JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, "utf-8"));
      }
    } catch { /* ignore */ }

    const enriched: EnrichedLead[] = csvLeads.map((lead) => {
      const m = meta[lead.phone] || {};

      // Find matching call logs
      const matchingCalls = callLogs.filter((log: any) =>
        log.phone_number?.replace("+", "").includes(lead.phone.replace("+", "")) ||
        lead.phone.replace("+", "").includes(log.phone_number?.replace("+", "") || "__none__")
      );

      // Find sentiment from analysis cache
      let sentiment = "";
      let callerIntent = "";
      for (const [, analysis] of Object.entries(analysisCache)) {
        const a = analysis as any;
        if (a?.lead_info?.name?.toLowerCase() === lead.name?.toLowerCase()) {
          sentiment = a.sentiment || "";
          callerIntent = a.lead_info?.intent || "";
          break;
        }
      }

      // Also check matching calls for sentiment
      if (!sentiment && matchingCalls.length > 0) {
        const latestCall = matchingCalls[matchingCalls.length - 1];
        sentiment = latestCall.sentiment || "";
        callerIntent = callerIntent || latestCall.caller_intent || "";
      }

      return {
        timestamp: lead.timestamp,
        name: m.name || lead.name,
        phone: lead.phone,
        city: m.city || lead.city,
        email: m.email || "",
        status: m.status || "New",
        priority: m.priority || "Medium",
        source: m.source || "AI Agent (Inbound)",
        tags: m.tags || [],
        notes: m.notes || [],
        assignedTo: m.assignedTo || "",
        lastActivity: m.lastActivity || lead.timestamp,
        callCount: matchingCalls.length,
        sentiment,
        callerIntent,
      };
    });

    return enriched.reverse(); // Newest first
  } catch (error) {
    console.error("Error reading leads:", error);
    return [];
  }
}

export async function getOverviewStats() {
  const logs = await getCallLogs();
  const leads = await getLeads();
  
  const totalCalls = logs.length;
  const totalLeads = leads.length;
  const positiveCalls = logs.filter((l: any) => l.sentiment && l.sentiment.toLowerCase().includes("positive")).length;
  
  const totalDuration = logs.reduce((acc: number, l: any) => acc + (l.duration || 0), 0);
  const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
  
  const totalCostVal = logs.reduce((acc: number, l: any) => {
    const raw = l.cost;
    if (typeof raw === 'number') return acc + raw;
    const costStr = typeof raw === 'string' ? raw.replace(/[^0-9.-]/g, '') : '0';
    return acc + (parseFloat(costStr) || 0);
  }, 0);

  const answeredCalls = logs.filter((l: any) => l.duration > 0 || l.status === "NORMAL_CLEARING" || l.status === "Completed").length;
  const pickupRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
  
  const sipTrunkCalls = logs.filter((l: any) => l.sip_call_id).length || totalCalls;
  const voiceApiCalls = totalCalls - sipTrunkCalls;
  
  // Calculate chart data for last 30 days
  const today = new Date();
  const getDayStr = (d: Date) => d.toISOString().split('T')[0];
  const shortDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  };
  
  const usageChartData = [];
  const costChartData = [];
  const inboundOutboundData = [];
  
  for(let i=29; i>=0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = getDayStr(d);
    const displayDate = shortDate(dateStr);
    
    const dayLogs = logs.filter((l: any) => {
      try {
        return getDayStr(new Date(l.timestamp)) === dateStr;
      } catch (e) {
        return false;
      }
    });
    
    const dayCost = dayLogs.reduce((acc: number, l: any) => {
      const raw = l.cost;
      if (typeof raw === 'number') return acc + raw;
      const costStr = typeof raw === 'string' ? raw.replace(/[^0-9.-]/g, '') : '0';
      return acc + (parseFloat(costStr) || 0);
    }, 0);
    
    const dayRecordingCost = dayLogs.reduce((acc: number, l: any) => acc + (l.recording_cost || 0), 0);
    const dayTranscriptionCost = dayLogs.reduce((acc: number, l: any) => acc + (l.transcription_cost || 0), 0);
    const dayNccCost = dayLogs.reduce((acc: number, l: any) => acc + (l.ncc_cost || 0), 0);
    const dayDidCost = dayLogs.reduce((acc: number, l: any) => acc + (l.did_cost || 0), 0);
    
    usageChartData.push({ date: displayDate, totalCalls: dayLogs.length, sipTrunk: dayLogs.length, voiceApi: 0 });
    costChartData.push({ 
      date: displayDate, 
      cdr: dayCost, 
      recording: dayRecordingCost, 
      transcription: dayTranscriptionCost, 
      ncc: dayNccCost, 
      didPurchase: dayDidCost 
    });
    
    const inbound = dayLogs.filter((l: any) => l.direction === "inbound").length;
    inboundOutboundData.push({
      date: displayDate,
      inbound: inbound,
      outbound: dayLogs.length - inbound
    });
  }
  
  // Calculate chart data for last 24 hours
  const hourlyUsageData = [];
  const hourlyCostData = [];
  const hourlyInboundOutboundData = [];
  
  const getHourStr = (d: Date) => {
    return `${d.toISOString().split('T')[0]}T${d.getHours().toString().padStart(2, '0')}`;
  };
  const shortHourDate = (d: string) => {
    const [datePart, hourPart] = d.split('T');
    const date = new Date(datePart);
    return `${date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} ${hourPart}:00`;
  };

  for(let i=23; i>=0; i--) {
    const d = new Date();
    d.setHours(today.getHours() - i);
    const hourStr = getHourStr(d);
    const displayHour = shortHourDate(hourStr);
    
    const hourLogs = logs.filter((l: any) => {
      try {
        return getHourStr(new Date(l.timestamp)) === hourStr;
      } catch (e) {
        return false;
      }
    });
    
    const hourCost = hourLogs.reduce((acc: number, l: any) => {
      const raw = l.cost;
      if (typeof raw === 'number') return acc + raw;
      const costStr = typeof raw === 'string' ? raw.replace(/[^0-9.-]/g, '') : '0';
      return acc + (parseFloat(costStr) || 0);
    }, 0);
    
    const hRecording = hourLogs.reduce((acc: number, l: any) => acc + (l.recording_cost || 0), 0);
    const hTranscription = hourLogs.reduce((acc: number, l: any) => acc + (l.transcription_cost || 0), 0);
    const hNcc = hourLogs.reduce((acc: number, l: any) => acc + (l.ncc_cost || 0), 0);
    const hDid = hourLogs.reduce((acc: number, l: any) => acc + (l.did_cost || 0), 0);
    
    hourlyUsageData.push({ date: displayHour, totalCalls: hourLogs.length, sipTrunk: hourLogs.length, voiceApi: 0 });
    hourlyCostData.push({ 
      date: displayHour, 
      cdr: hourCost, 
      recording: hRecording, 
      transcription: hTranscription, 
      ncc: hNcc, 
      didPurchase: hDid 
    });
    
    const inbound = hourLogs.filter((l: any) => l.direction === "inbound").length;
    hourlyInboundOutboundData.push({
      date: displayHour,
      inbound: inbound,
      outbound: hourLogs.length - inbound
    });
  }
  
  const activeNumbers = new Set(
    logs.filter((l: any) => l.direction === "inbound" && l.phone_number)
        .map((l: any) => l.phone_number)
  ).size || 1; // Fallback to 1 if no inbound calls yet
  
  // Calculate dynamic changes
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(now.getDate() - 60);

  const current30DaysLogs = logs.filter((l: any) => new Date(l.timestamp) >= thirtyDaysAgo);
  const prev30DaysLogs = logs.filter((l: any) => {
    const d = new Date(l.timestamp);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });

  const getChange = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? "+100.0%" : null;
    if (curr === prev) return null;
    const pct = ((curr - prev) / prev) * 100;
    return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
  };

  const currCost = current30DaysLogs.reduce((acc: number, l: any) => acc + (typeof l.cost === 'number' ? l.cost : parseFloat((l.cost || '0').replace(/[^0-9.-]/g, '')) || 0), 0);
  const prevCost = prev30DaysLogs.reduce((acc: number, l: any) => acc + (typeof l.cost === 'number' ? l.cost : parseFloat((l.cost || '0').replace(/[^0-9.-]/g, '')) || 0), 0);

  const currAns = current30DaysLogs.filter((l: any) => l.duration > 0 || l.status === "NORMAL_CLEARING" || l.status === "Completed").length;
  const prevAns = prev30DaysLogs.filter((l: any) => l.duration > 0 || l.status === "NORMAL_CLEARING" || l.status === "Completed").length;
  const currPickup = current30DaysLogs.length > 0 ? (currAns / current30DaysLogs.length) * 100 : 0;
  const prevPickup = prev30DaysLogs.length > 0 ? (prevAns / prev30DaysLogs.length) * 100 : 0;
  const pickupChange = prevPickup === 0 ? (currPickup > 0 ? "+100.0%" : null) : ((currPickup - prevPickup > 0 ? "+" : "") + (currPickup - prevPickup).toFixed(1) + "%");

  const currSip = current30DaysLogs.filter((l: any) => l.sip_call_id).length || current30DaysLogs.length;
  const prevSip = prev30DaysLogs.filter((l: any) => l.sip_call_id).length || prev30DaysLogs.length;

  const currApi = current30DaysLogs.length - currSip;
  const prevApi = prev30DaysLogs.length - prevSip;

  const currActive = new Set(current30DaysLogs.filter((l: any) => l.direction === "inbound" && l.phone_number).map((l: any) => l.phone_number)).size || 1;
  const prevActive = new Set(prev30DaysLogs.filter((l: any) => l.direction === "inbound" && l.phone_number).map((l: any) => l.phone_number)).size || 1;

  const changes = {
    totalCalls: getChange(current30DaysLogs.length, prev30DaysLogs.length),
    totalCost: getChange(currCost, prevCost),
    pickupRate: pickupChange,
    sipTrunkCalls: getChange(currSip, prevSip),
    voiceApiCalls: getChange(currApi, prevApi),
    activeNumbers: getChange(currActive, prevActive),
  };

  return {
    totalCalls,
    totalLeads,
    positiveCalls,
    avgDuration,
    totalCost: totalCostVal,
    pickupRate,
    sipTrunkCalls,
    voiceApiCalls,
    activeNumbers,
    changes,
    usageChartData,
    costChartData,
    inboundOutboundData,
    hourlyUsageData,
    hourlyCostData,
    hourlyInboundOutboundData
  };
}

export async function getCallDetails(id: string) {
  const logs = await getCallLogs();
  const log = logs.find((l: any) => l.id === id);
  
  if (log && log.transcript && log.transcript.length > 50 && (!log.sentiment || log.sentiment === "Neutral" || log.summary?.includes("missing"))) {
    // Attempt to run Groq Analysis dynamically and cache it
    console.log("Triggering on-demand Groq Analysis for log:", id);
    const analysis = await analyzeTranscript(log.transcript);
    
    if (analysis) {
      log.sentiment = analysis.sentiment;
      log.summary = analysis.short_summary;
      log.caller_intent = analysis.lead_info?.intent;
      
      const ANALYSIS_CACHE_FILE = path.join(DATA_DIR, "analysis_cache.json");
      let cache: Record<string, any> = {};
      if (fs.existsSync(ANALYSIS_CACHE_FILE)) {
        cache = JSON.parse(fs.readFileSync(ANALYSIS_CACHE_FILE, "utf-8"));
      }
      cache[id] = analysis;
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(ANALYSIS_CACHE_FILE, JSON.stringify(cache, null, 2));

      // If it's an inbound call and has lead info, add to CRM
      if (log.direction === "inbound" && analysis.lead_info?.name) {
        const LEADS_FILE = path.join(DATA_DIR, "leads.csv");
        const newLeadLine = `"${log.timestamp}","${analysis.lead_info.name}","${log.phone_number}","${analysis.lead_info.city || 'Unknown'}"\n`;
        if (fs.existsSync(LEADS_FILE)) {
          // Check if already exists to prevent duplicate
          const content = fs.readFileSync(LEADS_FILE, "utf-8");
          if (!content.includes(log.phone_number)) {
            fs.appendFileSync(LEADS_FILE, newLeadLine);
          }
        } else {
          fs.writeFileSync(LEADS_FILE, `Timestamp,Name,Phone,City\n${newLeadLine}`);
        }
      }
    }
  }
  
  return log || null;
}

// ── Wallet / Billing Data ──────────────────────────────────────────────────

export type TransactionType = 'CDR' | 'DID Purchase' | 'Recording' | 'Transcription' | 'NCC' | 'Other';

export interface WalletTransaction {
  id: string;
  description: string;
  amount: number;        // negative = debit
  type: TransactionType;
  timestamp: string;
}

export interface WalletData {
  balance: number;
  currency: string;
  transactions: WalletTransaction[];
  dailySpending: { date: string; CDR: number; 'DID Purchase': number; Recording: number; Transcription: number; NCC: number }[];
  categoryTotals: Record<TransactionType, number>;
  usageSummary: { activeDids: number; callMinutes: number; avgDuration: number; successRate: number };
}

function classifyTransaction(description: string): TransactionType {
  const d = (description || '').toLowerCase();
  if (d.includes('transcription')) return 'Transcription';
  if (d.includes('recording')) return 'Recording';
  if (d.includes('did') || d.includes('number purchase') || d.includes('number rental')) return 'DID Purchase';
  if (d.includes('ncc') || d.includes('non-connected') || d.includes('non connected')) return 'NCC';
  if (d.includes('call') || d.includes('cdr') || d.includes('minute')) return 'CDR';
  return 'Other';
}

export async function getWalletData(): Promise<WalletData> {
  // Load credentials
  const envPath = path.join(process.cwd(), '..', '.env');
  let authId = process.env.VOBIZ_AUTH_ID;
  let authToken = process.env.VOBIZ_AUTH_TOKEN;

  if (fs.existsSync(envPath) && (!authId || !authToken)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...values] = line.split('=');
      if (key === 'VOBIZ_AUTH_ID') authId = values.join('=').trim().replace(/\r/g, '');
      if (key === 'VOBIZ_AUTH_TOKEN') authToken = values.join('=').trim().replace(/\r/g, '');
    });
  }

  const emptyResult: WalletData = {
    balance: 0,
    currency: 'INR',
    transactions: [],
    dailySpending: [],
    categoryTotals: { CDR: 0, 'DID Purchase': 0, Recording: 0, Transcription: 0, NCC: 0, Other: 0 },
    usageSummary: { activeDids: 0, callMinutes: 0, avgDuration: 0, successRate: 0 }
  };

  if (!authId || !authToken || authId === 'your_auth_id_here') return emptyResult;

  const headers = {
    'X-Auth-ID': authId,
    'X-Auth-Token': authToken,
    'Accept': 'application/json'
  };

  try {
    // ── 1. Fetch account balance + first billing page + CDRs in parallel
    const accountResPromise = fetch(`https://api.vobiz.ai/api/v1/Account/${authId}/`, { headers, cache: 'no-store' }).catch(() => null);
    
    // We run the pagination helpers concurrently for faster loading
    const [accountRes, allBillingItems, cdrs] = await Promise.all([
      accountResPromise,
      fetchAllVobizBilling(authId, headers),
      fetchAllVobizCdrs(authId, headers)
    ]);

    // ── 2. Balance
    let balance = 0;
    let currency = 'INR';
    if (accountRes && accountRes.ok) {
      const acct = await accountRes.json();
      balance = parseFloat(acct?.cash_credits ?? acct?.credit ?? acct?.balance ?? 0);
      currency = acct?.currency ?? 'INR';
    }

    // ── 3. Parse billing ledger into typed transactions
    let transactions: WalletTransaction[] = allBillingItems.map((item: any, idx: number) => ({
      id: item.id ?? item.uuid ?? String(idx),
      description: item.description ?? item.description_text ?? item.memo ?? 'Charge',
      amount: -(Math.abs(parseFloat(item.amount ?? item.cost ?? item.debit ?? '0'))),
      type: classifyTransaction(item.description ?? item.description_text ?? item.memo ?? ''),
      timestamp: item.created_at ?? item.date ?? item.timestamp ?? new Date().toISOString(),
    }));

    // ── 6. If billing ledger returned nothing, build transactions from CDRs only
    //       (CDRs always only contribute to CDR type)
    if (transactions.length === 0 && cdrs.length > 0) {
      cdrs.forEach((cdr: any) => {
        const cost = parseFloat(cdr.total_cost ?? '0');
        if (cost > 0) {
          transactions.push({
            id: cdr.uuid ?? cdr.sip_call_id ?? String(Math.random()),
            description: `${cdr.call_direction === 'inbound' ? 'Inbound' : 'Outbound'} call: ${cdr.destination_number ?? cdr.caller_id_number}` +
              (cdr.duration ? ` (${cdr.duration}s)` : ''),
            amount: -cost,
            type: 'CDR',
            timestamp: cdr.start_time ?? new Date().toISOString(),
          });
        }
      });
    } else if (transactions.length > 0 && cdrs.length > 0) {
      // ── 7. If billing ledger DID return data, also supplement with CDRs that
      //        may not appear in the billing ledger yet (recent calls)
      const billingIds = new Set(transactions.map(t => t.id));
      cdrs.forEach((cdr: any) => {
        const cost = parseFloat(cdr.total_cost ?? '0');
        const cdrId = cdr.uuid ?? cdr.sip_call_id;
        if (cost > 0 && cdrId && !billingIds.has(cdrId)) {
          transactions.push({
            id: cdrId,
            description: `${cdr.call_direction === 'inbound' ? 'Inbound' : 'Outbound'} call: ${cdr.destination_number ?? cdr.caller_id_number}` +
              (cdr.duration ? ` (${cdr.duration}s)` : ''),
            amount: -cost,
            type: 'CDR',
            timestamp: cdr.start_time ?? new Date().toISOString(),
          });
        }
      });
    }

    // Sort newest first
    transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // ── 8. Daily spending breakdown
    const dailyMap: Record<string, Record<TransactionType, number>> = {};
    transactions.forEach(tx => {
      const day = new Date(tx.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (!dailyMap[day]) dailyMap[day] = { CDR: 0, 'DID Purchase': 0, Recording: 0, Transcription: 0, NCC: 0, Other: 0 };
      dailyMap[day][tx.type] += Math.abs(tx.amount);
    });
    const dailySpending = Object.entries(dailyMap)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([date, vals]) => ({ date, ...vals } as any));

    // ── 9. Category totals
    const categoryTotals: Record<TransactionType, number> = { CDR: 0, 'DID Purchase': 0, Recording: 0, Transcription: 0, NCC: 0, Other: 0 };
    transactions.forEach(tx => { categoryTotals[tx.type] += Math.abs(tx.amount); });

    // ── 10. Usage summary from CDRs
    const completedCdrs = cdrs.filter((c: any) => c.duration > 0);
    const totalDuration = completedCdrs.reduce((s: number, c: any) => s + (c.duration || 0), 0);
    const usageSummary = {
      activeDids: 1,
      callMinutes: Math.round(totalDuration / 60),
      avgDuration: completedCdrs.length > 0 ? Math.round(totalDuration / completedCdrs.length) : 0,
      successRate: cdrs.length > 0
        ? Math.round((completedCdrs.length / cdrs.length) * 100)
        : 0,
    };

    return { balance, currency, transactions, dailySpending, categoryTotals, usageSummary };
  } catch (err) {
    console.error('getWalletData error:', err);
    return emptyResult;
  }
}

// ── Vobiz Pagination Helpers ───────────────────────────────────────────────

async function fetchAllVobizCdrs(authId: string, headers: any): Promise<any[]> {
  const allCdrs: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < 20) {
    try {
      const res = await fetch(`https://api.vobiz.ai/api/v1/Account/${authId}/cdr/recent?limit=100&offset=${offset}`, { headers, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json?.data && json.data.length > 0) {
          allCdrs.push(...json.data);
          offset += json.data.length;
          pageCount++;
          if (json.data.length < 100) hasMore = false;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error("Error fetching Vobiz CDRs page:", e);
      hasMore = false;
    }
  }

  // Deduplicate CDRs by sip_call_id (keep the one with longest duration)
  const cdrMap = new Map<string, any>();
  for (const cdr of allCdrs) {
    const key = cdr.sip_call_id || cdr.uuid;
    if (!key) continue;
    const existing = cdrMap.get(key);
    if (!existing || (cdr.duration || 0) > (existing.duration || 0)) {
      cdrMap.set(key, cdr);
    }
  }
  return Array.from(cdrMap.values());
}

async function fetchAllVobizTranscripts(authId: string, headers: any): Promise<any[]> {
  const allTranscripts: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  
  while (hasMore && pageCount < 20) {
    try {
      const res = await fetch(`https://api.vobiz.ai/api/v1/Account/${authId}/Transcriptions/?limit=100&offset=${offset}`, { headers, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const items = json?.objects ?? json?.data ?? json?.results ?? [];
        if (items.length > 0) {
          allTranscripts.push(...items);
          offset += items.length;
          pageCount++;
          if (items.length < 100) hasMore = false;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error("Error fetching Vobiz Transcripts page:", e);
      hasMore = false;
    }
  }
  return allTranscripts;
}

async function fetchAllVobizRecordings(authId: string, headers: any): Promise<any[]> {
  const allRecordings: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  
  while (hasMore && pageCount < 20) {
    try {
      const res = await fetch(`https://api.vobiz.ai/api/v1/Account/${authId}/Recording/?limit=100&offset=${offset}`, { headers, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const items = json?.objects ?? json?.data ?? json?.results ?? [];
        if (items.length > 0) {
          allRecordings.push(...items);
          offset += items.length;
          pageCount++;
          if (items.length < 100) hasMore = false;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error("Error fetching Vobiz Recordings page:", e);
      hasMore = false;
    }
  }
  return allRecordings;
}

async function fetchAllVobizBilling(authId: string, headers: any): Promise<any[]> {
  const allBilling: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  
  while (hasMore && pageCount < 20) {
    try {
      const res = await fetch(`https://api.vobiz.ai/api/v1/Account/${authId}/Billing/?limit=100&offset=${offset}`, { headers, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const items = json?.objects ?? json?.data ?? json?.results ?? [];
        if (items.length > 0) {
          allBilling.push(...items);
          offset += items.length;
          pageCount++;
          if (items.length < 100) hasMore = false;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } catch (e) {
      console.error("Error fetching Vobiz Billing page:", e);
      hasMore = false;
    }
  }
  return allBilling;
}

function parseVobizSentiment(sentiment: any): string {
  if (typeof sentiment !== "string") return "Neutral";
  const s = sentiment.trim();
  if (s.toLowerCase() === "positive" || s.toLowerCase() === "negative" || s.toLowerCase() === "neutral") {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  // Try to parse "CUSTOMER:2.9, AGENT:3.0"
  const customerMatch = s.match(/CUSTOMER:\s*([0-9.]+)/i);
  const agentMatch = s.match(/AGENT:\s*([0-9.]+)/i);
  if (customerMatch) {
    const custScore = parseFloat(customerMatch[1]);
    const agentScore = agentMatch ? parseFloat(agentMatch[1]) : custScore;
    const avgScore = (custScore + agentScore) / 2;
    if (avgScore >= 3.5) return "Positive";
    if (avgScore <= 2.5) return "Negative";
    return "Neutral";
  }
  return "Neutral";
}

// ── Lead CRUD Actions ──────────────────────────────────────────────────────

export async function updateLeadMeta(
  phone: string,
  data: Partial<LeadMeta>
): Promise<boolean> {
  try {
    const meta = readLeadsMeta();
    meta[phone] = {
      ...meta[phone],
      ...data,
      lastActivity: new Date().toISOString(),
    };
    writeLeadsMeta(meta);
    revalidatePath("/leads");
    revalidatePath("/");

    // ── Supabase sync (fire-and-forget) ──
    const updates: Record<string, unknown> = {};
    if (data.status   !== undefined) updates.status    = data.status;
    if (data.priority !== undefined) updates.priority  = data.priority;
    if (data.source   !== undefined) updates.source    = data.source;
    if (data.tags     !== undefined) updates.tags      = data.tags;
    if (data.notes    !== undefined) updates.notes     = data.notes;
    if (data.assignedTo !== undefined) updates.assignedTo = data.assignedTo;
    if (Object.keys(updates).length > 0) {
      updateLeadInSupabase(phone, updates as any).catch((e) =>
        console.warn("[CRM] Supabase updateLead sync failed (non-fatal):", e?.message)
      );
    }

    return true;
  } catch (error) {
    console.error("Error updating lead meta:", error);
    return false;
  }
}

export async function addLeadNote(
  phone: string,
  noteText: string
): Promise<boolean> {
  try {
    const meta = readLeadsMeta();
    if (!meta[phone]) meta[phone] = {};
    if (!meta[phone].notes) meta[phone].notes = [];
    meta[phone].notes!.push({
      text: noteText,
      timestamp: new Date().toISOString(),
    });
    meta[phone].lastActivity = new Date().toISOString();
    writeLeadsMeta(meta);
    revalidatePath("/leads");
    revalidatePath("/");

    // ── Supabase sync (fire-and-forget) ──
    updateLeadInSupabase(phone, { notes: meta[phone].notes } as any).catch((e) =>
      console.warn("[CRM] Supabase addNote sync failed (non-fatal):", e?.message)
    );

    return true;
  } catch (error) {
    console.error("Error adding lead note:", error);
    return false;
  }
}

export async function addNewLead(data: {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  source?: LeadSource;
  tags?: string[];
  note?: string;
}): Promise<boolean> {
  try {
    // Write to CSV
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(LEADS_FILE)) {
      fs.writeFileSync(LEADS_FILE, "Timestamp,Name,Phone,City\n");
    }

    // Check for duplicate phone
    const existing = fs.readFileSync(LEADS_FILE, "utf-8");
    if (existing.includes(data.phone)) {
      return false; // Duplicate
    }

    const timestamp = new Date().toISOString();
    fs.appendFileSync(
      LEADS_FILE,
      `"${timestamp}","${data.name}","${data.phone}","${data.city || ""}"\n`
    );

    // Write enriched meta
    const meta = readLeadsMeta();
    meta[data.phone] = {
      email: data.email || "",
      status: data.status || "New",
      priority: data.priority || "Medium",
      source: data.source || "Manual",
      tags: data.tags || [],
      notes: data.note
        ? [{ text: data.note, timestamp }]
        : [],
      assignedTo: "",
      lastActivity: timestamp,
    };
    writeLeadsMeta(meta);
    revalidatePath("/leads");
    revalidatePath("/");

    // ── Supabase sync (fire-and-forget) ──
    addLeadToSupabase({
      name:     data.name,
      phone:    data.phone,
      email:    data.email,
      city:     data.city,
      status:   data.status,
      priority: data.priority,
      source:   data.source,
    }).catch((e) =>
      console.warn("[CRM] Supabase addLead sync failed (non-fatal):", e?.message)
    );

    return true;
  } catch (error) {
    console.error("Error adding lead:", error);
    return false;
  }
}

export async function deleteLead(phone: string): Promise<boolean> {
  try {
    // Remove from CSV
    if (fs.existsSync(LEADS_FILE)) {
      const data = fs.readFileSync(LEADS_FILE, "utf-8");
      const lines = data.split("\n");
      const filtered = lines.filter(
        (line) => !line.includes(phone)
      );
      fs.writeFileSync(LEADS_FILE, filtered.join("\n"));
    }

    // Remove from meta
    const meta = readLeadsMeta();
    delete meta[phone];
    writeLeadsMeta(meta);
    revalidatePath("/leads");
    revalidatePath("/");

    // ── Supabase sync (fire-and-forget) ──
    deleteLeadFromSupabase(phone).catch((e) =>
      console.warn("[CRM] Supabase deleteLead sync failed (non-fatal):", e?.message)
    );

    return true;
  } catch (error) {
    console.error("Error deleting lead:", error);
    return false;
  }
}

export async function bulkUpdateLeads(
  phones: string[],
  data: { status?: LeadStatus; tags?: string[]; priority?: LeadPriority }
): Promise<boolean> {
  try {
    const meta = readLeadsMeta();
    phones.forEach((phone) => {
      if (!meta[phone]) meta[phone] = {};
      if (data.status) meta[phone].status = data.status;
      if (data.priority) meta[phone].priority = data.priority;
      if (data.tags) {
        const existing = meta[phone].tags || [];
        meta[phone].tags = [...new Set([...existing, ...data.tags])];
      }
      meta[phone].lastActivity = new Date().toISOString();
    });
    writeLeadsMeta(meta);
    revalidatePath("/leads");
    revalidatePath("/");

    // ── Supabase sync (fire-and-forget) ──
    if (data.status) {
      bulkUpdateLeadsInSupabase(phones, data.status).catch((e) =>
        console.warn("[CRM] Supabase bulkUpdate sync failed (non-fatal):", e?.message)
      );
    }

    return true;
  } catch (error) {
    console.error("Error bulk updating leads:", error);
    return false;
  }
}

export async function bulkDeleteLeads(phones: string[]): Promise<boolean> {
  try {
    // Remove from CSV
    if (fs.existsSync(LEADS_FILE)) {
      const data = fs.readFileSync(LEADS_FILE, "utf-8");
      const lines = data.split("\n");
      const filtered = lines.filter(
        (line) => !phones.some((p) => line.includes(p))
      );
      fs.writeFileSync(LEADS_FILE, filtered.join("\n"));
    }

    // Remove from meta
    const meta = readLeadsMeta();
    phones.forEach((phone) => delete meta[phone]);
    writeLeadsMeta(meta);
    revalidatePath("/leads");
    revalidatePath("/");

    // ── Supabase sync (fire-and-forget) ──
    bulkDeleteLeadsFromSupabase(phones).catch((e) =>
      console.warn("[CRM] Supabase bulkDelete sync failed (non-fatal):", e?.message)
    );

    return true;
  } catch (error) {
    console.error("Error bulk deleting leads:", error);
    return false;
  }
}

export async function exportLeadsCsv(): Promise<string> {
  const leads = await getLeads();
  const headers = "Name,Phone,Email,City,Status,Priority,Source,Tags,Captured Date,Last Activity,Sentiment,Intent";
  const rows = leads.map((l) =>
    [
      l.name,
      l.phone,
      l.email,
      l.city,
      l.status,
      l.priority,
      l.source,
      l.tags.join(";"),
      l.timestamp,
      l.lastActivity,
      l.sentiment,
      l.callerIntent,
    ]
      .map((v) => `"${(v || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [headers, ...rows].join("\n");
}
