"use client";

import React, { useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type ReactFlowInstance,
  BackgroundVariant,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./reactflow-theme.css";

import type { WorkflowNode, WorkflowEdge, NodeMetadata } from "@/lib/workflow-types";
import { getNodeMetadata } from "@/lib/workflow-types";
import type { NodeValidationResult } from "@/lib/workflow-validation";
import BaseNode from "./nodes/BaseNode";
import WorkflowEdgeComponent from "./WorkflowEdge";

// ── Custom Node/Edge Types ──────────────────────────────────────────────────

const nodeTypes = {
  trigger: BaseNode,
  action: BaseNode,
  condition: BaseNode,
  flow: BaseNode,
  utility: BaseNode,
};

const edgeTypes = {
  workflow: WorkflowEdgeComponent,
};

// ── Data Conversion ─────────────────────────────────────────────────────────

function toRFNode(
  node: WorkflowNode,
  executionState?: "idle" | "running" | "success" | "error",
  validation?: NodeValidationResult,
  isSelected?: boolean
): Node {
  const isCondition = node.category === "condition" && node.type !== "loop_items";
  const isLoop = node.type === "loop_items";
  const isTrigger = node.category === "trigger";
  const isStickyNote = node.type === "sticky_note";

  // Get color and icon from metadata
  const meta = getNodeMetadata(node.type);

  return {
    id: node.id,
    type: node.category,
    position: node.position,
    data: {
      ...node,
      nodeType: node.type,
      color: meta?.color || "#8b949e",
      icon: meta?.icon || "FileText",
      executionState: executionState || "idle",
      validation,
      isSelected,
      isTrigger,
      isCondition,
      isLoop,
      isStickyNote,
      disabled: node.disabled,
      isPinned: !!node.config?._pinnedData,
    },
    selected: isSelected,
  };
}

function toRFEdge(edge: WorkflowEdge): Edge {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    sourceHandle: edge.sourcePort || "default",
    type: "workflow",
    data: { label: edge.label, sourcePort: edge.sourcePort },
  };
}

// ── Inner Canvas (has access to useReactFlow) ───────────────────────────────

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
  nodeValidations = {},
  onAddNode,
}: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Convert internal types to React Flow types
  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((node) =>
        toRFNode(
          node,
          nodeExecutionStatuses[node.id],
          nodeValidations[node.id],
          selectedNodeId === node.id
        )
      ),
    [nodes, nodeExecutionStatuses, nodeValidations, selectedNodeId]
  );

  const rfEdges: Edge[] = useMemo(
    () => edges.map(toRFEdge),
    [edges]
  );

  // ── React Flow Event Handlers ──────────────────────────────────

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position && change.id) {
          onMoveNode(change.id, change.position);
        }
        if (change.type === "select") {
          if (change.selected) {
            onSelectNode(change.id);
          }
        }
        if (change.type === "remove") {
          const node = nodes.find((n) => n.id === change.id);
          if (node?.category !== "trigger") {
            onDeleteNode(change.id);
          }
        }
      }
    },
    [nodes, onMoveNode, onSelectNode, onDeleteNode]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "remove" && change.id) {
          onDeleteEdge(change.id);
        }
      }
    },
    [onDeleteEdge]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        onAddEdge(
          connection.source,
          connection.target,
          connection.sourceHandle || undefined
        );
      }
    },
    [onAddEdge]
  );

  // ── Drag and Drop from Palette ─────────────────────────────────

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!onAddNode) return;

      const data = event.dataTransfer.getData("application/workflow-node");
      if (!data) return;

      try {
        const metadata: NodeMetadata = JSON.parse(data);
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        onAddNode(metadata, position);
      } catch (err) {
        console.error("Failed to parse dropped node metadata:", err);
      }
    },
    [onAddNode, screenToFlowPosition]
  );

  // ── Click on canvas background to deselect ─────────────────────

  const onPaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // ── Node click ─────────────────────────────────────────────────

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.id);
    },
    [onSelectNode]
  );

  return (
    <div
      ref={reactFlowWrapper}
      className="flex-1 h-full"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{ type: "workflow" }}
        style={{ backgroundColor: "#0d1117" }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={["Delete", "Backspace"]}
        multiSelectionKeyCode="Shift"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="rgba(99, 102, 241, 0.12)"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            const data = node.data as any;
            return data?.color || "#8b949e";
          }}
          maskColor="rgba(129, 140, 248, 0.08)"
          style={{
            backgroundColor: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 12,
          }}
          pannable
          zoomable
        />

        {/* Empty state overlay */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Start by adding a trigger from the palette
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Drag nodes onto the canvas or click to add
              </p>
            </div>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

// ── Main Export (wraps with ReactFlowProvider) ──────────────────────────────

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
  nodeValidations?: Record<string, NodeValidationResult>;
  onAddNode?: (metadata: NodeMetadata, position: { x: number; y: number }) => void;
}

export default function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
