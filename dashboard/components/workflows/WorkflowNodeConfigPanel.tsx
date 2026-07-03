"use client";

import React, { useState, useCallback, useRef } from "react";
import { X, Info, Plus, Trash2, Pin, PinOff, ChevronDown, ChevronUp, Copy, Check, AlertCircle, AlertTriangle, Code2, Zap, Loader2, Edit2, Save, UploadCloud } from "lucide-react";
import type { WorkflowNode, SwitchRule } from "@/lib/workflow-types";
import { getNodeMetadata } from "@/lib/workflow-types";

// -- Drag Context --------------------------------------------------------------
export const DragCtx = React.createContext<{
  draggedPath: string | null;
  setDraggedPath: (val: string | null) => void;
}>({ draggedPath: null, setDraggedPath: () => {} });

function insertAtCaret(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const val = input.value;
  return val.slice(0, start) + text + val.slice(end);
}

// -- Schema View (draggable field tree) ---------------------------------------
function SchemaView({ data, path = "$json", showTypes = false }: { data: any; path?: string; showTypes?: boolean }) {
  const { setDraggedPath } = React.useContext(DragCtx);

  if (data === null || data === undefined) return <span className="text-gray-500 italic text-[10px]">null</span>;
  if (typeof data !== "object") {
    if (showTypes) return <span className="text-[#6e7681] text-[10px] italic">{typeof data}</span>;
    return <span className="text-[#2f81f7] text-[10px]">{String(data)}</span>;
  }

  return (
    <div className="pl-3 border-l border-[#30363d] ml-1 mt-0.5">
      {Object.entries(data).map(([key, val]) => {
        const fullPath = Array.isArray(data) ? `${path}[${key}]` : `${path}.${key}`;
        const isPrimitive = val === null || typeof val !== "object";
        const typeLabel = val === null ? "null" : Array.isArray(val) ? `array[${(val as any[]).length}]` : typeof val;

        return (
          <div key={key} className="py-[2px]">
            <div
              draggable={isPrimitive}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("text/plain", `{{${fullPath}}}`);
                setDraggedPath(fullPath);
              }}
              onDragEnd={() => setDraggedPath(null)}
              className={`flex items-center gap-1.5 font-mono text-[11px] leading-relaxed rounded ${isPrimitive ? "cursor-grab active:cursor-grabbing hover:bg-[#2f81f7]/10 px-1 -mx-1 group transition-colors" : ""}`}
            >
              {/* Type chip */}
              <span className="text-[9px] font-bold px-1 py-[1px] rounded bg-[#21262d] text-[#8b949e] border border-[#30363d] shrink-0">
                {val === null ? "null" : Array.isArray(val) ? "[]" : typeof val === "object" ? "{}" : typeof val === "number" ? "123" : typeof val === "boolean" ? "T/F" : "T"}
              </span>
              <span className="text-[#c9d1d9] font-semibold shrink-0">{key}</span>
              {isPrimitive && !showTypes && (
                <span className="text-[#8b949e] truncate group-hover:text-[#2f81f7] transition-colors text-[10px]">
                  {val === null ? "null" : String(val).substring(0, 40)}
                </span>
              )}
              {isPrimitive && showTypes && (
                <span className="text-[#6e7681] italic text-[10px]">{typeof val}</span>
              )}
              {!isPrimitive && (
                <span className="text-[#6e7681] text-[10px]">{typeLabel}</span>
              )}
            </div>
            {!isPrimitive && (
              <SchemaView data={val} path={fullPath} showTypes={showTypes} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// -- CSV Drag & Drop Uploader ---------------------------------------------------
function CsvUploader({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError("");
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are allowed.");
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/workflow/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload");
      
      onChange(data.file.path);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="space-y-1">
      <label className="block text-[11px] font-semibold text-gray-700 dark:text-[#c9d1d9] mb-1">
        CSV File
      </label>
      
      <div 
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" : "border-gray-300 dark:border-[#30363d] bg-gray-50 hover:bg-gray-100 dark:bg-[#0d1117] dark:hover:bg-[#161b22]"
        }`}
      >
        <input 
          type="file" 
          accept=".csv" 
          className="hidden" 
          ref={inputRef} 
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
          }}
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center justify-center text-indigo-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-medium">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-500 dark:text-[#8b949e] gap-1">
            <UploadCloud className="w-6 h-6 mb-1 text-gray-400" />
            <span className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">Click to upload or drag & drop</span>
            <span className="text-[10px]">CSV files only</span>
          </div>
        )}
      </div>

      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
      
      {value && !isUploading && (
        <div className="flex items-center gap-1.5 mt-2 bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 p-2 rounded border border-green-200 dark:border-green-500/20 text-[11px] font-mono break-all">
          <Check className="w-3.5 h-3.5 flex-shrink-0" />
          {value}
        </div>
      )}
    </div>
  );
}

// -- Table View ----------------------------------------------------------------
function TableView({ data }: { data: any }) {
  const rows: any[] = Array.isArray(data) ? data : [data];
  const allKeys = Array.from(new Set(rows.flatMap(r => typeof r === "object" && r !== null ? Object.keys(r) : [])));

  if (allKeys.length === 0) return (
    <div className="text-xs text-[#8b949e] p-4 text-center">No tabular data</div>
  );

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead className="sticky top-0 bg-[#161b22] z-10">
          <tr>
            <th className="text-left text-[#8b949e] px-2 py-1.5 border-b border-[#30363d] font-semibold w-8">#</th>
            {allKeys.map(k => (
              <th key={k} className="text-left text-[#e6edf3] px-2 py-1.5 border-b border-[#30363d] font-semibold whitespace-nowrap">{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[#21262d] hover:bg-[#21262d]/50 transition-colors">
              <td className="px-2 py-1.5 text-[#6e7681]">{i + 1}</td>
              {allKeys.map(k => {
                const cell = row?.[k];
                const isObj = cell !== null && typeof cell === "object";
                return (
                  <td key={k} className="px-2 py-1.5 max-w-[200px]">
                    {isObj
                      ? <span className="text-[#6e7681] italic">{Array.isArray(cell) ? `[${cell.length}]` : "{...}"}</span>
                      : cell === null || cell === undefined
                        ? <span className="text-[#6e7681] italic">null</span>
                        : <span className="text-[#c9d1d9] truncate block">{String(cell)}</span>
                    }
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -- Data View Tabs ------------------------------------------------------------
function DataViewTabs({
  data,
  defaultMsg,
  onExecute,
  isRunning,
  nodeOutputMap,
  currentNodeId,
}: {
  data: any;
  defaultMsg: string;
  onExecute?: () => void;
  isRunning?: boolean;
  nodeOutputMap?: Record<string, { label: string; data: any }>;
  currentNodeId?: string;
}) {
  const [view, setView] = React.useState<"schema" | "table" | "json">("schema");
  const [selectedSource, setSelectedSource] = React.useState<string>("__current__");

  const sources = nodeOutputMap ? Object.entries(nodeOutputMap).filter(([id]) => id !== currentNodeId) : [];
  const activeData = selectedSource === "__current__" ? data : (nodeOutputMap?.[selectedSource]?.data ?? null);

  return (
    <div className="flex flex-col h-full">
      {/* Source selector */}
      {sources.length > 0 && (
        <div className="px-2 pt-2">
          <select
            value={selectedSource}
            onChange={e => setSelectedSource(e.target.value)}
            className="w-full text-[10px] bg-[#21262d] border border-[#30363d] rounded px-2 py-1 text-[#c9d1d9] focus:outline-none focus:border-[#2f81f7]"
          >
            <option value="__current__">Current node input</option>
            {sources.map(([id, info]) => (
              <option key={id} value={id}>{info.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* View tabs */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1">
        {(["schema", "table", "json"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2.5 py-1 rounded text-[10px] font-semibold capitalize transition-colors ${view === v ? "bg-[#30363d] text-[#e6edf3]" : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"}`}
          >
            {v}
          </button>
        ))}
        <div className="flex-1" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {!activeData ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-4">
            <p className="text-xs text-[#8b949e]">{defaultMsg}</p>
            {onExecute && (
              <>
                <button
                  onClick={onExecute}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Execute step
                </button>
                <span className="text-[10px] text-[#8b949e]">or <button className="text-[#2f81f7] hover:underline" onClick={onExecute}>set mock data</button></span>
              </>
            )}
          </div>
        ) : view === "json" ? (
          <pre className="text-[10px] font-mono text-[#c9d1d9] leading-relaxed whitespace-pre-wrap break-words">
            {JSON.stringify(activeData, null, 2)}
          </pre>
        ) : view === "table" ? (
          <TableView data={activeData} />
        ) : (
          <div className="text-[#c9d1d9]">
            <div className="flex items-center gap-1.5 py-1 mb-0.5">
              <span className="text-[9px] font-bold px-1 py-[1px] rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]">{"{}"}</span>
              <span className="text-[11px] font-mono font-semibold text-[#e6edf3]">root</span>
              <span className="text-[10px] text-[#6e7681]">
                {Array.isArray(activeData) ? `Array[${activeData.length}]` : "Object"}
              </span>
            </div>
            <SchemaView data={activeData} path="$json" />
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  node: WorkflowNode | null;
  onClose: () => void;
  onUpdate: (id: string, config: Record<string, any>, label?: string, nodeOverrides?: Record<string, any>) => void;
  executionData?: any;
  nodes?: WorkflowNode[];
  edges?: any[];
  selectedExecution?: any;
  onSelectNode?: (id: string) => void;
  onTestStep?: (nodeId: string) => Promise<void>;
  nodeOutputMap?: Record<string, { label: string; data: any }>;
  isTestingStep?: boolean;
}

// ── Template / Expression variable hints ─────────────────────────────────────

const TEMPLATE_VARS = [
  { var: "{{$json.lead.name}}", desc: "Lead's full name" },
  { var: "{{$json.lead.phone}}", desc: "Lead's phone number" },
  { var: "{{$json.lead.email}}", desc: "Lead's email" },
  { var: "{{$json.lead.city}}", desc: "Lead's city" },
  { var: "{{$json.lead.status}}", desc: "Current lead status" },
  { var: "{{$json.call.sentiment}}", desc: "Call sentiment" },
  { var: "{{$json.call.summary}}", desc: "AI call summary" },
  { var: "{{$now}}", desc: "Current timestamp" },
  { var: "{{$runIndex}}", desc: "Loop iteration index" },
];

// ── Shared form components ────────────────────────────────────────────────────


function InputField({
  label, value, onChange, placeholder, type = "text", helperText, monospace,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; helperText?: string; monospace?: boolean;
}) {
  const { draggedPath } = React.useContext(DragCtx);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  return (
    <div className="space-y-1.5 relative">
      <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">{label}</label>
      <input
        ref={inputRef}
        type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (draggedPath && inputRef.current) {
            const newVal = insertAtCaret(inputRef.current, "{{" + draggedPath + "}}");
            onChange(newVal);
          }
        }}
        className={`w-full px-3 py-2 text-sm rounded-lg border transition-all
          ${isDragOver ? "border-green-500 ring-2 ring-green-500/30 bg-green-500/5 dark:bg-green-500/10" : "border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117]"}
          text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#484f58]
          focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7]
          ${monospace ? "font-mono text-xs" : ""}`}
      />
      {helperText && <p className="text-[10px] text-gray-400 dark:text-[#6e7681]">{helperText}</p>}
    </div>
  );
}

function TextAreaField({
  label, value, onChange, placeholder, rows = 4, monospace,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; monospace?: boolean;
}) {
  const { draggedPath } = React.useContext(DragCtx);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  return (
    <div className="space-y-1.5 relative">
      <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">{label}</label>
      <textarea
        ref={inputRef}
        value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (draggedPath && inputRef.current) {
            const newVal = insertAtCaret(inputRef.current, "{{" + draggedPath + "}}");
            onChange(newVal);
          }
        }}
        className={`w-full px-3 py-2 text-sm rounded-lg border transition-all resize-none
          ${isDragOver ? "border-green-500 ring-2 ring-green-500/30 bg-green-500/5 dark:bg-green-500/10" : "border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117]"}
          text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#484f58]
          focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7]
          ${monospace ? "font-mono text-xs leading-relaxed" : ""}`}
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options, helperText,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; helperText?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">{label}</label>
      <select
        value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#30363d]
          bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3]
          focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {helperText && <p className="text-[10px] text-gray-400 dark:text-[#6e7681]">{helperText}</p>}
    </div>
  );
}

function NumberField({
  label, value, onChange, min = 0, max,
}: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">{label}</label>
      <input
        type="number" value={value || 0} onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={min} max={max}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#30363d]
          bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3]
          focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all"
      />
    </div>
  );
}

// ── Switch Rule Builder ───────────────────────────────────────────────────────

function SwitchRuleBuilder({
  rules, onChange,
}: {
  rules: SwitchRule[];
  onChange: (rules: SwitchRule[]) => void;
}) {
  const addRule = () => {
    const newRule: SwitchRule = {
      id: `r_${Date.now()}`,
      label: `Output ${rules.length + 1}`,
      field: "$json.lead.status",
      operator: "equals",
      value: "",
      outputIndex: rules.length,
    };
    onChange([...rules, newRule]);
  };

  const updateRule = (id: string, patch: Partial<SwitchRule>) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">
          Routing Rules
        </label>
        <button
          onClick={addRule}
          className="flex items-center gap-1 text-[10px] font-medium text-[#2f81f7] hover:text-[#2672d9] transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Rule
        </button>
      </div>

      {rules.length === 0 && (
        <div className="p-3 rounded-lg border border-dashed border-gray-300 dark:border-[#30363d] text-center">
          <p className="text-xs text-gray-400 dark:text-[#6e7681]">No rules yet. Add a routing rule.</p>
        </div>
      )}

      {rules.map((rule, idx) => (
        <div
          key={rule.id}
          className="p-3 rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50/50 dark:bg-[#0d1117] space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "#d2992220", color: "#d29922", border: "1px solid #d2992240" }}
              >
                OUT {idx}
              </span>
              <input
                value={rule.label}
                onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                placeholder={`Output ${idx + 1}`}
                className="text-xs font-medium bg-transparent border-none outline-none text-gray-800 dark:text-[#e6edf3] w-24"
              />
            </div>
            <button
              onClick={() => removeRule(rule.id)}
              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <input
              value={rule.field}
              onChange={(e) => updateRule(rule.id, { field: e.target.value })}
              placeholder="$json.lead.status"
              className="col-span-1 px-2 py-1.5 text-[10px] font-mono rounded border border-gray-200 dark:border-[#30363d]
                bg-white dark:bg-[#161b22] text-gray-900 dark:text-[#e6edf3]
                focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40"
            />
            <select
              value={rule.operator}
              onChange={(e) => updateRule(rule.id, { operator: e.target.value as any })}
              className="col-span-1 px-2 py-1.5 text-[10px] rounded border border-gray-200 dark:border-[#30363d]
                bg-white dark:bg-[#161b22] text-gray-900 dark:text-[#e6edf3]
                focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40 cursor-pointer"
            >
              <option value="equals">= equals</option>
              <option value="not_equals">≠ not equals</option>
              <option value="contains">contains</option>
              <option value="not_contains">not contains</option>
              <option value="greater_than">&gt; greater</option>
              <option value="less_than">&lt; less</option>
              <option value="is_empty">is empty</option>
              <option value="is_not_empty">not empty</option>
              <option value="regex">regex</option>
            </select>
            <input
              value={rule.value}
              onChange={(e) => updateRule(rule.id, { value: e.target.value })}
              placeholder="value"
              className="col-span-1 px-2 py-1.5 text-[10px] rounded border border-gray-200 dark:border-[#30363d]
                bg-white dark:bg-[#161b22] text-gray-900 dark:text-[#e6edf3]
                focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40"
            />
          </div>
        </div>
      ))}

      {rules.length > 0 && (
        <div className="p-2 rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] flex items-center gap-2">
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: "#8b949e20", color: "#8b949e", border: "1px solid #8b949e40" }}
          >
            FALLBACK
          </span>
          <span className="text-[10px] text-gray-400 dark:text-[#6e7681]">
            Sends to fallback output if no rules match
          </span>
        </div>
      )}
    </div>
  );
}

// ── Code Node Editor ──────────────────────────────────────────────────────────

function CodeNodeEditor({
  code, language, onChange, onChangeLanguage,
}: {
  code: string;
  language: string;
  onChange: (v: string) => void;
  onChangeLanguage: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9] flex items-center gap-1.5">
          <Code2 className="w-3.5 h-3.5 text-[#7c3aed]" />
          Code Editor
        </label>
        <select
          value={language}
          onChange={(e) => onChangeLanguage(e.target.value)}
          className="text-[10px] px-2 py-1 rounded border border-gray-200 dark:border-[#30363d]
            bg-gray-50 dark:bg-[#0d1117] text-gray-800 dark:text-[#e6edf3]
            focus:outline-none cursor-pointer"
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python (coming soon)</option>
        </select>
      </div>

      {/* Code editor area */}
      <div className="relative rounded-lg overflow-hidden border border-[#7c3aed]/30 bg-[#1e1033]">
        {/* Line numbers gutter */}
        <div className="flex">
          <div className="w-8 flex-shrink-0 bg-[#180d2e] border-r border-[#7c3aed]/20 py-3 select-none">
            {(code || "").split("\n").map((_, i) => (
              <div key={i} className="text-[9px] text-[#7c3aed]/40 text-right pr-2 leading-5 h-5">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            value={code || ""}
            onChange={(e) => onChange(e.target.value)}
            rows={Math.max(8, (code || "").split("\n").length + 2)}
            spellCheck={false}
            className="flex-1 px-3 py-3 text-xs font-mono bg-transparent text-[#c9d1d9]
              focus:outline-none resize-none leading-5 placeholder-[#484f58]"
            placeholder="// Write your code here..."
          />
        </div>
      </div>

      {/* Quick reference */}
      <div className="p-2.5 rounded-lg bg-[#7c3aed]/5 border border-[#7c3aed]/20 space-y-1.5">
        <p className="text-[10px] font-semibold text-[#7c3aed]">Available Variables</p>
        <div className="grid grid-cols-1 gap-0.5 font-mono text-[9px]">
          {[
            ["$input.all()", "Array of all input items"],
            ["$input.first()", "First input item"],
            ["$json", "Current item's JSON data"],
            ["$json.lead.email", "Access nested fields"],
          ].map(([c, desc]) => (
            <div key={c} className="flex items-center justify-between">
              <code className="text-[#a78bfa]">{c}</code>
              <span className="text-gray-400 dark:text-[#6e7681]">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Data Pinning Section ──────────────────────────────────────────────────────

function DataPinningSection({
  pinnedData, onPin, onUnpin, executionData,
}: {
  pinnedData?: any;
  onPin: (data: any) => void;
  onUnpin: () => void;
  executionData?: any;
}) {
  const isPinned = !!pinnedData;
  const [editing, setEditing] = React.useState(false);
  const [editJson, setEditJson] = React.useState("");
  const [jsonError, setJsonError] = React.useState("");

  const startEdit = () => {
    setEditJson(JSON.stringify(pinnedData, null, 2));
    setJsonError("");
    setEditing(true);
  };

  const saveEdit = () => {
    try {
      const parsed = JSON.parse(editJson);
      onPin(parsed);
      setEditing(false);
    } catch (err: any) {
      setJsonError("Invalid JSON: " + err.message);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isPinned ? <Pin className="w-3.5 h-3.5 text-purple-400" /> : <PinOff className="w-3.5 h-3.5 text-[#6e7681]" />}
          <span className="text-xs font-medium text-[#c9d1d9]">Data Pinning</span>
          {isPinned && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">PINNED</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isPinned && !editing && (
            <button onClick={startEdit} className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors">
              <Edit2 className="w-2.5 h-2.5" /> Edit
            </button>
          )}
          {isPinned ? (
            <button onClick={onUnpin} className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors">
              <PinOff className="w-2.5 h-2.5" /> Unpin
            </button>
          ) : executionData?.output ? (
            <button onClick={() => onPin(executionData.output)} className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors">
              <Pin className="w-2.5 h-2.5" /> Pin Output
            </button>
          ) : null}
        </div>
      </div>
      {isPinned && !editing && (
        <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
          <p className="text-[10px] text-purple-400 mb-1.5 font-medium flex items-center gap-1">
            <Pin className="w-2.5 h-2.5" /> Pinned — bypasses real API on test runs
          </p>
          <pre className="text-[9px] font-mono text-purple-300 overflow-auto max-h-24 leading-relaxed">
            {JSON.stringify(pinnedData, null, 2)}
          </pre>
        </div>
      )}
      {isPinned && editing && (
        <div className="space-y-2">
          <p className="text-[10px] text-[#8b949e]">Edit JSON to simulate edge cases:</p>
          <textarea value={editJson} onChange={e => { setEditJson(e.target.value); setJsonError(""); }} rows={8}
            className="w-full text-[10px] font-mono px-2 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/5 text-purple-300 focus:outline-none resize-none"
            spellCheck={false} />
          {jsonError && <p className="text-[10px] text-red-400">{jsonError}</p>}
          <div className="flex gap-2">
            <button onClick={saveEdit} className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors">
              <Save className="w-2.5 h-2.5" /> Save
            </button>
            <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-[10px] rounded border border-[#30363d] text-[#8b949e] hover:bg-[#21262d] transition-colors">Cancel</button>
          </div>
        </div>
      )}
      {!isPinned && !executionData?.output && (
        <p className="text-[10px] text-[#6e7681]">Run the workflow or click Execute step to generate output you can pin for testing.</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkflowNodeConfigPanel({ node, onClose, onUpdate, executionData, nodes, edges, selectedExecution, onSelectNode, onTestStep, nodeOutputMap, isTestingStep }: Props) {
  const [activeTab, setActiveTab] = useState<"config" | "execution" | "settings">("config");
  const [copiedJson, setCopiedJson] = useState(false);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);

  React.useEffect(() => {
    if (!executionData) setActiveTab("config");
  }, [executionData, node?.id]);

  if (!node) return null;

  const meta = getNodeMetadata(node.type);
  const color = meta?.color || "#8b949e";

  const update = (key: string, value: any) => {
    onUpdate(node.id, { ...node.config, [key]: value });
  };

  const updateLabel = (label: string) => {
    onUpdate(node.id, node.config, label);
  };

  const pinData = (data: any) => {
    onUpdate(node.id, { ...node.config, _pinnedData: data });
  };

  const unpinData = () => {
    const { _pinnedData, ...rest } = node.config;
    onUpdate(node.id, rest);
  };

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // ── Config Fields by Node Type ──────────────────────────────────────────────
  const renderConfigFields = () => {
    switch (node.type) {
      // ── Triggers ─────────────────────────────────────────────
      case "manual_trigger":
        return (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
            <p className="text-xs text-green-700 dark:text-green-400">
              🚀 This trigger fires immediately when you click <strong>Run Manually</strong>. Use it for testing or on-demand outreach campaigns.
            </p>
          </div>
        );

      case "error_trigger":
        return (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              <p className="text-xs text-red-700 dark:text-red-400">
                ⚠️ This trigger fires when another workflow encounters an error. Set this as the <strong>Error Workflow</strong> in your other workflow's settings.
              </p>
            </div>
          </div>
        );

      case "new_lead":
        return (
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
            <p className="text-xs text-green-700 dark:text-green-400">
              This trigger fires automatically when the AI agent captures a new lead during a call. No configuration needed.
            </p>
          </div>
        );

      case "call_completed":
        return (
          <SelectField
            label="Call Direction"
            value={node.config.callDirection || "any"}
            onChange={(v) => update("callDirection", v)}
            options={[
              { value: "any", label: "Any Direction" },
              { value: "inbound", label: "Inbound Only" },
              { value: "outbound", label: "Outbound Only" },
            ]}
          />
        );

      case "scheduled":
        return (
          <div className="space-y-3">
            <InputField
              label="Cron Expression"
              value={node.config.cronExpression || ""}
              onChange={(v) => update("cronExpression", v)}
              placeholder="0 9 * * *"
              helperText="minute hour day month weekday — e.g. '0 9 * * 1-5' = weekdays 9am"
              monospace
            />
            <InputField
              label="Human-readable Description"
              value={node.config.scheduleDescription || ""}
              onChange={(v) => update("scheduleDescription", v)}
              placeholder="Every weekday at 9:00 AM"
            />
          </div>
        );

      case "webhook_received":
        return (
          <div className="space-y-3">
            <InputField
              label="Webhook Path"
              value={node.config.webhookPath || ""}
              onChange={(v) => update("webhookPath", v)}
              placeholder="/api/webhook/custom"
              helperText="POST to this path to trigger the workflow"
              monospace
            />
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20">
              <p className="text-[10px] text-blue-700 dark:text-blue-400">
                Full URL: <code className="font-mono">https://your-domain.com{node.config.webhookPath || "/api/webhook/custom"}</code>
              </p>
            </div>
          </div>
        );

      case "lead_status_changed":
        return (
          <div className="space-y-3">
            <SelectField
              label="From Status"
              value={node.config.fromStatus || "any"}
              onChange={(v) => update("fromStatus", v)}
              options={[
                { value: "any", label: "Any Status" },
                { value: "New", label: "New" },
                { value: "Contacted", label: "Contacted" },
                { value: "Qualified", label: "Qualified" },
                { value: "Interested", label: "Interested" },
                { value: "Converted", label: "Converted" },
                { value: "Lost", label: "Lost" },
              ]}
            />
            <SelectField
              label="To Status"
              value={node.config.toStatus || "any"}
              onChange={(v) => update("toStatus", v)}
              options={[
                { value: "any", label: "Any Status" },
                { value: "New", label: "New" },
                { value: "Contacted", label: "Contacted" },
                { value: "Qualified", label: "Qualified" },
                { value: "Interested", label: "Interested" },
                { value: "Converted", label: "Converted" },
                { value: "Lost", label: "Lost" },
              ]}
            />
          </div>
        );

      case "form_submitted":
        return (
          <InputField
            label="Form ID (optional)"
            value={node.config.formId || ""}
            onChange={(v) => update("formId", v)}
            placeholder="contact-form-1"
            helperText="Leave empty to trigger on any form submission"
          />
        );

      case "lead_tag_added":
        return (
          <InputField
            label="Tag Name"
            value={node.config.tagName || ""}
            onChange={(v) => update("tagName", v)}
            placeholder="vip-customer"
          />
        );

      case "sentiment_detected":
        return (
          <SelectField
            label="Sentiment Type"
            value={node.config.sentimentType || "positive"}
            onChange={(v) => update("sentimentType", v)}
            options={[
              { value: "positive", label: "Positive 😊" },
              { value: "negative", label: "Negative 😟" },
              { value: "neutral", label: "Neutral 😐" },
            ]}
          />
        );

      // ── Flow Control ──────────────────────────────────────────
      case "if_else":
        return (
          <div className="space-y-3">
            <SelectField
              label="Field"
              value={node.config.field || "lead.city"}
              onChange={(v) => update("field", v)}
              options={[
                { value: "lead.name", label: "Lead Name" },
                { value: "lead.phone", label: "Lead Phone" },
                { value: "lead.email", label: "Lead Email" },
                { value: "lead.city", label: "Lead City" },
                { value: "lead.status", label: "Lead Status" },
                { value: "call.sentiment", label: "Call Sentiment" },
                { value: "call.duration", label: "Call Duration" },
              ]}
            />
            <SelectField
              label="Operator"
              value={node.config.operator || "equals"}
              onChange={(v) => update("operator", v)}
              options={[
                { value: "equals", label: "= Equals" },
                { value: "not_equals", label: "≠ Not Equals" },
                { value: "contains", label: "Contains" },
                { value: "not_contains", label: "Does Not Contain" },
                { value: "greater_than", label: "> Greater Than" },
                { value: "less_than", label: "< Less Than" },
                { value: "is_empty", label: "Is Empty" },
                { value: "is_not_empty", label: "Is Not Empty" },
              ]}
            />
            <InputField
              label="Value"
              value={node.config.value || ""}
              onChange={(v) => update("value", v)}
              placeholder="Delhi"
            />
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px bg-gray-200 dark:bg-[#30363d]" />
              <div className="flex gap-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 font-bold border border-green-200 dark:border-green-500/20">YES</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-bold border border-red-200 dark:border-red-500/20">NO</span>
              </div>
              <div className="flex-1 h-px bg-gray-200 dark:bg-[#30363d]" />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-[#6e7681] text-center">Connect the YES and NO ports to different branches on the canvas</p>
          </div>
        );

      case "switch_router":
        return (
          <div className="space-y-3">
            <SelectField
              label="Routing Mode"
              value={node.config.mode || "rules"}
              onChange={(v) => update("mode", v)}
              options={[
                { value: "rules", label: "Rules-based (if/else chain)" },
                { value: "expression", label: "Expression (JS)" },
              ]}
            />
            {node.config.mode === "expression" ? (
              <InputField
                label="Expression (returns output index)"
                value={node.config.expression || ""}
                onChange={(v) => update("expression", v)}
                placeholder="{{$json.lead.score > 80 ? 0 : 1}}"
                monospace
                helperText="Should return a number: 0 = Output 0, 1 = Output 1, etc."
              />
            ) : (
              <SwitchRuleBuilder
                rules={node.config.rules || []}
                onChange={(rules) => update("rules", rules)}
              />
            )}
          </div>
        );

      case "merge_items":
        return (
          <div className="space-y-3">
            <SelectField
              label="Merge Mode"
              value={node.config.mode || "append"}
              onChange={(v) => update("mode", v)}
              options={[
                { value: "append", label: "Append — combine all items into one list" },
                { value: "merge_by_key", label: "Merge by Key — match items from branches" },
                { value: "multiplex", label: "Multiplex — all combinations" },
                { value: "wait_all", label: "Wait for All — wait for all branches to complete" },
              ]}
            />
            {node.config.mode === "merge_by_key" && (
              <InputField
                label="Merge Key Field"
                value={node.config.mergeKey || ""}
                onChange={(v) => update("mergeKey", v)}
                placeholder="lead.id"
                helperText="Field to use for matching items across branches"
              />
            )}
            <NumberField
              label="Number of Input Branches"
              value={node.config.inputCount || 2}
              onChange={(v) => update("inputCount", v)}
              min={2}
              max={10}
            />
          </div>
        );

      case "loop_items":
        return (
          <div className="space-y-3">
            <SelectField
              label="Loop Mode"
              value={node.config.mode || "items"}
              onChange={(v) => update("mode", v)}
              options={[
                { value: "items", label: "Loop Over Items — iterate each item individually" },
                { value: "batches", label: "Batch — process N items per run" },
              ]}
            />
            {node.config.mode === "batches" && (
              <NumberField
                label="Batch Size"
                value={node.config.batchSize || 10}
                onChange={(v) => update("batchSize", v)}
                min={1}
                max={100}
              />
            )}
            <InputField
              label="Items Expression"
              value={node.config.itemsExpression || ""}
              onChange={(v) => update("itemsExpression", v)}
              placeholder="{{$json.leads}}"
              helperText="Expression that returns the array to loop over"
              monospace
            />
          </div>
        );

      case "filter_by_tag":
        return (
          <div className="space-y-3">
            <InputField
              label="Tag Name"
              value={node.config.tagName || ""}
              onChange={(v) => update("tagName", v)}
              placeholder="vip-customer"
            />
            <SelectField
              label="Condition"
              value={node.config.hasTag ? "has" : "missing"}
              onChange={(v) => update("hasTag", v === "has")}
              options={[
                { value: "has", label: "Lead HAS this tag" },
                { value: "missing", label: "Lead MISSING this tag" },
              ]}
            />
          </div>
        );

      case "check_lead_field":
        return (
          <div className="space-y-3">
            <SelectField
              label="Field"
              value={node.config.field || "lead.name"}
              onChange={(v) => update("field", v)}
              options={[
                { value: "lead.name", label: "Lead Name" },
                { value: "lead.phone", label: "Lead Phone" },
                { value: "lead.email", label: "Lead Email" },
                { value: "lead.city", label: "Lead City" },
                { value: "lead.status", label: "Lead Status" },
              ]}
            />
            <SelectField
              label="Operator"
              value={node.config.operator || "is_not_empty"}
              onChange={(v) => update("operator", v)}
              options={[
                { value: "equals", label: "Equals" },
                { value: "not_equals", label: "Not Equals" },
                { value: "contains", label: "Contains" },
                { value: "not_contains", label: "Does Not Contain" },
                { value: "is_empty", label: "Is Empty" },
                { value: "is_not_empty", label: "Is Not Empty" },
              ]}
            />
            <InputField
              label="Value"
              value={node.config.value || ""}
              onChange={(v) => update("value", v)}
              placeholder="Enter value..."
            />
          </div>
        );

      case "check_call_count":
        return (
          <div className="space-y-3">
            <SelectField
              label="Operator"
              value={node.config.operator || "greater_than"}
              onChange={(v) => update("operator", v)}
              options={[
                { value: "greater_than", label: "Greater Than" },
                { value: "less_than", label: "Less Than" },
                { value: "equals", label: "Equals" },
              ]}
            />
            <NumberField
              label="Value"
              value={node.config.value || 1}
              onChange={(v) => update("value", v)}
              min={0}
            />
          </div>
        );

      case "check_sentiment":
        return (
          <SelectField
            label="Expected Sentiment"
            value={node.config.sentiment || "positive"}
            onChange={(v) => update("sentiment", v)}
            options={[
              { value: "positive", label: "Positive 😊" },
              { value: "negative", label: "Negative 😟" },
              { value: "neutral", label: "Neutral 😐" },
            ]}
          />
        );

      // ── Code & Advanced ───────────────────────────────────────
      case "code_node":
        return (
          <CodeNodeEditor
            code={node.config.code || ""}
            language={node.config.language || "javascript"}
            onChange={(v) => update("code", v)}
            onChangeLanguage={(v) => update("language", v)}
          />
        );

      case "sub_workflow":
        return (
          <div className="space-y-3">
            <InputField
              label="Workflow ID"
              value={node.config.workflowId || ""}
              onChange={(v) => update("workflowId", v)}
              placeholder="workflow_abc123"
              helperText="ID of the workflow to call"
            />
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">Options</label>
              <div className="space-y-1.5">
                {[
                  { key: "waitForCompletion", label: "Wait for sub-workflow to complete" },
                  { key: "passInputData", label: "Pass current data as input" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!node.config[key]}
                      onChange={(e) => update(key, e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#2f81f7] rounded"
                    />
                    <span className="text-xs text-gray-600 dark:text-[#c9d1d9] group-hover:text-gray-900 dark:group-hover:text-[#e6edf3]">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Messaging ─────────────────────────────────────────────
      case "send_gmail": {
        let connectedGmail = null;
        try {
          const creds = typeof window !== "undefined" ? localStorage.getItem("rapidx_credentials") : null;
          if (creds) {
            const parsed = JSON.parse(creds);
            connectedGmail = parsed.gmail?.email;
          }
        } catch (e) {}
        return (
          <div className="space-y-3">
            <div className={`p-2.5 rounded-lg border ${connectedGmail ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20" : "bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20"}`}>
              <p className={`text-[11px] font-medium flex items-center gap-1.5 ${connectedGmail ? "text-green-800 dark:text-green-300" : "text-yellow-800 dark:text-yellow-300"}`}>
                {connectedGmail ? (
                  <><Check className="w-3.5 h-3.5" /> Sending via: <span className="font-bold">{connectedGmail}</span></>
                ) : (
                  <><AlertCircle className="w-3.5 h-3.5" /> Account not configured. Connect Gmail in Integrations.</>
                )}
              </p>
            </div>
            <InputField label="To" value={node.config.to || ""} onChange={(v) => update("to", v)} placeholder="{{$json.lead.email}}" />
            <InputField label="CC (optional)" value={node.config.cc || ""} onChange={(v) => update("cc", v)} placeholder="manager@example.com" />
            <InputField label="BCC (optional)" value={node.config.bcc || ""} onChange={(v) => update("bcc", v)} placeholder="records@example.com" />
            <InputField label="Subject" value={node.config.subject || ""} onChange={(v) => update("subject", v)} placeholder="Welcome, {{$json.lead.name}}!" />
            <TextAreaField label="Body" value={node.config.body || ""} onChange={(v) => update("body", v)} placeholder={`Hi {{$json.lead.name}},\n\nThank you for reaching out...`} rows={7} />
          </div>
        );
      }

      case "send_whatsapp":
        return (
          <div className="space-y-3">
            <InputField label="Phone Number" value={node.config.phoneNumber || ""} onChange={(v) => update("phoneNumber", v)} placeholder="{{$json.lead.phone}}" />
            <InputField label="Template Name (optional)" value={node.config.templateName || ""} onChange={(v) => update("templateName", v)} placeholder="welcome_template" helperText="Use pre-approved WhatsApp templates for cold outreach" />
            <TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder={`Hi {{$json.lead.name}}, thanks for connecting!`} rows={5} />
            <InputField label="Media URL (optional)" value={node.config.mediaUrl || ""} onChange={(v) => update("mediaUrl", v)} placeholder="https://example.com/brochure.pdf" />
          </div>
        );

      case "send_sms":
        return (
          <div className="space-y-3">
            <InputField label="To" value={node.config.to || ""} onChange={(v) => update("to", v)} placeholder="{{$json.lead.phone}}" />
            <InputField label="From (Twilio number)" value={node.config.from || ""} onChange={(v) => update("from", v)} placeholder="+1415XXXXXXX" />
            <TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder={`Hi {{$json.lead.name}}, ...`} rows={4} />
          </div>
        );

      case "send_slack":
        return (
          <div className="space-y-3">
            <InputField label="Channel" value={node.config.channel || ""} onChange={(v) => update("channel", v)} placeholder="#leads-alerts or @username" />
            <InputField label="Bot Username (optional)" value={node.config.username || ""} onChange={(v) => update("username", v)} placeholder="LeadBot" />
            <TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder={`New lead: *{{$json.lead.name}}* from {{$json.lead.city}}`} rows={4} />
          </div>
        );

      case "send_telegram":
        return (
          <div className="space-y-3">
            <InputField label="Chat ID" value={node.config.chatId || ""} onChange={(v) => update("chatId", v)} placeholder="-100123456789" helperText="Group or user chat ID from BotFather" />
            <SelectField label="Parse Mode" value={node.config.parseMode || "Markdown"} onChange={(v) => update("parseMode", v)} options={[{ value: "Markdown", label: "Markdown" }, { value: "HTML", label: "HTML" }, { value: "None", label: "None" }]} />
            <TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder={`*New Lead*\nName: {{$json.lead.name}}`} rows={4} />
          </div>
        );

      case "send_instagram_dm":
        return (
          <div className="space-y-3">
            <InputField label="Recipient ID" value={node.config.recipientId || ""} onChange={(v) => update("recipientId", v)} placeholder="{{$json.lead.instagramId}}" helperText="Instagram user PSID from Business API" />
            <TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder={`Hi {{$json.lead.name}}, ...`} rows={4} />
          </div>
        );

      // ── CRM Actions ───────────────────────────────────────────
      case "update_lead_status":
        return (
          <SelectField
            label="New Status"
            value={node.config.newStatus || "Contacted"}
            onChange={(v) => update("newStatus", v)}
            options={[
              { value: "New", label: "New" },
              { value: "Contacted", label: "Contacted" },
              { value: "Qualified", label: "Qualified" },
              { value: "Interested", label: "Interested" },
              { value: "Converted", label: "Converted" },
              { value: "Lost", label: "Lost" },
            ]}
          />
        );

      case "add_tag":
      case "remove_tag":
        return (
          <InputField
            label="Tag Name"
            value={node.config.tagName || ""}
            onChange={(v) => update("tagName", v)}
            placeholder="vip-customer"
          />
        );

      case "trigger_outbound_call":
        return (
          <div className="space-y-3">
            <InputField label="Phone Number" value={node.config.phoneNumber || ""} onChange={(v) => update("phoneNumber", v)} placeholder="{{$json.lead.phone}}" />
            <TextAreaField label="Call Purpose / Script Hint" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder="Follow-up call to confirm appointment with {{$json.lead.name}}" rows={3} />
          </div>
        );

      case "add_note":
        return (
          <TextAreaField
            label="Note Text"
            value={node.config.noteText || ""}
            onChange={(v) => update("noteText", v)}
            placeholder="Lead captured via AI agent call on {{$now}}"
            rows={4}
          />
        );

      case "hubspot_create_contact":
        return (
          <div className="space-y-3">
            <SelectField label="Operation" value={node.config.operation || "create"} onChange={(v) => update("operation", v)} options={[{ value: "create", label: "Create Contact" }, { value: "update", label: "Update Contact" }, { value: "get", label: "Get Contact" }]} />
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20">
              <p className="text-xs text-orange-700 dark:text-orange-400">Properties auto-mapped: email → {"{{$json.lead.email}}"}, firstname → {"{{$json.lead.name}}"}, phone → {"{{$json.lead.phone}}"}</p>
            </div>
          </div>
        );

      case "salesforce_update":
        return (
          <div className="space-y-3">
            <SelectField label="Object Type" value={node.config.objectType || "Lead"} onChange={(v) => update("objectType", v)} options={[{ value: "Lead", label: "Lead" }, { value: "Contact", label: "Contact" }, { value: "Account", label: "Account" }, { value: "Opportunity", label: "Opportunity" }]} />
            <SelectField label="Operation" value={node.config.operation || "create"} onChange={(v) => update("operation", v)} options={[{ value: "create", label: "Create" }, { value: "update", label: "Update" }, { value: "upsert", label: "Upsert" }]} />
          </div>
        );

      // ── Productivity ──────────────────────────────────────────
      case "http_webhook":
        return (
          <div className="space-y-3">
            <InputField label="URL" value={node.config.url || ""} onChange={(v) => update("url", v)} placeholder="https://api.example.com/webhook" />
            <SelectField label="Method" value={node.config.method || "POST"} onChange={(v) => update("method", v)} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => ({ value: m, label: m }))} />
            <SelectField label="Authentication" value={node.config.authentication || "none"} onChange={(v) => update("authentication", v)} options={[{ value: "none", label: "None" }, { value: "bearer", label: "Bearer Token" }, { value: "basic", label: "Basic Auth" }, { value: "oauth2", label: "OAuth 2.0" }]} />
            {node.config.authentication === "bearer" && (
              <InputField label="Auth Token" value={node.config.authToken || ""} onChange={(v) => update("authToken", v)} placeholder="{{$credentials.myApi.token}}" monospace />
            )}
            <TextAreaField label="Request Body (JSON)" value={node.config.body || ""} onChange={(v) => update("body", v)} placeholder={'{"name": "{{$json.lead.name}}", "phone": "{{$json.lead.phone}}"}'} rows={5} monospace />
            <NumberField label="Timeout (ms)" value={node.config.timeout || 30000} onChange={(v) => update("timeout", v)} min={1000} max={300000} />
          </div>
        );

      case "send_to_sheets":
        return (
          <div className="space-y-3">
            <InputField label="Spreadsheet ID" value={node.config.spreadsheetId || ""} onChange={(v) => update("spreadsheetId", v)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
            <InputField label="Sheet Name" value={node.config.sheetName || ""} onChange={(v) => update("sheetName", v)} placeholder="Sheet1" />
            <SelectField label="Operation" value={node.config.operation || "append"} onChange={(v) => update("operation", v)} options={[{ value: "append", label: "Append Row" }, { value: "update", label: "Update Row" }, { value: "get", label: "Get Rows" }]} />
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20">
              <p className="text-xs text-green-700 dark:text-green-400">Lead data will be auto-mapped: Name, Phone, Email, City, Status, Timestamp</p>
            </div>
          </div>
        );

      case "create_calendar_event":
        return (
          <div className="space-y-3">
            <InputField label="Event Title" value={node.config.title || ""} onChange={(v) => update("title", v)} placeholder="Follow-up: {{$json.lead.name}}" />
            <TextAreaField label="Description" value={node.config.description || ""} onChange={(v) => update("description", v)} placeholder="Follow-up call with lead from {{$json.lead.city}}" rows={3} />
            <SelectField label="Meeting Type" value={node.config.meetingType || "google_meet"} onChange={(v) => update("meetingType", v)} options={[{ value: "google_meet", label: "Google Meet" }, { value: "zoom", label: "Zoom" }, { value: "in_person", label: "In Person" }]} />
            <NumberField label="Duration (minutes)" value={node.config.durationMinutes || 30} onChange={(v) => update("durationMinutes", v)} min={5} max={480} />
            <NumberField label="Schedule after (hours)" value={node.config.delayFromTrigger || 24} onChange={(v) => update("delayFromTrigger", v)} min={0} />
          </div>
        );

      case "airtable_row":
        return (
          <div className="space-y-3">
            <InputField label="Base ID" value={node.config.baseId || ""} onChange={(v) => update("baseId", v)} placeholder="appXXXXXXXXXXXXXX" />
            <InputField label="Table ID or Name" value={node.config.tableId || ""} onChange={(v) => update("tableId", v)} placeholder="tblXXXXXX or Leads" />
            <SelectField label="Operation" value={node.config.operation || "create"} onChange={(v) => update("operation", v)} options={[{ value: "create", label: "Create Record" }, { value: "update", label: "Update Record" }, { value: "list", label: "List Records" }]} />
          </div>
        );

      case "notion_page":
        return (
          <div className="space-y-3">
            <InputField label="Database ID" value={node.config.databaseId || ""} onChange={(v) => update("databaseId", v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            <SelectField label="Operation" value={node.config.operation || "create"} onChange={(v) => update("operation", v)} options={[{ value: "create", label: "Create Page" }, { value: "update", label: "Update Page" }]} />
          </div>
        );

      case "send_notification":
        return (
          <div className="space-y-3">
            <SelectField label="Channel" value={node.config.channel || "in_app"} onChange={(v) => update("channel", v)} options={[{ value: "in_app", label: "In-App Notification" }, { value: "email", label: "Email" }, { value: "both", label: "Both" }]} />
            <InputField label="Recipient (email)" value={node.config.recipient || ""} onChange={(v) => update("recipient", v)} placeholder="team@example.com" />
            <TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder="New lead {{$json.lead.name}} from {{$json.lead.city}}" rows={3} />
          </div>
        );

      case "wait_delay":
        return (
          <div className="space-y-3">
            <NumberField label="Duration" value={node.config.duration || 1} onChange={(v) => update("duration", v)} min={1} />
            <SelectField label="Unit" value={node.config.unit || "hours"} onChange={(v) => update("unit", v)} options={[{ value: "seconds", label: "Seconds" }, { value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" }]} />
          </div>
        );

      case "sticky_note":
        return (
          <div className="space-y-3">
            <TextAreaField label="Note Content" value={node.config.content || ""} onChange={(v) => update("content", v)} placeholder="Add context, reminders, or documentation here..." rows={5} />
            <SelectField label="Color" value={node.config.color || "yellow"} onChange={(v) => update("color", v)} options={[{ value: "yellow", label: "🟡 Yellow" }, { value: "blue", label: "🔵 Blue" }, { value: "green", label: "🟢 Green" }, { value: "pink", label: "🩷 Pink" }, { value: "orange", label: "🟠 Orange" }]} />
          </div>
        );

      case "read_csv_leads":
        return (
          <div className="space-y-3">
            <CsvUploader 
              value={node.config.filePath || ""}
              onChange={(v) => update("filePath", v)}
            />
            <div className="text-center text-xs text-gray-400 dark:text-[#8b949e] font-mono my-1">- OR -</div>
            <InputField 
              label="Manual CSV Path (Advanced)" 
              value={node.config.filePath || ""} 
              onChange={(v) => update("filePath", v)} 
              placeholder="../data/leads.csv" 
            />
            <NumberField 
              label="Row Limit (0 for no limit)" 
              value={node.config.limit || 0} 
              onChange={(v) => update("limit", v)} 
              min={0} 
            />
          </div>
        );

      default:
        return (
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d]">
            <p className="text-xs text-gray-500 dark:text-[#8b949e]">No configuration options for this node type.</p>
          </div>
        );
    }
  };

  // ── Execution Tab ───────────────────────────────────────────────────────────
  const renderExecutionTab = () => {
    if (!executionData) return null;
    const durationMs = executionData.finishedAt
      ? new Date(executionData.finishedAt).getTime() - new Date(executionData.startedAt).getTime()
      : 0;

    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d]">
          <div>
            <div className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">Execution Result</div>
            <div className="text-[10px] text-gray-400 dark:text-[#6e7681] mt-0.5">
              Ran at {new Date(executionData.startedAt).toLocaleTimeString()} · {durationMs}ms
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${
            executionData.status === "success"
              ? "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20"
              : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20"
          }`}>
            {executionData.status === "success" ? "✓ SUCCESS" : "✗ ERROR"}
          </span>
        </div>

        {/* Error detail */}
        {executionData.status === "error" && executionData.error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400 font-mono">{executionData.error}</p>
          </div>
        )}

        {/* Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500 dark:text-[#8b949e]">INPUT</label>
            <button
              onClick={() => copyJson(executionData.input)}
              className="text-[9px] text-gray-400 hover:text-[#2f81f7] flex items-center gap-1 transition-colors"
            >
              {copiedJson ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedJson ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="p-3 bg-gray-50 dark:bg-[#0d1117] rounded-lg text-xs font-mono overflow-auto border border-gray-200 dark:border-[#30363d] max-h-52 text-gray-800 dark:text-[#c9d1d9] leading-relaxed">
            <code>{JSON.stringify(executionData.input, null, 2)}</code>
          </pre>
        </div>

        {/* Output */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-500 dark:text-[#8b949e]">OUTPUT</label>
            <button
              onClick={() => copyJson(executionData.output)}
              className="text-[9px] text-gray-400 hover:text-[#2f81f7] flex items-center gap-1 transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
          <pre className="p-3 bg-gray-50 dark:bg-[#0d1117] rounded-lg text-xs font-mono overflow-auto border border-gray-200 dark:border-[#30363d] max-h-52 text-gray-800 dark:text-[#c9d1d9] leading-relaxed">
            <code>{JSON.stringify(executionData.output, null, 2)}</code>
          </pre>
        </div>

        {/* Data Pinning */}
        <div className="h-px bg-gray-200 dark:bg-[#30363d]" />
        <DataPinningSection
          pinnedData={node.config._pinnedData}
          onPin={pinData}
          onUnpin={unpinData}
          executionData={executionData}
        />
      </div>
    );
  };

  // ── Settings Tab ────────────────────────────────────────────────────────────
  const renderSettingsTab = () => (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9] flex items-center gap-1.5">
          Node Options
        </label>
        <div className="space-y-1.5">
          {[
            { key: "disabled", label: "Disable this node", desc: "Node is skipped during execution" },
          ].map(({ key, label, desc }) => (
            <label key={key} className="flex items-start gap-2 cursor-pointer p-2.5 rounded-lg border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
              <input
                type="checkbox"
                checked={!!(node as any)[key]}
                onChange={(e) => onUpdate(node.id, node.config, undefined)}
                className="w-3.5 h-3.5 accent-[#2f81f7] rounded mt-0.5"
              />
              <div>
                <div className="text-xs font-medium text-gray-800 dark:text-[#e6edf3]">{label}</div>
                <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Error Handling (n8n-pattern) */}
      {node.category === "action" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9] flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" /> Error Handling
          </label>
          <div className="space-y-1.5">
            <label className="flex items-start gap-2 cursor-pointer p-2.5 rounded-lg border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
              <input
                type="checkbox"
                checked={!!node.continueOnFail}
                onChange={(e) => onUpdate(node.id, node.config, undefined, { continueOnFail: e.target.checked })}
                className="w-3.5 h-3.5 accent-[#f59e0b] rounded mt-0.5"
              />
              <div>
                <div className="text-xs font-medium text-gray-800 dark:text-[#e6edf3]">Continue On Fail</div>
                <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">If this node fails, continue the workflow instead of stopping</div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer p-2.5 rounded-lg border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
              <input
                type="checkbox"
                checked={!!node.retryOnFail}
                onChange={(e) => {
                  const retryCount = node.retryCount || 3;
                  const retryIntervalMs = node.retryIntervalMs || 1000;
                  onUpdate(node.id, node.config, undefined, { retryOnFail: e.target.checked, retryCount, retryIntervalMs });
                }}
                className="w-3.5 h-3.5 accent-[#f59e0b] rounded mt-0.5"
              />
              <div>
                <div className="text-xs font-medium text-gray-800 dark:text-[#e6edf3]">Retry On Fail</div>
                <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Automatically retry this node when it fails</div>
              </div>
            </label>
          </div>
          {node.retryOnFail && (
            <div className="grid grid-cols-2 gap-2 pl-6">
              <div>
                <label className="text-[10px] font-medium text-[#8b949e]">Retries</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={node.retryCount || 3}
                  onChange={(e) => onUpdate(node.id, node.config, undefined, { retryCount: parseInt(e.target.value) || 3 })}
                  className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[#8b949e]">Delay (ms)</label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={node.retryIntervalMs || 1000}
                  onChange={(e) => onUpdate(node.id, node.config, undefined, { retryIntervalMs: parseInt(e.target.value) || 1000 })}
                  className="w-full px-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Node notes */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">Node Notes</label>
        <textarea
          value={(node as any).notes || ""}
          onChange={() => {}}
          placeholder="Add internal notes for this node (only visible in the editor)..."
          rows={4}
          className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-[#30363d]
            bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3]
            placeholder-gray-400 dark:placeholder-[#484f58]
            focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all resize-none"
        />
      </div>
    </div>
  );

  
  const prevEdges = edges?.filter((e: any) => e.target === node?.id || e.targetId === node?.id) || [];
  const prevNodes = prevEdges.map((e: any) => ({
    node: nodes?.find((n: WorkflowNode) => n.id === (e.source || e.sourceId)),
    edge: e
  })).filter((n: any) => n.node) as { node: WorkflowNode, edge: any }[];

  const nextEdges = edges?.filter((e: any) => e.source === node?.id || e.sourceId === node?.id) || [];
  const nextNodes = nextEdges.map((e: any) => ({
    node: nodes?.find((n: WorkflowNode) => n.id === (e.target || e.targetId)),
    edge: e
  })).filter((n: any) => n.node) as { node: WorkflowNode, edge: any }[];

  return (
    <DragCtx.Provider value={{ draggedPath, setDraggedPath }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
        <div 
          onClick={e => e.stopPropagation()}
          className="w-full max-w-7xl h-[90vh] bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-xl flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Top Header */}
          <div className="p-3 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between bg-white dark:bg-[#161b22] flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <div className="text-sm font-semibold text-gray-900 dark:text-[#e6edf3]">{node.label}</div>
              <div className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[#30363d] text-[#8b949e]">
                {node.type.toUpperCase()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-[#30363d] overflow-hidden">
                <button className="px-3 py-1.5 text-xs font-medium text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors flex items-center gap-1 border-r border-[#30363d]">
                  <ChevronDown className="w-3.5 h-3.5 rotate-90" /> Prev
                </button>
                <button className="px-3 py-1.5 text-xs font-medium text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors flex items-center gap-1">
                  Next <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                </button>
              </div>
              <div className="w-px h-4 bg-[#30363d] mx-1" />
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Back to Canvas
              </button>
            </div>
          </div>

          {/* Three Columns Grid */}
          <div className="flex-1 flex min-h-0">
            
            {/* LEFT COLUMN: INPUT */}
            <div className="w-[30%] flex flex-col border-r border-[#30363d] bg-[#0d1117]">
              <div className="p-3 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#2f81f7]" />
                  <span className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Input</span>
                </div>
                <button onClick={() => copyJson(executionData?.input)} className="text-[10px] text-[#8b949e] hover:text-[#e6edf3] flex items-center gap-1 bg-[#21262d] px-2 py-1 rounded border border-[#30363d] transition-colors">
                  {copiedJson ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  Copy
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DataViewTabs
                  data={executionData?.input || null}
                  defaultMsg="No input data yet. Execute the workflow to see incoming data."
                  nodeOutputMap={nodeOutputMap}
                  currentNodeId={node.id}
                />
              </div>
              <div className="h-40 border-t border-[#30363d] bg-[#161b22] flex flex-col p-3">
                <div className="text-[10px] font-bold text-[#2f81f7] uppercase mb-3 flex items-center gap-1.5">
                  ? Previous Nodes
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between p-2 rounded border border-[#30363d] bg-[#0d1117] group cursor-pointer hover:border-gray-500 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs font-medium text-[#e6edf3]">New Lead Captured</span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-[#8b949e] rotate-90 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </div>
            </div>

            {/* MIDDLE COLUMN: PARAMETERS & SETTINGS */}
            <div className="w-[40%] flex flex-col border-r border-[#30363d] bg-[#0d1117]">
              {/* Tab Bar */}
              <div className="flex border-b border-[#30363d] bg-[#161b22] flex-shrink-0 items-center">
                {(["config", "settings"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-3 text-[11px] font-bold text-center transition-all capitalize relative ${
                      activeTab === tab
                        ? "text-[#e6edf3]"
                        : "text-[#8b949e] hover:text-[#c9d1d9]"
                    }`}
                  >
                    {tab === "config" ? "Parameters" : "Settings"}
                    {activeTab === tab && (
                      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#2f81f7]" />
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                {onTestStep && (
                  <button
                    onClick={() => onTestStep(node.id)}
                    disabled={isTestingStep}
                    className="flex items-center gap-1.5 mr-3 px-3 py-1.5 rounded-md bg-orange-500 hover:bg-orange-400 text-white text-[11px] font-bold transition-colors disabled:opacity-50"
                  >
                    {isTestingStep ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                    Execute step
                  </button>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {activeTab === "settings" ? (
                  renderSettingsTab()
                ) : (
                  <>
                    <InputField label="Node Label" value={node.label} onChange={updateLabel} placeholder="Enter a custom label..." />
                    
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Configuration</h4>
                      {renderConfigFields()}
                    </div>

                    <div className="pt-4 border-t border-[#30363d]">
                      <h4 className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <PinOff className="w-3.5 h-3.5" /> Data Pinning
                      </h4>
                      <p className="text-[10px] text-[#8b949e]">
                        Run the workflow once to pin output data for repeatable testing.
                      </p>
                      <div className="mt-3">
                        <DataPinningSection
                          pinnedData={node.config._pinnedData}
                          onPin={pinData}
                          onUnpin={unpinData}
                          executionData={executionData}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: OUTPUT */}
            <div className="w-[30%] flex flex-col bg-[#0d1117]">
              <div className="p-3 border-b border-[#30363d] flex items-center justify-between bg-[#161b22]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Output</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DataViewTabs
                  data={executionData?.output || null}
                  defaultMsg="No output data yet."
                  onExecute={onTestStep ? () => onTestStep(node.id) : undefined}
                  isRunning={isTestingStep}
                />
              </div>
              <div className="h-40 border-t border-[#30363d] bg-[#161b22] flex flex-col p-3">
                <div className="text-[10px] font-bold text-[#2f81f7] uppercase mb-3 flex items-center gap-1.5">
                  ? Next Nodes
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  <div className="flex items-center justify-between p-2 rounded border border-[#30363d] bg-[#0d1117] group cursor-pointer hover:border-gray-500 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs font-medium text-[#e6edf3]">Request Phone Email</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">No</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8b949e] -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded border border-[#30363d] bg-[#0d1117] group cursor-pointer hover:border-gray-500 transition-colors">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#2f81f7]" />
                      <span className="text-xs font-medium text-[#e6edf3]">AI Discovery Call</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">Yes</span>
                      <ChevronDown className="w-3.5 h-3.5 text-[#8b949e] -rotate-90 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </DragCtx.Provider>
  );
}
