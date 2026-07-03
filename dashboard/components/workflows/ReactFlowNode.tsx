"use client";

import React, { useState, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import {
  UserPlus,
  PhoneOff,
  Clock,
  Webhook,
  RefreshCw,
  FileText,
  Tag,
  Heart,
  GitBranch,
  Filter,
  Search,
  Hash,
  Smile,
  Mail,
  MessageCircle,
  UserCheck,
  XCircle,
  PhoneOutgoing,
  Globe,
  StickyNote,
  Bell,
  Calendar,
  Timer,
  Sheet,
  X,
  AlertTriangle,
  AlertCircle,
  Pin,
} from "lucide-react";
import type { WorkflowNode } from "@/lib/workflow-types";
import type { NodeValidationResult } from "@/lib/workflow-validation";
import { getNodeMetadata } from "@/lib/workflow-types";

// ── Icon Map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  UserPlus,
  PhoneOff,
  Clock,
  Webhook,
  RefreshCw,
  FileText,
  Tag,
  Heart,
  GitBranch,
  Filter,
  Search,
  Hash,
  Smile,
  Mail,
  MessageCircle,
  UserCheck,
  TagIcon: Tag,
  XCircle,
  PhoneOutgoing,
  Globe,
  StickyNote,
  Bell,
  Sheet,
  Calendar,
  Timer,
};

// ── Data Prop Interface ───────────────────────────────────────────────────────

export interface ReactFlowNodeData {
  workflowNode: WorkflowNode;
  isSelected: boolean;
  onDelete: (id: string) => void;
  executionState?: "idle" | "running" | "success" | "error";
  validation?: NodeValidationResult;
  [key: string]: unknown;
}

// ── Config Summary ────────────────────────────────────────────────────────────

function getConfigSummary(node: WorkflowNode): string {
  const c = node.config;
  switch (node.type) {
    case "send_gmail":
      return c.to ? `To: ${c.to}` : "Configure email...";
    case "send_whatsapp":
      return c.phoneNumber ? `To: ${c.phoneNumber}` : "Configure message...";
    case "update_lead_status":
      return c.newStatus ? `→ ${c.newStatus}` : "Select status...";
    case "add_tag":
    case "remove_tag":
      return c.tagName ? `Tag: ${c.tagName}` : "Set tag name...";
    case "trigger_outbound_call":
      return c.phoneNumber ? `Call: ${c.phoneNumber}` : "Set phone...";
    case "http_webhook":
      return c.url ? `${c.method || "POST"} ${c.url}` : "Set webhook URL...";
    case "wait_delay":
      return c.duration
        ? `Wait ${c.duration} ${c.unit || "hours"}`
        : "Set delay...";
    case "if_else":
      return c.field
        ? `${c.field} ${c.operator} ${c.value || "?"}`
        : "Set condition...";
    case "check_lead_field":
      return c.field ? `${c.field} ${c.operator}` : "Set field...";
    case "check_sentiment":
      return c.sentiment ? `Sentiment: ${c.sentiment}` : "Select sentiment...";
    case "filter_by_tag":
      return c.tagName
        ? `${c.hasTag ? "Has" : "Missing"}: ${c.tagName}`
        : "Set tag...";
    case "check_call_count":
      return c.value !== undefined
        ? `Calls ${c.operator} ${c.value}`
        : "Set condition...";
    case "call_completed":
      return c.callDirection ? `Direction: ${c.callDirection}` : "Any direction";
    case "scheduled":
      return c.scheduleDescription || c.cronExpression || "Set schedule...";
    case "lead_status_changed":
      return `${c.fromStatus || "any"} → ${c.toStatus || "any"}`;
    case "sentiment_detected":
      return c.sentimentType || "Set sentiment...";
    case "send_to_sheets":
      return c.sheetName || "Configure sheet...";
    case "create_calendar_event":
      return c.title || "Set event title...";
    case "add_note":
      return c.noteText
        ? c.noteText.substring(0, 30) + "..."
        : "Set note...";
    case "send_notification":
      return c.channel || "Set notification...";
    default:
      return "Configure...";
  }
}

// ── ReactFlowNode Component ───────────────────────────────────────────────────

export default React.memo(function ReactFlowNode({
  id,
  data,
  selected,
}: NodeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const nodeData = data as unknown as ReactFlowNodeData;
  const node = nodeData.workflowNode;
  const onDelete = nodeData.onDelete;
  const executionState = nodeData.executionState ?? "idle";
  const validation = nodeData.validation;

  const meta = useMemo(() => getNodeMetadata(node.type), [node.type]);
  const color = meta?.color || "#8b949e";
  const iconName = meta?.icon || "FileText";
  const Icon = ICON_MAP[iconName] || FileText;
  const isCondition =
    node.category === "condition" || node.type === "loop_items";
  const isTrigger = node.category === "trigger";
  const isLoop = node.type === "loop_items";

  const configSummary = useMemo(() => getConfigSummary(node), [node]);

  // Validation state
  const hasErrors = (validation?.errors?.length ?? 0) > 0;
  const hasWarnings = (validation?.warnings?.length ?? 0) > 0;
  const allIssues = [
    ...(validation?.errors ?? []),
    ...(validation?.warnings ?? []),
  ];
  const isPinned = !!node.config?._pinnedData;

  // Border classes (mirrors WorkflowNodeCard logic)
  let borderClass =
    "border-gray-200/60 dark:border-white/8 hover:border-gray-300/80 dark:hover:border-white/12";
  let shadowClass =
    "shadow-lg shadow-black/5 dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)]";
  let pulseClass = "";

  // Validation-based border overrides (only when idle)
  if (executionState === "idle") {
    if (hasErrors) {
      borderClass = "border-red-400/50 dark:border-red-400/30";
      shadowClass = "shadow-[0_0_12px_rgba(239,68,68,0.12)]";
    } else if (hasWarnings) {
      borderClass = "border-amber-400/50 dark:border-amber-400/30";
      shadowClass = "shadow-[0_0_12px_rgba(245,158,11,0.12)]";
    }
  }

  if (selected) {
    borderClass = "border-indigo-500/60 dark:border-indigo-400/40";
    shadowClass = "shadow-[0_0_20px_rgba(99,102,241,0.25)]";
  }

  if (executionState === "running") {
    borderClass = "border-yellow-500 dark:border-yellow-500/80";
    shadowClass = "shadow-[0_0_15px_rgba(234,179,8,0.5)]";
    pulseClass = "animate-pulse";
  } else if (executionState === "success") {
    borderClass = "border-green-500 dark:border-green-500/80";
    shadowClass = "shadow-[0_0_15px_rgba(34,197,94,0.4)]";
  } else if (executionState === "error") {
    borderClass = "border-red-500 dark:border-red-500/80";
    shadowClass = "shadow-[0_0_15px_rgba(239,68,68,0.45)]";
  }

  return (
    <div
      className={`group relative cursor-pointer select-none transition-shadow duration-200 ${
        selected ? "z-20" : "z-10"
      }`}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="flex flex-col items-center w-full"
      >
        {/* Input Handle (top center) — not for triggers */}
        {!isTrigger && (
          <Handle
            type="target"
            position={Position.Top}
            id="input"
            className="!w-[10px] !h-[10px] !rounded-full !border-2 !border-[#30363d] !bg-[#0d1117] hover:!border-indigo-400 hover:!bg-indigo-500/20 transition-colors !cursor-crosshair"
            style={{ top: -5 }}
          />
        )}

        {/* Main card body */}
        <div
          className={`w-full rounded-2xl border transition-all duration-200 bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-md ${borderClass} ${shadowClass} ${pulseClass}`}
        >
          {/* Color accent bar */}
          <div
            className="h-1 rounded-t-xl"
            style={{ backgroundColor: color }}
          />

          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100/80 dark:border-white/5">
            {/* Icon */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: `${color}15`,
                border: `1px solid ${color}30`,
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>

            {/* Label + Category */}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3] truncate">
                {node.label}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-[#6e7681] capitalize">
                {node.category}
              </div>
            </div>

            {/* Pinned badge */}
            {isPinned && (
              <div
                className="flex items-center justify-center"
                title="Data pinned — will use cached output"
              >
                <Pin className="w-3 h-3 text-purple-400" />
              </div>
            )}

            {/* Validation badge + tooltip */}
            {executionState === "idle" && (hasErrors || hasWarnings) && (
              <div
                className="relative flex items-center justify-center mr-1 cursor-help"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTooltip((prev) => !prev);
                }}
                title={
                  hasErrors
                    ? "Errors:\n" + validation?.errors?.join("\n")
                    : "Warnings:\n" + validation?.warnings?.join("\n")
                }
              >
                {hasErrors ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}

                {/* Tooltip */}
                {showTooltip && allIssues.length > 0 && (
                  <div className="absolute right-0 bottom-full mb-2 w-64 bg-white/95 dark:bg-[#161b22]/95 backdrop-blur-xl border border-gray-200/50 dark:border-white/8 rounded-xl shadow-2xl p-3 z-[100] pointer-events-none">
                    <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider mb-2">
                      {hasErrors
                        ? "⚠ Configuration Issues"
                        : "⚠ Warnings"}
                    </p>
                    <ul className="space-y-1">
                      {allIssues.map((issue, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-1.5 text-[11px] text-gray-400"
                        >
                          <span
                            className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              i < (validation?.errors?.length ?? 0)
                                ? "bg-red-400"
                                : "bg-amber-400"
                            }`}
                          />
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Execution badge */}
            {executionState !== "idle" && (
              <div className="flex items-center justify-center mr-1">
                {executionState === "running" && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                  </span>
                )}
                {executionState === "success" && (
                  <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-green-500 dark:bg-green-500/25 text-white dark:text-green-400 text-[10px] font-bold shadow-sm shadow-green-500/20 border border-green-500/30">
                    ✓
                  </span>
                )}
                {executionState === "error" && (
                  <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full bg-red-500 dark:bg-red-500/25 text-white dark:text-red-400 text-[10px] font-bold shadow-sm shadow-red-500/20 border border-red-500/30">
                    !
                  </span>
                )}
              </div>
            )}

            {/* Delete button (visible on hover via group-hover) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(id);
              }}
              className="p-1 rounded-md text-gray-400 dark:text-[#6e7681] hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Config summary */}
          <div className="px-3 py-2">
            <p className="text-[11px] text-gray-500 dark:text-[#8b949e] truncate font-mono">
              {configSummary}
            </p>
          </div>
        </div>

        {/* Output Handles (bottom) */}
        {isLoop ? (
          <div className="flex flex-row items-center justify-center -mt-[5px] relative z-30 gap-16">
            {/* LOOP port */}
            <div className="flex flex-col items-center gap-1">
              <Handle
                type="source"
                position={Position.Bottom}
                id="loop"
                className="!w-[14px] !h-[14px] !rounded-full !border-2 !bg-[#0d1117] hover:!bg-purple-500/20 transition-colors !cursor-crosshair"
                style={{ borderColor: "#a855f7", bottom: -7 }}
              />
              <span className="text-[10px] text-purple-400 font-bold leading-none tracking-wide">
                LOOP
              </span>
            </div>
            {/* DONE port */}
            <div className="flex flex-col items-center gap-1">
              <Handle
                type="source"
                position={Position.Bottom}
                id="done"
                className="!w-[14px] !h-[14px] !rounded-full !border-2 !bg-[#0d1117] hover:!bg-gray-500/20 transition-colors !cursor-crosshair"
                style={{ borderColor: "#9ca3af", bottom: -7 }}
              />
              <span className="text-[10px] text-gray-400 font-bold leading-none tracking-wide">
                DONE
              </span>
            </div>
          </div>
        ) : isCondition ? (
          <div className="flex flex-row items-center justify-center -mt-[5px] relative z-30 gap-16">
            {/* YES port */}
            <div className="flex flex-col items-center gap-1">
              <Handle
                type="source"
                position={Position.Bottom}
                id="yes"
                className="!w-[14px] !h-[14px] !rounded-full !border-2 !bg-[#0d1117] hover:!bg-green-500/20 transition-colors !cursor-crosshair"
                style={{ borderColor: "#3fb950", bottom: -7 }}
              />
              <span className="text-[10px] text-green-400 font-bold leading-none tracking-wide">
                YES
              </span>
            </div>
            {/* NO port */}
            <div className="flex flex-col items-center gap-1">
              <Handle
                type="source"
                position={Position.Bottom}
                id="no"
                className="!w-[14px] !h-[14px] !rounded-full !border-2 !bg-[#0d1117] hover:!bg-red-500/20 transition-colors !cursor-crosshair"
                style={{ borderColor: "#f85149", bottom: -7 }}
              />
              <span className="text-[10px] text-red-400 font-bold leading-none tracking-wide">
                NO
              </span>
            </div>
          </div>
        ) : (
          <Handle
            type="source"
            position={Position.Bottom}
            id="default"
            className="!w-[10px] !h-[10px] !rounded-full !border-2 !border-[#30363d] !bg-[#0d1117] hover:!border-indigo-400 hover:!bg-indigo-500/20 transition-colors !cursor-crosshair"
            style={{ bottom: -5 }}
          />
        )}
      </motion.div>
    </div>
  );
});
