"use client";

import React, { useState, useCallback, useEffect } from "react";
import { X, ChevronDown, ChevronRight, Zap, Loader2, Copy, Check, Pin, PinOff, Edit2, Save, AlertCircle } from "lucide-react";
import type { WorkflowNode } from "@/lib/workflow-types";
import { getNodeMetadata } from "@/lib/workflow-types";

// ── Reusable Form Components ────────────────────────────────────────────────

function InputField({ label, value, onChange, placeholder, type = "text", helperText, monospace }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; helperText?: string; monospace?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">{label}</label>
      <input
        type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all ${monospace ? "font-mono" : ""}`}
      />
      {helperText && <p className="text-[9px] text-gray-400 dark:text-[#6e7681]">{helperText}</p>}
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows = 3, monospace }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; rows?: number; monospace?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">{label}</label>
      <textarea
        value={value || ""} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} rows={rows}
        className={`w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all resize-none ${monospace ? "font-mono" : ""}`}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options, helperText }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; helperText?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">{label}</label>
      <select
        value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {helperText && <p className="text-[9px] text-gray-400 dark:text-[#6e7681]">{helperText}</p>}
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0, max }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">{label}</label>
      <input
        type="number" value={value || 0} onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        min={min} max={max}
        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] transition-all"
      />
    </div>
  );
}

// ── Config Fields by Node Type ──────────────────────────────────────────────

function ConfigFields({ node, onUpdate }: { node: WorkflowNode; onUpdate: (id: string, config: Record<string, any>, label?: string) => void }) {
  const update = (key: string, value: any) => onUpdate(node.id, { ...node.config, [key]: value });

  switch (node.type as string) {
    case "manual_trigger":
      return <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"><p className="text-[11px] text-green-700 dark:text-green-400">🚀 Fires when you click Run Manually.</p></div>;
    case "error_trigger":
      return <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"><p className="text-[11px] text-red-700 dark:text-red-400">⚠️ Fires when another workflow fails.</p></div>;
    case "new_lead":
      return <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20"><p className="text-[11px] text-green-700 dark:text-green-400">Fires when a new lead is captured.</p></div>;
    case "call_completed":
      return <SelectField label="Call Direction" value={node.config.callDirection || "any"} onChange={(v) => update("callDirection", v)} options={[{ value: "any", label: "Any" }, { value: "inbound", label: "Inbound" }, { value: "outbound", label: "Outbound" }]} />;
    case "scheduled":
      return (<div className="space-y-2"><InputField label="Cron" value={node.config.cronExpression || ""} onChange={(v) => update("cronExpression", v)} placeholder="0 9 * * *" monospace /><InputField label="Description" value={node.config.scheduleDescription || ""} onChange={(v) => update("scheduleDescription", v)} placeholder="Every day at 9 AM" /></div>);
    case "webhook_received":
      return <InputField label="Path" value={node.config.webhookPath || ""} onChange={(v) => update("webhookPath", v)} placeholder="/api/webhook/custom" monospace />;
    case "lead_status_changed":
      return (<div className="space-y-2"><SelectField label="From" value={node.config.fromStatus || "any"} onChange={(v) => update("fromStatus", v)} options={[{ value: "any", label: "Any" }, { value: "New", label: "New" }, { value: "Contacted", label: "Contacted" }, { value: "Qualified", label: "Qualified" }]} /><SelectField label="To" value={node.config.toStatus || "any"} onChange={(v) => update("toStatus", v)} options={[{ value: "any", label: "Any" }, { value: "New", label: "New" }, { value: "Contacted", label: "Contacted" }, { value: "Qualified", label: "Qualified" }]} /></div>);
    case "form_submitted":
      return <InputField label="Form ID" value={node.config.formId || ""} onChange={(v) => update("formId", v)} placeholder="contact-form-1" />;
    case "lead_tag_added":
      return <InputField label="Tag" value={node.config.tagName || ""} onChange={(v) => update("tagName", v)} placeholder="vip-customer" />;
    case "sentiment_detected":
      return <SelectField label="Sentiment" value={node.config.sentimentType || "positive"} onChange={(v) => update("sentimentType", v)} options={[{ value: "positive", label: "Positive 😊" }, { value: "negative", label: "Negative 😟" }, { value: "neutral", label: "Neutral 😐" }]} />;

    // Flow Control
    case "if_else":
      return (<div className="space-y-2"><SelectField label="Field" value={node.config.field || "lead.city"} onChange={(v) => update("field", v)} options={[{ value: "lead.name", label: "Lead Name" }, { value: "lead.email", label: "Lead Email" }, { value: "lead.city", label: "Lead City" }, { value: "lead.status", label: "Lead Status" }, { value: "call.sentiment", label: "Call Sentiment" }]} /><SelectField label="Operator" value={node.config.operator || "equals"} onChange={(v) => update("operator", v)} options={[{ value: "equals", label: "= Equals" }, { value: "not_equals", label: "≠ Not Equals" }, { value: "contains", label: "Contains" }, { value: "greater_than", label: "> Greater" }, { value: "less_than", label: "< Less" }, { value: "is_empty", label: "Is Empty" }, { value: "is_not_empty", label: "Not Empty" }]} /><InputField label="Value" value={node.config.value || ""} onChange={(v) => update("value", v)} placeholder="Delhi" /><div className="flex justify-center gap-2 pt-1"><span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 font-bold">YES</span><span className="text-[9px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-bold">NO</span></div></div>);
    case "check_lead_field":
      return (<div className="space-y-2"><SelectField label="Field" value={node.config.field || "lead.name"} onChange={(v) => update("field", v)} options={[{ value: "lead.name", label: "Name" }, { value: "lead.email", label: "Email" }, { value: "lead.city", label: "City" }, { value: "lead.status", label: "Status" }]} /><SelectField label="Operator" value={node.config.operator || "is_not_empty"} onChange={(v) => update("operator", v)} options={[{ value: "equals", label: "Equals" }, { value: "not_equals", label: "Not Equals" }, { value: "contains", label: "Contains" }, { value: "is_empty", label: "Is Empty" }, { value: "is_not_empty", label: "Not Empty" }]} /><InputField label="Value" value={node.config.value || ""} onChange={(v) => update("value", v)} placeholder="..." /></div>);
    case "check_call_count":
      return (<div className="space-y-2"><SelectField label="Operator" value={node.config.operator || "greater_than"} onChange={(v) => update("operator", v)} options={[{ value: "greater_than", label: "Greater Than" }, { value: "less_than", label: "Less Than" }, { value: "equals", label: "Equals" }]} /><NumberField label="Value" value={node.config.value || 1} onChange={(v) => update("value", v)} min={0} /></div>);
    case "check_sentiment":
      return <SelectField label="Sentiment" value={node.config.sentiment || "positive"} onChange={(v) => update("sentiment", v)} options={[{ value: "positive", label: "Positive 😊" }, { value: "negative", label: "Negative 😟" }, { value: "neutral", label: "Neutral 😐" }]} />;
    case "filter_by_tag":
      return (<div className="space-y-2"><InputField label="Tag" value={node.config.tagName || ""} onChange={(v) => update("tagName", v)} placeholder="vip-customer" /><SelectField label="Condition" value={node.config.hasTag ? "has" : "missing"} onChange={(v) => update("hasTag", v === "has")} options={[{ value: "has", label: "Has tag" }, { value: "missing", label: "Missing tag" }]} /></div>);
    case "switch_router":
      return (<div className="space-y-2"><SelectField label="Mode" value={node.config.mode || "rules"} onChange={(v) => update("mode", v)} options={[{ value: "rules", label: "Rules" }, { value: "expression", label: "Expression" }]} />{node.config.mode === "expression" ? <InputField label="Expression" value={node.config.expression || ""} onChange={(v) => update("expression", v)} placeholder="{{$json.lead.score > 80 ? 0 : 1}}" monospace /> : <p className="text-[10px] text-[#8b949e]"> {(node.config.rules || []).length} routing rules configured</p>}</div>);
    case "loop_items":
      return (<div className="space-y-2"><SelectField label="Mode" value={node.config.mode || "items"} onChange={(v) => update("mode", v)} options={[{ value: "items", label: "Loop Items" }, { value: "batches", label: "Batch" }]} />{node.config.mode === "batches" && <NumberField label="Batch Size" value={node.config.batchSize || 10} onChange={(v) => update("batchSize", v)} min={1} max={100} />}<InputField label="Items Expression" value={node.config.itemsExpression || ""} onChange={(v) => update("itemsExpression", v)} placeholder="{{$json.leads}}" monospace /></div>);
    case "merge_items":
      return (<div className="space-y-2"><SelectField label="Mode" value={node.config.mode || "append"} onChange={(v) => update("mode", v)} options={[{ value: "append", label: "Append" }, { value: "merge_by_key", label: "Merge by Key" }, { value: "wait_all", label: "Wait for All" }]} /><NumberField label="Input Branches" value={node.config.inputCount || 2} onChange={(v) => update("inputCount", v)} min={2} max={10} /></div>);

    // Code
    case "code_node":
      return (<div className="space-y-2"><SelectField label="Language" value={node.config.language || "javascript"} onChange={(v) => update("language", v)} options={[{ value: "javascript", label: "JavaScript" }]} /><div className="space-y-1"><label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">Code</label><textarea value={node.config.code || ""} onChange={(e) => update("code", e.target.value)} rows={8} className="w-full px-2.5 py-1.5 text-[11px] font-mono rounded-lg border border-[#7c3aed]/30 bg-[#1e1033] text-[#c9d1d9] focus:outline-none resize-none leading-relaxed" placeholder="// Write code..." /></div></div>);
    case "sub_workflow":
      return (<div className="space-y-2"><InputField label="Workflow ID" value={node.config.workflowId || ""} onChange={(v) => update("workflowId", v)} placeholder="workflow_abc123" /><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!node.config.waitForCompletion} onChange={(e) => update("waitForCompletion", e.target.checked)} className="w-3.5 h-3.5 accent-[#2f81f7] rounded" /><span className="text-[11px] text-gray-600 dark:text-[#c9d1d9]">Wait for completion</span></label></div>);

    // Messaging
    case "send_gmail":
      return (<div className="space-y-2"><InputField label="To" value={node.config.to || ""} onChange={(v) => update("to", v)} placeholder="{{$json.lead.email}}" /><InputField label="Subject" value={node.config.subject || ""} onChange={(v) => update("subject", v)} placeholder="Welcome, {{$json.lead.name}}!" /><TextAreaField label="Body" value={node.config.body || ""} onChange={(v) => update("body", v)} placeholder="Hi {{$json.lead.name}}..." rows={5} /></div>);
    case "send_whatsapp":
      return (<div className="space-y-2"><InputField label="Phone" value={node.config.phoneNumber || ""} onChange={(v) => update("phoneNumber", v)} placeholder="{{$json.lead.phone}}" /><TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} placeholder="Hi {{$json.lead.name}}..." rows={4} /></div>);
    case "send_sms":
      return (<div className="space-y-2"><InputField label="To" value={node.config.to || ""} onChange={(v) => update("to", v)} placeholder="{{$json.lead.phone}}" /><TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} rows={3} /></div>);
    case "send_slack":
      return (<div className="space-y-2"><InputField label="Channel" value={node.config.channel || ""} onChange={(v) => update("channel", v)} placeholder="#leads-alerts" /><TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} rows={3} /></div>);
    case "send_telegram":
      return (<div className="space-y-2"><InputField label="Chat ID" value={node.config.chatId || ""} onChange={(v) => update("chatId", v)} placeholder="-100123456789" /><TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} rows={3} /></div>);
    case "send_instagram_dm":
      return (<div className="space-y-2"><InputField label="Recipient ID" value={node.config.recipientId || ""} onChange={(v) => update("recipientId", v)} /><TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} rows={3} /></div>);

    // CRM
    case "update_lead_status":
      return <SelectField label="Status" value={node.config.newStatus || "Contacted"} onChange={(v) => update("newStatus", v)} options={[{ value: "New", label: "New" }, { value: "Contacted", label: "Contacted" }, { value: "Qualified", label: "Qualified" }, { value: "Interested", label: "Interested" }, { value: "Converted", label: "Converted" }, { value: "Lost", label: "Lost" }]} />;
    case "add_tag": case "remove_tag":
      return <InputField label="Tag" value={node.config.tagName || ""} onChange={(v) => update("tagName", v)} placeholder="vip-customer" />;
    case "trigger_outbound_call":
      return (<div className="space-y-2"><InputField label="Phone" value={node.config.phoneNumber || ""} onChange={(v) => update("phoneNumber", v)} placeholder="{{$json.lead.phone}}" /><TextAreaField label="Purpose" value={node.config.message || ""} onChange={(v) => update("message", v)} rows={2} /></div>);
    case "add_note":
      return <TextAreaField label="Note" value={node.config.noteText || ""} onChange={(v) => update("noteText", v)} rows={3} />;
    case "hubspot_create_contact":
      return <SelectField label="Operation" value={node.config.operation || "create"} onChange={(v) => update("operation", v)} options={[{ value: "create", label: "Create" }, { value: "update", label: "Update" }]} />;
    case "salesforce_update":
      return (<div className="space-y-2"><SelectField label="Object" value={node.config.objectType || "Lead"} onChange={(v) => update("objectType", v)} options={[{ value: "Lead", label: "Lead" }, { value: "Contact", label: "Contact" }]} /><SelectField label="Operation" value={node.config.operation || "create"} onChange={(v) => update("operation", v)} options={[{ value: "create", label: "Create" }, { value: "update", label: "Update" }]} /></div>);

    // Productivity
    case "http_webhook":
      return (<div className="space-y-2"><InputField label="URL" value={node.config.url || ""} onChange={(v) => update("url", v)} placeholder="https://api.example.com" /><SelectField label="Method" value={node.config.method || "POST"} onChange={(v) => update("method", v)} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => ({ value: m, label: m }))} /><TextAreaField label="Body" value={node.config.body || ""} onChange={(v) => update("body", v)} rows={3} monospace /></div>);
    case "send_to_sheets":
      return (<div className="space-y-2"><InputField label="Spreadsheet ID" value={node.config.spreadsheetId || ""} onChange={(v) => update("spreadsheetId", v)} /><InputField label="Sheet" value={node.config.sheetName || ""} onChange={(v) => update("sheetName", v)} placeholder="Sheet1" /></div>);
    case "create_calendar_event":
      return (<div className="space-y-2"><InputField label="Title" value={node.config.title || ""} onChange={(v) => update("title", v)} placeholder="Follow-up" /><NumberField label="Duration (min)" value={node.config.durationMinutes || 30} onChange={(v) => update("durationMinutes", v)} min={5} /></div>);
    case "airtable_row":
      return (<div className="space-y-2"><InputField label="Base ID" value={node.config.baseId || ""} onChange={(v) => update("baseId", v)} placeholder="appXXX" /><InputField label="Table" value={node.config.tableId || ""} onChange={(v) => update("tableId", v)} /></div>);
    case "notion_page":
      return <InputField label="Database ID" value={node.config.databaseId || ""} onChange={(v) => update("databaseId", v)} />;
    case "send_notification":
      return (<div className="space-y-2"><SelectField label="Channel" value={node.config.channel || "in_app"} onChange={(v) => update("channel", v)} options={[{ value: "in_app", label: "In-App" }, { value: "email", label: "Email" }, { value: "both", label: "Both" }]} /><TextAreaField label="Message" value={node.config.message || ""} onChange={(v) => update("message", v)} rows={2} /></div>);
    case "wait_delay":
      return (<div className="space-y-2"><NumberField label="Duration" value={node.config.duration || 1} onChange={(v) => update("duration", v)} min={1} /><SelectField label="Unit" value={node.config.unit || "hours"} onChange={(v) => update("unit", v)} options={[{ value: "seconds", label: "Seconds" }, { value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }, { value: "days", label: "Days" }]} /></div>);
    case "sticky_note":
      return (<div className="space-y-2"><TextAreaField label="Content" value={node.config.content || ""} onChange={(v) => update("content", v)} rows={4} /><SelectField label="Color" value={node.config.color || "yellow"} onChange={(v) => update("color", v)} options={[{ value: "yellow", label: "🟡 Yellow" }, { value: "blue", label: "🔵 Blue" }, { value: "green", label: "🟢 Green" }, { value: "pink", label: "🩷 Pink" }]} /></div>);
    case "read_csv_leads":
      return <InputField label="File Path" value={node.config.filePath || ""} onChange={(v) => update("filePath", v)} placeholder="../data/leads.csv" monospace />;

    default:
      return <p className="text-[11px] text-[#8b949e]">No configuration for this node type.</p>;
  }
}

// ── Main Side Panel ─────────────────────────────────────────────────────────

interface Props {
  node: WorkflowNode | null;
  onClose: () => void;
  onUpdate: (id: string, config: Record<string, any>, label?: string) => void;
  executionData?: any;
  onTestStep?: (nodeId: string) => Promise<void>;
  isTestingStep?: boolean;
}

export default function NodeConfigPanel({ node, onClose, onUpdate, executionData, onTestStep, isTestingStep }: Props) {
  const [activeTab, setActiveTab] = useState<"params" | "settings">("params");
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    setActiveTab("params");
  }, [node?.id]);

  if (!node) return null;

  const meta = getNodeMetadata(node.type);
  const color = meta?.color || "#8b949e";

  const updateLabel = (label: string) => onUpdate(node.id, node.config, label);

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="w-[380px] bg-white dark:bg-[#161b22] border-l border-gray-200 dark:border-[#30363d] h-full flex flex-col overflow-hidden flex-shrink-0 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <input
            type="text"
            value={node.label}
            onChange={(e) => updateLabel(e.target.value)}
            className="text-sm font-semibold text-gray-900 dark:text-[#e6edf3] bg-transparent border-none outline-none focus:ring-0 min-w-0 flex-1 truncate"
          />
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#30363d] text-gray-400 dark:text-[#8b949e] flex-shrink-0">
            {node.type}
          </span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-[#30363d] flex-shrink-0">
        {(["params", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2.5 text-[11px] font-bold text-center transition-all capitalize relative ${
              activeTab === tab ? "text-gray-900 dark:text-[#e6edf3]" : "text-gray-400 dark:text-[#8b949e] hover:text-gray-600 dark:hover:text-[#c9d1d9]"
            }`}
          >
            {tab === "params" ? "Parameters" : "Settings"}
            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#2f81f7]" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === "params" ? (
          <>
            <InputField label="Node Label" value={node.label} onChange={updateLabel} placeholder="Enter label..." />
            <div className="h-px bg-gray-200 dark:bg-[#30363d]" />
            <ConfigFields node={node} onUpdate={onUpdate} />
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">Options</label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
                <input type="checkbox" checked={!!node.disabled} onChange={() => onUpdate(node.id, node.config, undefined)} className="w-3.5 h-3.5 accent-[#2f81f7] rounded" />
                <div>
                  <div className="text-[11px] font-medium text-gray-800 dark:text-[#e6edf3]">Disable node</div>
                  <div className="text-[9px] text-gray-400 dark:text-[#6e7681]">Skip during execution</div>
                </div>
              </label>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-600 dark:text-[#8b949e]">Notes</label>
              <textarea
                value={node.notes || ""}
                onChange={() => {}}
                placeholder="Internal notes..."
                rows={3}
                className="w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/40 transition-all resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Execute button */}
      {onTestStep && (
        <div className="p-3 border-t border-gray-200 dark:border-[#30363d] flex-shrink-0">
          <button
            onClick={() => onTestStep(node.id)}
            disabled={isTestingStep}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isTestingStep ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Execute Step
          </button>
        </div>
      )}

      {/* Execution data */}
      {executionData && (
        <div className="border-t border-gray-200 dark:border-[#30363d] flex-shrink-0 max-h-[200px] overflow-y-auto">
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 dark:text-[#8b949e] uppercase">Last Output</span>
              <button onClick={() => copyJson(executionData.output)} className="text-[9px] text-gray-400 hover:text-[#2f81f7] flex items-center gap-1">
                {copiedJson ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedJson ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="text-[10px] font-mono text-gray-600 dark:text-[#c9d1d9] overflow-auto max-h-32 leading-relaxed">
              {JSON.stringify(executionData.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
