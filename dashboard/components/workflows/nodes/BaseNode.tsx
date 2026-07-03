"use client";

import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  UserPlus, PhoneOff, Clock, Webhook, RefreshCw, FileText, Tag, Heart,
  GitBranch, Filter, Search, Hash, Smile,
  Mail, MessageCircle, UserCheck, XCircle, PhoneOutgoing, Globe, StickyNote,
  Bell, Calendar, Timer, Code2, Shuffle, Repeat,
  Smartphone, MessageSquare, Send, Building2, Cloud, Table2, FileCode2,
  AlertTriangle, Pin, AlertCircle,
} from "lucide-react";

// ── Icon Mapping ────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  UserPlus, PhoneOff, Clock, Webhook, RefreshCw, FileText, Tag, Heart,
  GitBranch, Filter, Search, Hash, Smile,
  Mail, MessageCircle, UserCheck, XCircle, PhoneOutgoing, Globe,
  StickyNote, Bell, Calendar, Timer, Code2, Shuffle, Repeat,
  Smartphone, MessageSquare, Send, Building2, Cloud, Table2, FileCode2,
  AlertTriangle,
};

const CombineIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2H2v6" /><path d="M16 2h6v6" /><path d="M8 22H2v-6" /><path d="M16 22h6v-6" />
    <path d="M2 12h4" /><path d="M18 12h4" /><path d="M12 2v4" /><path d="M12 18v4" />
  </svg>
);

const WorkflowIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/>
    <rect x="9" y="16" width="6" height="6" rx="1"/><path d="M5 8v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/>
    <path d="M12 14v2"/>
  </svg>
);

const InstagramIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/>
    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
  </svg>
);

const EXTENDED_ICON_MAP: Record<string, React.ElementType> = {
  ...ICON_MAP,
  Combine: CombineIcon,
  Workflow: WorkflowIcon,
  Instagram: InstagramIcon,
  Sheet: FileText,
  TagIcon: Tag,
  Play: FileText,
};

export function getIcon(iconName: string): React.ElementType {
  return EXTENDED_ICON_MAP[iconName] || FileText;
}

// ── Config Summary ──────────────────────────────────────────────────────────
export function getConfigSummary(nodeType: string, config: Record<string, any>): string {
  const c = config;
  switch (nodeType) {
    case "send_gmail": return c.to ? `To: ${c.to}` : "Configure email...";
    case "send_whatsapp": return c.phoneNumber ? `To: ${c.phoneNumber}` : "Configure message...";
    case "update_lead_status": return c.newStatus ? `→ ${c.newStatus}` : "Select status...";
    case "add_tag": case "remove_tag": return c.tagName ? `Tag: ${c.tagName}` : "Set tag name...";
    case "trigger_outbound_call": return c.phoneNumber ? `Call: ${c.phoneNumber}` : "Set phone...";
    case "http_webhook": return c.url ? `${c.method || "POST"} ${c.url}` : "Set webhook URL...";
    case "wait_delay": return c.duration ? `Wait ${c.duration} ${c.unit || "hours"}` : "Set delay...";
    case "if_else": return c.field ? `${c.field} ${c.operator} ${c.value || "?"}` : "Set condition...";
    case "check_lead_field": return c.field ? `${c.field} ${c.operator}` : "Set field...";
    case "check_sentiment": return c.sentiment ? `Sentiment: ${c.sentiment}` : "Select sentiment...";
    case "filter_by_tag": return c.tagName ? `${c.hasTag ? "Has" : "Missing"}: ${c.tagName}` : "Set tag...";
    case "check_call_count": return c.value !== undefined ? `Calls ${c.operator} ${c.value}` : "Set condition...";
    case "call_completed": return c.callDirection ? `Direction: ${c.callDirection}` : "Any direction";
    case "scheduled": return c.scheduleDescription || c.cronExpression || "Set schedule...";
    case "lead_status_changed": return `${c.fromStatus || "any"} → ${c.toStatus || "any"}`;
    case "sentiment_detected": return c.sentimentType || "Set sentiment...";
    case "send_to_sheets": return c.sheetName || "Configure sheet...";
    case "create_calendar_event": return c.title || "Set event title...";
    case "add_note": return c.noteText ? c.noteText.substring(0, 30) + "..." : "Set note...";
    case "send_notification": return c.channel || "Set notification...";
    case "sticky_note": return c.content ? c.content.substring(0, 40) + "..." : "Note...";
    case "code_node": return "Custom code";
    case "sub_workflow": return c.workflowId ? `Workflow: ${c.workflowId}` : "Select workflow...";
    case "send_slack": return c.channel ? `${c.channel}` : "Set channel...";
    case "send_telegram": return c.chatId ? `Chat: ${c.chatId}` : "Set chat...";
    case "send_instagram_dm": return c.recipientId ? `To: ${c.recipientId}` : "Set recipient...";
    case "send_sms": return c.to ? `To: ${c.to}` : "Set phone...";
    case "hubspot_create_contact": return c.operation || "Create contact...";
    case "salesforce_update": return c.operation || "Update record...";
    case "airtable_row": return c.baseId ? `${c.operation} row` : "Configure...";
    case "notion_page": return c.databaseId ? `${c.operation} page` : "Configure...";
    case "read_csv_leads": return c.filePath || "Set file path...";
    case "switch_router": return `${(c.rules || []).length} rules`;
    case "merge_items": return c.mode || "Append";
    case "loop_items": return c.mode || "Items";
    default: return "Configure...";
  }
}

// ── BaseNode Component ──────────────────────────────────────────────────────

export interface BaseNodeData {
  nodeType: string;
  category: string;
  label: string;
  config: Record<string, any>;
  color: string;
  icon: string;
  executionState?: "idle" | "running" | "success" | "error";
  validation?: { errors: string[]; warnings: string[] };
  disabled?: boolean;
  isPinned?: boolean;
  isTrigger?: boolean;
  isCondition?: boolean;
  isLoop?: boolean;
  isStickyNote?: boolean;
  [key: string]: any;
}

export default function BaseNode({ data, selected }: NodeProps & { data: BaseNodeData }) {
  const {
    nodeType, category, label, config, color, icon,
    executionState = "idle", validation, disabled, isPinned,
    isTrigger, isCondition, isLoop, isStickyNote,
  } = data;

  const Icon = getIcon(icon);
  const configSummary = getConfigSummary(nodeType, config);
  const hasErrors = (validation?.errors?.length ?? 0) > 0;
  const hasWarnings = (validation?.warnings?.length ?? 0) > 0;

  // Sticky note special rendering
  if (isStickyNote) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border-2 shadow-lg min-w-[180px] max-w-[240px]"
        style={{
          backgroundColor: `${color}15`,
          borderColor: `${color}50`,
        }}
      >
        <div className="px-3 py-2">
          <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {config.content || "Note..."}
          </p>
        </div>
      </motion.div>
    );
  }

  // Determine border styles
  let borderColor = "rgba(48, 54, 61, 0.3)";
  let boxShadow = "0 2px 8px rgba(0,0,0,0.15)";

  if (selected) {
    borderColor = "#818cf8";
    boxShadow = "0 0 0 2px rgba(129,140,248,0.3), 0 4px 12px rgba(0,0,0,0.2)";
  } else if (executionState === "running") {
    borderColor = "#eab308";
    boxShadow = "0 0 0 2px rgba(234,179,8,0.3), 0 4px 12px rgba(234,179,8,0.15)";
  } else if (executionState === "success") {
    borderColor = "#22c55e";
    boxShadow = "0 0 0 2px rgba(34,197,94,0.3), 0 4px 12px rgba(34,197,94,0.15)";
  } else if (executionState === "error") {
    borderColor = "#ef4444";
    boxShadow = "0 0 0 2px rgba(239,68,68,0.3), 0 4px 12px rgba(239,68,68,0.15)";
  } else if (hasErrors) {
    borderColor = "rgba(239,68,68,0.4)";
  } else if (hasWarnings) {
    borderColor = "rgba(245,158,11,0.4)";
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`rounded-xl border bg-white/95 dark:bg-[#161b22]/95 backdrop-blur-md min-w-[200px] max-w-[240px] transition-all duration-200 ${disabled ? "opacity-50" : ""}`}
      style={{ borderColor, boxShadow }}
    >
      {/* Input handle (top) - not for triggers or sticky notes */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-[10px] !h-[10px] !rounded-full !border-2 !border-[#30363d] !bg-[#0d1117] hover:!border-indigo-400 hover:!bg-indigo-500/20 !-top-[5px]"
        />
      )}

      {/* Color accent bar */}
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100/80 dark:border-white/5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `${color}18`,
            border: `1px solid ${color}35`,
          }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3] truncate">
            {label}
          </div>
          <div className="text-[10px] text-gray-400 dark:text-[#6e7681] capitalize">
            {category}
          </div>
        </div>

        {/* Status indicators */}
        {isPinned && (
          <div title="Data pinned">
            <Pin className="w-3 h-3 text-purple-400" />
          </div>
        )}
        {executionState === "running" && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
          </span>
        )}
        {executionState === "success" && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500 text-white text-[10px] font-bold">✓</span>
        )}
        {executionState === "error" && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">!</span>
        )}
        {hasErrors && executionState === "idle" && (
          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
        )}
        {hasWarnings && executionState === "idle" && !hasErrors && (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        )}
      </div>

      {/* Config summary */}
      <div className="px-3 py-2">
        <p className="text-[11px] text-gray-500 dark:text-[#8b949e] truncate font-mono">
          {configSummary}
        </p>
      </div>

      {/* Output handles (bottom) */}
      {isCondition && !isLoop ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            className="!w-[12px] !h-[12px] !rounded-full !bg-[#0d1117] !-bottom-[6px]"
            style={{ borderColor: "#3fb950", left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            className="!w-[12px] !h-[12px] !rounded-full !bg-[#0d1117] !-bottom-[6px]"
            style={{ borderColor: "#f85149", left: "70%" }}
          />
          <div className="flex justify-between px-2 pb-1" style={{ paddingLeft: "15%", paddingRight: "15%" }}>
            <span className="text-[9px] font-bold text-green-400">YES</span>
            <span className="text-[9px] font-bold text-red-400">NO</span>
          </div>
        </>
      ) : isLoop ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="loop"
            className="!w-[12px] !h-[12px] !rounded-full !bg-[#0d1117] !-bottom-[6px]"
            style={{ borderColor: "#a855f7", left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="done"
            className="!w-[12px] !h-[12px] !rounded-full !bg-[#0d1117] !-bottom-[6px]"
            style={{ borderColor: "#9ca3af", left: "70%" }}
          />
          <div className="flex justify-between px-2 pb-1" style={{ paddingLeft: "15%", paddingRight: "15%" }}>
            <span className="text-[9px] font-bold text-purple-400">LOOP</span>
            <span className="text-[9px] font-bold text-gray-400">DONE</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="default"
          className="!w-[10px] !h-[10px] !rounded-full !border-2 !border-[#30363d] !bg-[#0d1117] hover:!border-indigo-400 hover:!bg-indigo-500/20 !-bottom-[5px]"
        />
      )}
    </motion.div>
  );
}
