/**
 * Workflow History — Undo/Redo State Manager
 *
 * Maintains a circular buffer of workflow snapshots for undo/redo.
 * Each snapshot captures the full nodes + edges state.
 */

import type { WorkflowNode, WorkflowEdge } from "./workflow-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowSnapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  workflowName?: string;
  workflowDescription?: string;
  timestamp: number;
}

export interface HistoryState {
  past: WorkflowSnapshot[];
  future: WorkflowSnapshot[];
  maxHistory: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_HISTORY = 100; // matches n8n's STACK_LIMIT

// ── Factory ───────────────────────────────────────────────────────────────────

export function createHistoryState(maxHistory = DEFAULT_MAX_HISTORY): HistoryState {
  return {
    past: [],
    future: [],
    maxHistory,
  };
}

// ── Push a new snapshot (called after every mutation) ─────────────────────────

export function pushSnapshot(
  state: HistoryState,
  snapshot: Omit<WorkflowSnapshot, "timestamp">
): HistoryState {
  const entry: WorkflowSnapshot = {
    ...snapshot,
    timestamp: Date.now(),
  };

  return {
    past: [...state.past, entry].slice(-state.maxHistory),
    future: [], // clear redo stack on new action
    maxHistory: state.maxHistory,
  };
}

// ── Undo: pop from past, push current to future ──────────────────────────────

export function undo(
  state: HistoryState,
  current: Omit<WorkflowSnapshot, "timestamp">
): { state: HistoryState; snapshot: WorkflowSnapshot | null } {
  if (state.past.length === 0) {
    return { state, snapshot: null };
  }

  const previous = state.past[state.past.length - 1];
  const currentEntry: WorkflowSnapshot = {
    ...current,
    timestamp: Date.now(),
  };

  return {
    state: {
      past: state.past.slice(0, -1),
      future: [...state.future, currentEntry],
      maxHistory: state.maxHistory,
    },
    snapshot: previous,
  };
}

// ── Redo: pop from future, push current to past ──────────────────────────────

export function redo(
  state: HistoryState,
  current: Omit<WorkflowSnapshot, "timestamp">
): { state: HistoryState; snapshot: WorkflowSnapshot | null } {
  if (state.future.length === 0) {
    return { state, snapshot: null };
  }

  const next = state.future[state.future.length - 1];
  const currentEntry: WorkflowSnapshot = {
    ...current,
    timestamp: Date.now(),
  };

  return {
    state: {
      past: [...state.past, currentEntry],
      future: state.future.slice(0, -1),
      maxHistory: state.maxHistory,
    },
    snapshot: next,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

export function getHistoryInfo(state: HistoryState): {
  undoCount: number;
  redoCount: number;
  maxHistory: number;
} {
  return {
    undoCount: state.past.length,
    redoCount: state.future.length,
    maxHistory: state.maxHistory,
  };
}
