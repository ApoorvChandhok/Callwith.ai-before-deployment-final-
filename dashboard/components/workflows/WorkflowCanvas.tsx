"use client";

import React, { useCallback, useRef, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
  type EdgeProps,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  getBezierPath,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowNode, WorkflowEdge, NodeMetadata } from "@/lib/workflow-types";
import { getNodeMetadata } from "@/lib/workflow-types";
import type { NodeValidationResult } from "@/lib/workflow-validation";
import {
  UserPlus, PhoneOff, Clock, Webhook, RefreshCw, FileText, Tag, Heart,
  GitBranch, Filter, Search, Hash, Smile,
  Mail, MessageCircle, UserCheck, XCircle, PhoneOutgoing, Globe, StickyNote,
  Bell, Calendar, Timer, Sheet, Play, AlertTriangle, AlertCircle, Code2, Workflow, Smartphone,
  MessageSquare, Send, Instagram, Building2, Cloud, Shuffle, Combine, Repeat,
  Table2, FileCode2, Edit2, Copy, BarChart3, FileUp, Pencil, Circle, Octagon, Reply, Layers,
} from "lucide-react";

// ── Icon Map (same as WorkflowNodeCard) ──────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  UserPlus, PhoneOff, Clock, Webhook, RefreshCw, FileText, Tag, Heart,
  GitBranch, Filter, Hash, Smile, Mail, MessageCircle, UserCheck, XCircle,
  PhoneOutgoing, Globe, StickyNote, Bell, Sheet, Calendar, Timer, Play,
  AlertTriangle, Code2, Workflow, Smartphone, MessageSquare, Send, Instagram,
  Building2, Cloud, Shuffle, Combine, Repeat, Table2, FileCode2, TagIcon: Tag,
  Edit2, Copy, BarChart3, FileUp, Pencil, Circle, Octagon, Reply, Layers,
};

// ── Props (preserved from original) ──────────────────────────────────────────

interface Props {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onMoveNode: (id: string, position: { x: number; y: number }) => void;
  onAddEdge: (sourceId: string, targetId: string, sourcePort?: string) => void;
  onDeleteEdge: (id: string) => void;
  nodeExecutionStatuses?: Record<string, "idle" | "running" | "success" | "error">;
  nodeExecutionTimes?: Record<string, number>;
  nodeValidations?: Record<string, NodeValidationResult>;
  onAddNode?: (metadata: NodeMetadata, position: { x: number; y: number }) => void;
  onInsertBetween?: (edge: { sourceId: string; targetId: string; sourcePort?: string }) => void;
}

// ── Extended data type passed to custom nodes ────────────────────────────────

interface NodeDataBase {
  workflowNode: WorkflowNode;
  isSelected: boolean;
  executionState: "idle" | "running" | "success" | "error";
  validation?: NodeValidationResult;
  executionMs?: number;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}

// ── Tidy Up Auto-Layout Algorithm ────────────────────────────────────────────

function tidyUpNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  // Build adjacency: children map
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  nodes.forEach((n) => {
    children.set(n.id, []);
    parents.set(n.id, []);
  });
  edges.forEach((e) => {
    children.get(e.sourceId)?.push(e.targetId);
    parents.get(e.targetId)?.push(e.sourceId);
  });

  // Find root nodes (no parents — triggers or disconnected)
  const roots = nodes.filter((n) => (parents.get(n.id)?.length ?? 0) === 0);

  // BFS to assign layers
  const layers = new Map<string, number>();
  const queue: { id: string; layer: number }[] = [];
  roots.forEach((r) => {
    queue.push({ id: r.id, layer: 0 });
    layers.set(r.id, 0);
  });

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!;
    const kids = children.get(id) || [];
    kids.forEach((kid) => {
      const existing = layers.get(kid);
      const newLayer = layer + 1;
      if (existing === undefined || newLayer > existing) {
        layers.set(kid, newLayer);
        queue.push({ id: kid, layer: newLayer });
      }
    });
  }

  // Assign unvisited nodes to layer 0
  nodes.forEach((n) => {
    if (!layers.has(n.id)) layers.set(n.id, 0);
  });

  // Group by layer
  const layerGroups = new Map<number, WorkflowNode[]>();
  nodes.forEach((n) => {
    const layer = layers.get(n.id) ?? 0;
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(n);
  });

  // Position: vertical layers, horizontal spread
  const NODE_WIDTH = 260;
  const NODE_HEIGHT = 100;
  const H_GAP = 60;
  const V_GAP = 120;

  const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
  sortedLayers.forEach((layerIdx) => {
    const group = layerGroups.get(layerIdx)!;
    const totalWidth = group.length * NODE_WIDTH + (group.length - 1) * H_GAP;
    const startX = -totalWidth / 2;

    group.forEach((node, i) => {
      positions.set(node.id, {
        x: startX + i * (NODE_WIDTH + H_GAP) + NODE_WIDTH / 2,
        y: layerIdx * (NODE_HEIGHT + V_GAP),
      });
    });
  });

  return positions;
}

// ── Edge color mapping ───────────────────────────────────────────────────────

function getEdgeColor(sourcePort?: string, label?: string): string {
  if (label === "Yes" || sourcePort === "yes") return "#3fb950";
  if (label === "No" || sourcePort === "no") return "#f85149";
  if (label === "Loop" || sourcePort === "loop") return "#a855f7";
  if (label === "Done" || sourcePort === "done") return "#9ca3af";
  return "#4b5563";
}

// ── Custom Node Component ────────────────────────────────────────────────────

function WorkflowReactFlowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as NodeDataBase;
  const { workflowNode, executionState, validation, executionMs, onSelect, onDelete } = nodeData;
  const node = workflowNode;
  const isTrigger = node.category === "trigger";
  const isCondition = node.category === "condition" || node.type === "loop_items";

  return (
    <>
      {/* Input handle (top) — n8n style: 12px, border, hover scale */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          id="input"
          className="n8n-handle target"
          style={{
            width: 12,
            height: 12,
            background: "var(--n8n-bg, #fff)",
            border: "1px solid var(--n8n-border-dark, #c0c0cc)",
            borderRadius: "50%",
            cursor: "crosshair",
            transition: "all 0.15s ease",
          }}
        />
      )}

      {/* The actual card — embedded from WorkflowNodeCard but adapted */}
      <NodeCardInner
        node={node}
        isSelected={selected || false}
        executionState={executionState}
        validation={validation}
        onSelect={onSelect}
        onDelete={onDelete}
      />

      {/* Output handles (bottom) — n8n style: 12px, border, colored */}
      {node.type === "loop_items" || node.type === "split_in_batches" ? (
        <>
          <Handle type="source" position={Position.Bottom} id="loop"
            style={{ width: 12, height: 12, background: "var(--n8n-bg, #fff)", border: "1px solid #a855f7", borderRadius: "50%", cursor: "crosshair", transition: "all 0.15s ease" }} />
          <Handle type="source" position={Position.Bottom} id="done"
            style={{ width: 12, height: 12, background: "var(--n8n-bg, #fff)", border: "1px solid var(--n8n-text-muted, #9b9bb5)", borderRadius: "50%", cursor: "crosshair", marginLeft: 40, transition: "all 0.15s ease" }} />
        </>
      ) : isCondition ? (
        <>
          <Handle type="source" position={Position.Bottom} id="yes"
            style={{ width: 12, height: 12, background: "var(--n8n-bg, #fff)", border: "1px solid var(--n8n-success, #2ebd6b)", borderRadius: "50%", cursor: "crosshair", marginLeft: -20, transition: "all 0.15s ease" }} />
          <Handle type="source" position={Position.Bottom} id="no"
            style={{ width: 12, height: 12, background: "var(--n8n-bg, #fff)", border: "1px solid var(--n8n-danger, #e54d4d)", borderRadius: "50%", cursor: "crosshair", marginLeft: 20, transition: "all 0.15s ease" }} />
        </>
      ) : (
        <>
          <Handle type="source" position={Position.Bottom} id="output"
            style={{ width: 12, height: 12, background: "var(--n8n-bg, #fff)", border: "1px solid var(--n8n-border-dark, #c0c0cc)", borderRadius: "50%", cursor: "crosshair", transition: "all 0.15s ease" }} />
          {(node as any).onError === "continueErrorOutput" && (
            <Handle type="source" position={Position.Bottom} id="error"
              style={{ width: 12, height: 12, background: "var(--n8n-bg, #fff)", border: "1px solid var(--n8n-danger, #e54d4d)", borderRadius: "50%", cursor: "crosshair", marginLeft: 30, transition: "all 0.15s ease" }} />
          )}
        </>
      )}
    </>
  );
}

// ── Inner card (adapted from WorkflowNodeCard) ───────────────────────────────

function NodeCardInner({
  node,
  isSelected,
  executionState,
  validation,
  executionMs,
  onSelect,
  onDelete,
}: {
  node: WorkflowNode;
  isSelected: boolean;
  executionState: "idle" | "running" | "success" | "error";
  validation?: NodeValidationResult;
  executionMs?: number;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const meta = useMemo(() => getNodeMetadata(node.type), [node.type]);
  const color = meta?.color || "#8b949e";
  const iconName = meta?.icon || "FileText";
  const Icon = ICON_MAP[iconName] || FileText;

  const hasErrors = (validation?.errors?.length ?? 0) > 0;
  const hasWarnings = (validation?.warnings?.length ?? 0) > 0;
  const allIssues = [...(validation?.errors ?? []), ...(validation?.warnings ?? [])];
  const isPinned = !!node.config?._pinnedData;

  let borderClass =
    "border-gray-200/60 dark:border-white/8 hover:border-gray-300/80 dark:hover:border-white/12";
  let shadowClass = "shadow-lg shadow-black/5 dark:shadow-[0_4px_12px_rgba(0,0,0,0.3)]";
  let pulseClass = "";

  if (executionState === "idle") {
    if (hasErrors) {
      borderClass = "border-red-400/50 dark:border-red-400/30";
      shadowClass = "shadow-[0_0_12px_rgba(239,68,68,0.12)]";
    } else if (hasWarnings) {
      borderClass = "border-amber-400/50 dark:border-amber-400/30";
      shadowClass = "shadow-[0_0_12px_rgba(245,158,11,0.12)]";
    }
  }

  if (isSelected) {
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

  const configSummary = getConfigSummary(node);

  return (
    <div
      className="w-[240px] transition-all duration-200"
      style={{
        background: 'var(--n8n-node-bg, #fff)',
        border: `1.5px solid ${isSelected ? 'var(--n8n-primary, #ff6d5a)' : 'var(--n8n-node-border, rgba(0,0,0,0.1))'}`,
        borderRadius: '8px',
        boxShadow: isSelected ? '0 0 0 6px rgba(255, 109, 90, 0.08), 0 4px 12px rgba(0,0,0,0.12)' : '0 1px 3px -1px rgba(0,0,0,0.1)',
        cursor: 'pointer',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {/* Color accent bar */}
      <div style={{ height: '3px', borderRadius: '8px 8px 0 0', backgroundColor: color }} />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--n8n-border-light, #f0f0f5)' }}>
        <div
          className="w-7 h-7 flex items-center justify-center flex-shrink-0"
          style={{
            borderRadius: '4px',
            backgroundColor: `${color}15`,
            border: `1px solid ${color}30`,
          }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: 'var(--n8n-text, #1a1a2e)' }}>
            {node.label}
          </div>
          <div className="text-[10px] capitalize" style={{ color: 'var(--n8n-text-muted, #9b9bb5)' }}>
            {node.category}
          </div>
        </div>

        {/* Pinned badge */}
        {isPinned && (
          <div className="flex items-center justify-center" title="Data pinned">
            <svg
              className="w-3 h-3 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </div>
        )}

        {/* Validation badge */}
        {executionState === "idle" && (hasErrors || hasWarnings) && (
          <div className="flex items-center justify-center mr-1" title={allIssues.join("\n")}>
            {hasErrors ? (
              <svg
                className="w-4 h-4 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            )}
          </div>
        )}

        {/* Execution badge */}
        {executionState !== "idle" && (
          <div className="flex items-center justify-center mr-1 gap-1">
            {executionState === "running" && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--n8n-warning, #f5a623)' }}></span>
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--n8n-warning, #f5a623)' }}></span>
              </span>
            )}
            {executionState === "success" && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold" style={{ background: 'var(--n8n-success, #2ebd6b)' }}>
                &#10003;
              </span>
            )}
            {executionState === "error" && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold" style={{ background: 'var(--n8n-danger, #e54d4d)' }}>
                !
              </span>
            )}
            {/* Execution time */}
            {executionMs !== undefined && executionState !== "running" && (
              <span className="text-[9px] font-mono tabular-nums" style={{ color: 'var(--n8n-text-muted, #9b9bb5)' }}>
                {executionMs < 1000 ? `${executionMs}ms` : `${(executionMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--n8n-text-muted, #9b9bb5)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--n8n-danger, #e54d4d)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--n8n-text-muted, #9b9bb5)')}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Config summary */}
      <div className="px-3 py-2">
        <p className="text-[11px] truncate" style={{ color: 'var(--n8n-text-light, #6e6e8a)', fontFamily: 'var(--n8n-font-mono, monospace)' }}>
          {configSummary}
        </p>
      </div>
    </div>
  );
}

// ── Config summary helper ────────────────────────────────────────────────────

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

// ── Custom Edge Component with animated dots and labels ──────────────────────

function WorkflowCustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const edgeData = (data ?? {}) as {
    sourcePort?: string;
    label?: string;
    onDelete?: (id: string) => void;
    onInsertBetween?: (edge: { sourceId: string; targetId: string; sourcePort?: string }) => void;
    sourceId?: string;
    targetId?: string;
  };
  const { sourcePort, label, onDelete, onInsertBetween, sourceId, targetId } = edgeData;

  const strokeColor = getEdgeColor(sourcePort, label);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.4,
  });

  // Midpoint for the insert button
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <>
      {/* Invisible wider path for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(id);
        }}
      />
      {/* Visible edge */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeOpacity={0.6}
        className="transition-colors duration-200"
      />
      {/* Animated dot traveling along the edge */}
      <circle r="3" fill={strokeColor} opacity={0.8}>
        <animateMotion dur="3s" repeatCount="indefinite" path={edgePath} />
      </circle>
      {/* Arrow marker at the end */}
      <polygon
        points={`${targetX},${targetY} ${targetX - 5},${targetY - 8} ${targetX + 5},${targetY - 8}`}
        fill={strokeColor}
        opacity={0.6}
      />
      {/* Insert node "+" button at midpoint */}
      {onInsertBetween && sourceId && targetId && (
        <foreignObject
          x={midX - 10}
          y={midY - 10}
          width={20}
          height={20}
          style={{ overflow: "visible" }}
        >
          <button
            className="w-5 h-5 rounded-full bg-[#161b22] dark:bg-[#0d1117] border border-gray-600 dark:border-[#30363d] text-gray-400 dark:text-[#8b949e] hover:text-white hover:bg-[var(--n8n-primary, #ff6d5a)] hover:border-[var(--n8n-primary, #ff6d5a)] flex items-center justify-center text-[10px] font-bold transition-all opacity-0 hover:opacity-100 group-hover:opacity-100 shadow-md cursor-pointer"
            style={{ opacity: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              onInsertBetween({ sourceId, targetId, sourcePort });
            }}
            title="Insert node between"
          >
            +
          </button>
        </foreignObject>
      )}
      {/* Label pill */}
      {label && (
        <g>
          <rect
            x={labelX - 16}
            y={labelY - 9}
            width={32}
            height={18}
            rx={9}
            fill="#0d1117"
            stroke={strokeColor}
            strokeWidth={1}
            opacity={0.9}
          />
          <text
            x={labelX}
            y={labelY + 4}
            textAnchor="middle"
            className="text-[9px] font-medium"
            style={{ fill: strokeColor }}
          >
            {label}
          </text>
        </g>
      )}
    </>
  );
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

function mapWorkflowNodesToReactFlow(
  nodes: WorkflowNode[],
  selectedNodeId: string | null,
  executionStatuses: Record<string, "idle" | "running" | "success" | "error">,
  validations: Record<string, NodeValidationResult>,
  executionTimes: Record<string, number>,
  onSelect: (id: string | null) => void,
  onDelete: (id: string) => void
): Node[] {
  return nodes.map((wn) => ({
    id: wn.id,
    type: "workflowNode",
    position: wn.position,
    data: {
      workflowNode: wn,
      isSelected: selectedNodeId === wn.id,
      executionState: executionStatuses[wn.id] || "idle",
      validation: validations[wn.id],
      executionMs: executionTimes[wn.id],
      onSelect,
      onDelete,
    } satisfies NodeDataBase,
    // Trigger nodes should not accept connections
    connectable: wn.category !== "trigger",
    dragHandle: undefined, // allow default drag on the node body
  }));
}

function mapWorkflowEdgesToReactFlow(
  edges: WorkflowEdge[],
  onDelete: (id: string) => void,
  onInsertBetween?: (edge: { sourceId: string; targetId: string; sourcePort?: string }) => void
): Edge[] {
  return edges.map((we) => ({
    id: we.id,
    source: we.sourceId,
    target: we.targetId,
    sourceHandle: we.sourcePort && we.sourcePort !== "default" ? we.sourcePort : null,
    targetHandle: "input",
    type: "workflowEdge",
    data: {
      sourcePort: we.sourcePort,
      label: we.label,
      onDelete,
      onInsertBetween,
      sourceId: we.sourceId,
      targetId: we.targetId,
    },
  }));
}

// ── Inner canvas (inside ReactFlowProvider) ──────────────────────────────────

function WorkflowCanvasInner({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onDeleteNode,
  onMoveNode,
  onAddEdge,
  onDeleteEdge,
  nodeExecutionStatuses = {},
  nodeExecutionTimes = {},
  nodeValidations = {},
  onAddNode,
  onInsertBetween,
}: Props) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const hasFitRef = useRef(false);

  // Map workflow types to React Flow types
  const rfNodes = useMemo(
    () =>
      mapWorkflowNodesToReactFlow(
        nodes,
        selectedNodeId,
        nodeExecutionStatuses,
        nodeValidations,
        nodeExecutionTimes,
        onSelectNode,
        onDeleteNode
      ),
    [nodes, selectedNodeId, nodeExecutionStatuses, nodeValidations, nodeExecutionTimes, onSelectNode, onDeleteNode]
  );

  const rfEdges = useMemo(
    () => mapWorkflowEdgesToReactFlow(edges, onDeleteEdge, onInsertBetween),
    [edges, onDeleteEdge, onInsertBetween]
  );

  // ── Node changes (dragging, selection) ────────────────────
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position && change.dragging) {
          onMoveNode(change.id, {
            x: change.position.x,
            y: change.position.y,
          });
        }
        if (change.type === "select") {
          if (change.selected) {
            onSelectNode(change.id);
          }
        }
      }
    },
    [onMoveNode, onSelectNode]
  );

  // ── Edge changes ──────────────────────────────────────────
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Edge deletions via keyboard (Backspace/Delete) are handled by React Flow
      for (const change of changes) {
        if (change.type === "remove") {
          onDeleteEdge(change.id);
        }
      }
    },
    [onDeleteEdge]
  );

  // ── New connections (dragging from handle to handle) ──────
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // Don't allow self-connections
      if (connection.source === connection.target) return;

      const sourcePort =
        connection.sourceHandle && connection.sourceHandle !== "output"
          ? connection.sourceHandle
          : undefined;

      onAddEdge(connection.source, connection.target, sourcePort);
    },
    [onAddEdge]
  );

  // ── Connection validation: reject connections TO trigger nodes ──
  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      if (!connection.target) return false;
      // Find the target workflow node
      const targetWorkflow = nodes.find((n) => n.id === connection.target);
      if (!targetWorkflow) return false;
      // Trigger nodes don't accept input connections
      if (targetWorkflow.category === "trigger") return false;
      // Don't allow self-connections
      if (connection.source === connection.target) return false;
      return true;
    },
    [nodes]
  );

  // ── Drag-and-drop from palette ────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!onAddNode) return;

      const data = e.dataTransfer.getData("application/workflow-node");
      if (!data) return;

      try {
        const metadata: NodeMetadata = JSON.parse(data);
        const position = screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        onAddNode(metadata, position);
      } catch (err) {
        console.error("Failed to parse dropped node metadata:", err);
      }
    },
    [onAddNode, screenToFlowPosition]
  );

  // ── Canvas click: deselect ─────────────────────────────────
  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // ── Fit view once on load ──────────────────────────────────
  useEffect(() => {
    if (nodes.length === 0 || hasFitRef.current) return;
    hasFitRef.current = true;
    // Short delay to ensure React Flow has rendered
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, maxZoom: 1 });
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes, fitView]);

  // ── Tidy Up Nodes (listens for custom event from toolbar) ──
  useEffect(() => {
    const handleTidyUp = () => {
      const positions = tidyUpNodes(nodes, edges);
      positions.forEach((pos, nodeId) => {
        onMoveNode(nodeId, pos);
      });
      // Fit view after tidy up
      setTimeout(() => fitView({ padding: 0.15, maxZoom: 1 }), 50);
    };

    window.addEventListener("workflow:tidyup", handleTidyUp);
    return () => window.removeEventListener("workflow:tidyup", handleTidyUp);
  }, [nodes, edges, onMoveNode, fitView]);

  // ── React Flow node/edge type registry ─────────────────────
  const nodeTypes = useMemo(() => ({ workflowNode: WorkflowReactFlowNode }), []);
  const edgeTypes = useMemo(() => ({ workflowEdge: WorkflowCustomEdge }), []);

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      {/* Gradient mesh background (decorative) */}
      <div className="absolute inset-0 pointer-events-none opacity-30 dark:opacity-15 z-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl" />
      </div>

      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onPaneClick={onPaneClick}
        snapToGrid
        snapGrid={[15, 15]}
        fitView={false}
        deleteKeyCode={["Backspace", "Delete"]}
        defaultEdgeOptions={{
          type: "workflowEdge",
        }}
        proOptions={{ hideAttribution: true }}
        className="bg-gray-50/50 dark:bg-transparent"
        connectionLineStyle={{ stroke: "#818cf8", strokeWidth: 2, strokeDasharray: "6 4" }}
      >
        <Background
          gap={24}
          size={1}
          color="rgba(99, 102, 241, 0.08)"
          className="bg-gray-50/50 dark:bg-transparent"
        />
        <Controls
          showInteractive={false}
          className="!bg-white/80 dark:!bg-[#161b22]/80 !backdrop-blur-xl !rounded-xl !border !border-gray-200/50 dark:!border-white/8 !shadow-lg !shadow-black/5 dark:!shadow-black/20"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "workflowNode") {
              const nd = node.data as unknown as NodeDataBase;
              const meta = getNodeMetadata(nd.workflowNode.type);
              return meta?.color || "#8b949e";
            }
            return "#8b949e";
          }}
          maskColor="rgba(0, 0, 0, 0.15)"
          className="!bg-white/80 dark:!bg-[#161b22]/80 !backdrop-blur-xl !rounded-xl !border !border-gray-200/50 dark:!border-white/8 !shadow-lg !shadow-black/5 dark:!shadow-black/20"
          pannable
          zoomable
        />

        {/* Empty state overlay */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Start by adding a trigger from the palette
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Then add actions and conditions to build your workflow
              </p>
            </div>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

// ── Main export (wraps in ReactFlowProvider) ─────────────────────────────────

export default function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
