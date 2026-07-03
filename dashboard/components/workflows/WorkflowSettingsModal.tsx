"use client";

/**
 * WorkflowSettingsModal — n8n-style workflow settings panel
 *
 * Settings: execution order, timezone, error workflow, retry, timeout.
 */

import React, { useState, useEffect } from "react";
import { X, Settings, Clock, AlertTriangle, Zap } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowSettings {
  timezone?: string;
  executionOrder?: "v0" | "v1";
  errorWorkflowId?: string;
  saveDataSuccessExecution?: "all" | "none";
  saveDataErrorExecution?: "all" | "none";
  saveExecutionProgress?: boolean;
  executionTimeout?: number;
  saveManualExecutions?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: WorkflowSettings;
  onSave: (settings: WorkflowSettings) => void;
  workflowId?: string;
}

// ── Timezone Options ──────────────────────────────────────────────────────────

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkflowSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
}: Props) {
  const [local, setLocal] = useState<WorkflowSettings>(settings);

  useEffect(() => {
    if (isOpen) setLocal(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const update = (key: keyof WorkflowSettings, value: any) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#2f81f7]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#e6edf3]">Workflow Settings</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#21262d] text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Execution Order */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <label className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">Execution Order</label>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-2">
              Controls how branches execute. v1 executes each branch completely before moving to the next.
            </p>
            <div className="flex gap-2">
              {(["v0", "v1"] as const).map((order) => (
                <button
                  key={order}
                  onClick={() => update("executionOrder", order)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                    local.executionOrder === order
                      ? "border-[#2f81f7] bg-blue-50/30 dark:bg-[#2f81f7]/10 text-[#2f81f7]"
                      : "border-gray-200 dark:border-[#30363d] text-gray-500 dark:text-[#8b949e] hover:border-gray-300 dark:hover:border-[#484f58]"
                  }`}
                >
                  <div className="font-semibold">{order.toUpperCase()}</div>
                  <div className="text-[9px] mt-0.5 opacity-70">
                    {order === "v0" ? "Legacy (interleaved)" : "Modern (sequential)"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Timezone */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <label className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">Timezone</label>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-2">
              Used for scheduled triggers and date/time operations.
            </p>
            <select
              value={local.timezone || "DEFAULT"}
              onChange={(e) => update("timezone", e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
            >
              <option value="DEFAULT">Default (Server timezone)</option>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Error Workflow */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
              <label className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">Error Workflow</label>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-2">
              If this workflow fails, trigger another workflow to handle the error.
            </p>
            <input
              type="text"
              value={local.errorWorkflowId || ""}
              onChange={(e) => update("errorWorkflowId", e.target.value)}
              placeholder="Workflow ID (leave empty for none)"
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
            />
          </div>

          {/* Data Storage */}
          <div>
            <label className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3] mb-3 block">Data Storage</label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-700 dark:text-[#c9d1d9]">Save data on success</div>
                  <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Save execution data for successful runs</div>
                </div>
                <select
                  value={local.saveDataSuccessExecution || "all"}
                  onChange={(e) => update("saveDataSuccessExecution", e.target.value)}
                  className="px-2 py-1 text-[10px] rounded border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-700 dark:text-[#c9d1d9] focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="none">None</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-700 dark:text-[#c9d1d9]">Save data on error</div>
                  <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Save execution data for failed runs</div>
                </div>
                <select
                  value={local.saveDataErrorExecution || "all"}
                  onChange={(e) => update("saveDataErrorExecution", e.target.value)}
                  className="px-2 py-1 text-[10px] rounded border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-700 dark:text-[#c9d1d9] focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="none">None</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.saveExecutionProgress ?? true}
                  onChange={(e) => update("saveExecutionProgress", e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-[#484f58] text-[#2f81f7] focus:ring-[#2f81f7]/50"
                />
                <div>
                  <div className="text-xs text-gray-700 dark:text-[#c9d1d9]">Save execution progress</div>
                  <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Allow resuming from failure point</div>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={local.saveManualExecutions ?? true}
                  onChange={(e) => update("saveManualExecutions", e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-[#484f58] text-[#2f81f7] focus:ring-[#2f81f7]/50"
                />
                <div>
                  <div className="text-xs text-gray-700 dark:text-[#c9d1d9]">Save manual executions</div>
                  <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Save runs triggered manually</div>
                </div>
              </label>
            </div>
          </div>

          {/* Timeout */}
          <div>
            <label className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3] mb-2 block">Execution Timeout</label>
            <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-2">
              Maximum execution time in seconds. 0 = no limit.
            </p>
            <input
              type="number"
              value={local.executionTimeout || 0}
              onChange={(e) => update("executionTimeout", parseInt(e.target.value) || 0)}
              min={0}
              className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-[#30363d] flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#c9d1d9] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onSave(local); onClose(); }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2f81f7] hover:bg-[#2672d9] text-white transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
