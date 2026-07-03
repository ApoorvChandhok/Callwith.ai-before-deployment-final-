"use client";

import React, { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Save, Play, Pause, PanelLeftClose, PanelLeft, History,
  Trash2, Loader2, Sparkles, X, Download, Upload, Settings2, CheckCircle2,
  Undo2, Redo2, AlignCenter,
} from "lucide-react";
import type { WorkflowNode, WorkflowEdge, NodeMetadata } from "@/lib/workflow-types";
import { getWorkflow, createWorkflow, updateWorkflow } from "@/lib/workflow-actions";
import { resolveConfigTemplates, resolveExpression, evaluateSwitchRule, executeCodeNode } from "@/lib/expression-engine";
import WorkflowCanvas from "@/components/workflows/WorkflowCanvas";
import WorkflowNodePalette from "@/components/workflows/WorkflowNodePalette";
import WorkflowNodeConfigPanel from "@/components/workflows/WorkflowNodeConfigPanel";
import { useCopilotContext } from "@/components/copilot/CopilotContext";
import { validateAllNodes } from "@/lib/workflow-validation";
import {
  createHistoryState, pushSnapshot, undo as historyUndo, redo as historyRedo,
  canUndo, canRedo, type HistoryState,
} from "@/lib/workflow-history";
import CredentialModal from "@/components/workflows/CredentialModal";
import WorkflowSettingsModal, { type WorkflowSettings } from "@/components/workflows/WorkflowSettingsModal";

// Lazy import AI generate modal
const AiGenerateModalLazy = React.lazy(() => import("@/components/workflows/AiGenerateModal"));

function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

function generateEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

// ── Mock execution data for demo lead ──────────────────────────────────────────
const DEMO_LEAD = {
  id: "lead_9921",
  name: "Abhinav Sharma",
  email: "abhinav.sharma@gmail.com",
  phone: "+91 98765 43210",
  city: "Delhi",
  status: "New",
  industry: "Corporate",
  tags: [],
  score: 87,
  source: "AI Voice Call",
  timestamp: new Date().toISOString(),
};

// ── Build execution output per node type ────────────────────────────────────────
async function buildNodeOutput(
  node: WorkflowNode,
  input: any,
  nodeOutputMap: Record<string, any>
): Promise<{ output: any; status: "success" | "error"; error?: string; executionMs: number }> {
  const start = performance.now();

  // Resolve template expressions in config
  const ctx = {
    $json: input,
    $nodes: Object.fromEntries(
      Object.entries(nodeOutputMap).map(([k, v]) => [k, { json: v }])
    ),
    $runIndex: 0,
    lead: input.lead,
    call: input.call,
  };

  const resolvedConfig = resolveConfigTemplates(node.config, ctx);

  try {
    let output: any = {};

    switch (node.type) {
      case "manual_trigger":
      case "new_lead":
      case "form_submitted":
        output = { ...input };
        break;

      case "error_trigger":
        output = { errorMessage: "Previous workflow failed", errorNode: "Unknown", ...input };
        break;

      case "call_completed":
        output = {
          call: {
            id: "call_8829",
            duration: "2m 14s",
            direction: resolvedConfig.callDirection || "outbound",
            sentiment: "positive",
            summary: "Lead is highly interested in the corporate package and requested pricing details via email.",
            transcript: "Hello, I'd love to hear more about your services..."
          },
          lead: { ...input.lead, status: "Contacted" }
        };
        break;

      case "scheduled":
        output = {
          scheduledAt: new Date().toISOString(),
          cron: resolvedConfig.cronExpression || "0 9 * * *",
          ...input
        };
        break;

      case "webhook_received":
        output = {
          webhookPath: resolvedConfig.webhookPath,
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": "ExternalSystem/1.0" },
          body: { ...input }
        };
        break;

      case "lead_status_changed":
        output = {
          previousStatus: resolvedConfig.fromStatus || "New",
          newStatus: resolvedConfig.toStatus || "Contacted",
          lead: { ...input.lead, status: resolvedConfig.toStatus || "Contacted" }
        };
        break;

      case "lead_tag_added":
      case "sentiment_detected":
        output = { ...input, triggerData: { tagName: resolvedConfig.tagName, sentimentType: resolvedConfig.sentimentType } };
        break;

      // ── Flow Control ────────────────────────────────────────
      case "if_else":
      case "check_lead_field":
      case "check_call_count":
      case "check_sentiment":
      case "filter_by_tag": {
        // Evaluate condition
        let passes = true;
        if (node.type === "if_else" || node.type === "check_lead_field") {
          passes = evaluateSwitchRule({ field: resolvedConfig.field, operator: resolvedConfig.operator, value: resolvedConfig.value }, { $json: input, lead: input.lead, call: input.call });
        } else if (node.type === "check_sentiment") {
          passes = (input.call?.sentiment || "neutral") === resolvedConfig.sentiment;
        } else if (node.type === "check_call_count") {
          const count = input.lead?.callCount || 1;
          passes = resolvedConfig.operator === "greater_than" ? count > resolvedConfig.value : resolvedConfig.operator === "less_than" ? count < resolvedConfig.value : count === resolvedConfig.value;
        } else if (node.type === "filter_by_tag") {
          const hasTags = (input.lead?.tags || []).includes(resolvedConfig.tagName);
          passes = resolvedConfig.hasTag ? hasTags : !hasTags;
        }
        output = { conditionPassed: passes, branch: passes ? "yes" : "no", evaluated: { field: resolvedConfig.field, value: resolvedConfig.value }, ...input };
        break;
      }

      case "switch_router": {
        let matchedOutput = -1;
        if (resolvedConfig.mode === "rules") {
          const rules = resolvedConfig.rules || [];
          for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            const matches = evaluateSwitchRule({ field: rule.field, operator: rule.operator, value: rule.value }, { $json: input, lead: input.lead, call: input.call });
            if (matches) { matchedOutput = rule.outputIndex; break; }
          }
        }
        output = {
          routedTo: matchedOutput === -1 ? "fallback" : `output_${matchedOutput}`,
          outputIndex: matchedOutput,
          rulesEvaluated: (resolvedConfig.rules || []).length,
          ...input
        };
        break;
      }

      case "merge_items":
        output = {
          merged: true,
          mode: resolvedConfig.mode || "append",
          itemCount: 2,
          items: [{ ...input }, { ...input, _branchIndex: 1 }]
        };
        break;

      case "loop_items": {
        // n8n-style SplitInBatches: process items one at a time (or in batches)
        // Uses nodeContext to track state across iterations
        const batchSize = resolvedConfig.batchSize || 1;

        // Get items from various possible input shapes
        let allLoopItems: any[] = [];
        if (Array.isArray(input.items) && input.items.length > 0) {
          allLoopItems = input.items;
        } else if (Array.isArray(input.leads) && input.leads.length > 0) {
          allLoopItems = input.leads;
        } else if (Array.isArray(input.allItems) && input.allItems.length > 0) {
          allLoopItems = input.allItems;
        } else if (Array.isArray(input.batch) && input.batch.length > 0) {
          // Re-queued from loop back — items are in batch
          allLoopItems = input.batch;
        }

        // If we got items from the expression, resolve it
        if (allLoopItems.length === 0 && resolvedConfig.itemsExpression) {
          try {
            const exprItems = resolveExpression(resolvedConfig.itemsExpression, { $json: input, lead: input.lead, call: input.call });
            if (Array.isArray(exprItems)) allLoopItems = exprItems;
          } catch {}
        }

        const batch = allLoopItems.slice(0, batchSize);
        const remaining = allLoopItems.slice(batchSize);

        output = {
          batch,
          items: batch,
          currentItem: batch[0] || null,
          currentIndex: 0,
          totalItems: allLoopItems.length,
          itemsLeft: remaining.length,
          hasMore: remaining.length > 0,
          allItems: allLoopItems,
          // Spread input so downstream nodes get lead data
          ...input,
          // Ensure lead data is accessible as top-level
          lead: batch[0] || input.lead || input,
          item: batch[0] || input.item || input,
        };
        break;
      }

      case "code_node": {
        const codeResult = executeCodeNode(resolvedConfig.code || "return $input.all();", input);
        if (!codeResult.success) {
          const ms = Math.round(performance.now() - start);
          return { output: null, status: "error", error: codeResult.error, executionMs: ms };
        }
        output = { result: codeResult.output, executionMs: codeResult.executionMs, success: true };
        break;
      }

      case "sub_workflow":
        output = {
          calledWorkflowId: resolvedConfig.workflowId,
          status: "completed",
          result: { success: true, itemsProcessed: 1 },
          executionId: `sub_exec_${Math.random().toString(36).substring(2, 8)}`
        };
        break;

      // ── Messaging ─────────────────────────────────────────────
      case "send_gmail": {
        const leadDataGmail = input.lead || input.item || input;
        const sentTo = resolvedConfig.to || leadDataGmail.email || leadDataGmail.Email || "unknown@example.com";
        const subject = resolvedConfig.subject || "No subject";
        const body = resolvedConfig.body || "No content";
        
        let accessToken = "";
        let refreshToken = "";
        try {
          const creds = localStorage.getItem("rapidx_credentials");
          if (creds) {
            const parsed = JSON.parse(creds);
            accessToken = parsed.gmail?.access_token || parsed.gmail?.accessToken || "";
            refreshToken = parsed.gmail?.refresh_token || parsed.gmail?.refreshToken || "";
          }
        } catch (e) {}

        if (!accessToken) {
           return { output: null, status: "error", error: "Gmail not connected. Please connect via Integrations.", executionMs: Math.round(performance.now() - start) };
        }

        try {
          const res = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: sentTo,
              subject,
              body,
              accessToken,
              refreshToken
            })
          });
          const data = await res.json();
          if (!res.ok) {
             return { output: null, status: "error", error: data.error || "Failed to send email", executionMs: Math.round(performance.now() - start) };
          }
          output = {
            success: true,
            messageId: data.messageId,
            sentTo,
            subject,
            bodyPreview: body.substring(0, 100) + (body.length > 100 ? "..." : ""),
            provider: "gmail_api",
            timestamp: new Date().toISOString()
          };
          
          if (data.newAccessToken) {
            try {
              const creds = JSON.parse(localStorage.getItem("rapidx_credentials") || "{}");
              if (creds.gmail) creds.gmail.accessToken = data.newAccessToken;
              localStorage.setItem("rapidx_credentials", JSON.stringify(creds));
            } catch (e) {}
          }
        } catch (err: any) {
           return { output: null, status: "error", error: err.message, executionMs: Math.round(performance.now() - start) };
        }
        break;
      }

      case "send_whatsapp":
        output = {
          success: true,
          messageId: `wa_msg_${Math.random().toString(36).substring(2, 8)}`,
          sentTo: resolvedConfig.phoneNumber || input.lead?.phone || "unknown",
          messageText: resolvedConfig.message || "",
          status: "delivered",
          provider: "meta_cloud_api"
        };
        break;

      case "send_sms":
        output = {
          success: true,
          sid: `SM${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
          to: resolvedConfig.to || input.lead?.phone,
          from: resolvedConfig.from || "+1415XXXXXXX",
          status: "queued",
          provider: "twilio"
        };
        break;

      case "send_slack":
        output = {
          success: true,
          channel: resolvedConfig.channel || "#general",
          ts: `${Date.now() / 1000}`,
          messageText: resolvedConfig.message || ""
        };
        break;

      case "send_telegram":
        output = {
          success: true,
          chatId: resolvedConfig.chatId,
          messageId: Math.floor(Math.random() * 100000),
          text: resolvedConfig.message || ""
        };
        break;

      case "send_instagram_dm":
        output = {
          success: true,
          recipientId: resolvedConfig.recipientId,
          messageId: `ig_msg_${Math.random().toString(36).substring(2, 10)}`,
          status: "sent"
        };
        break;

      // ── CRM ────────────────────────────────────────────────────
      case "update_lead_status": {
        const statusLead = input.lead || input.item || input;
        output = {
          success: true,
          previousStatus: statusLead.status || "New",
          currentStatus: resolvedConfig.newStatus || "Contacted",
          lead: { ...statusLead, status: resolvedConfig.newStatus }
        };
        break;
      }

      case "add_tag": {
        const tagLead = input.lead || input.item || input;
        output = {
          success: true,
          tagAdded: resolvedConfig.tagName || "",
          lead: { ...tagLead, tags: [...(tagLead.tags || []), resolvedConfig.tagName] }
        };
        break;
      }

      case "remove_tag": {
        const removeTagLead = input.lead || input.item || input;
        output = {
          success: true,
          tagRemoved: resolvedConfig.tagName || "",
          lead: { ...removeTagLead, tags: (removeTagLead.tags || []).filter((t: string) => t !== resolvedConfig.tagName) }
        };
        break;
      }

      case "trigger_outbound_call": {
        // Get lead data from various sources
        const leadData = input.lead || input.item || input;
        const phone = resolvedConfig.phoneNumber || leadData.phone || leadData.phoneNumber || "";
        const leadName = leadData.name || leadData.Name || "";
        const leadEmail = leadData.email || leadData.Email || "";
        const promptText = resolvedConfig.message || resolvedConfig.agentConfig || `You are calling ${leadName} to discuss our project offering.`;

        // Resolve expressions in phone and prompt
        const resolvedPhone = typeof phone === "string" && phone.includes("{{") ? resolveExpression(phone, { $json: input, lead: leadData }) : phone;
        const resolvedPrompt = typeof promptText === "string" && promptText.includes("{{") ? resolveExpression(promptText, { $json: input, lead: leadData }) : promptText;

        output = {
          success: true,
          phoneNumber: resolvedPhone,
          leadName,
          leadEmail,
          prompt: resolvedPrompt,
          status: "queued",
          calledAt: new Date().toISOString(),
        };
        break;
      }

      case "add_note":
        output = {
          success: true,
          noteId: `note_${Math.random().toString(36).substring(2, 8)}`,
          text: resolvedConfig.noteText || "Note added via workflow",
          timestamp: new Date().toISOString()
        };
        break;

      case "hubspot_create_contact":
        output = {
          success: true,
          id: `hs_contact_${Math.random().toString(36).substring(2, 10)}`,
          operation: resolvedConfig.operation || "create",
          properties: { email: input.lead?.email, firstname: input.lead?.name?.split(" ")[0] }
        };
        break;

      case "salesforce_update":
        output = {
          success: true,
          id: `sf_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          objectType: resolvedConfig.objectType || "Lead",
          operation: resolvedConfig.operation || "create"
        };
        break;

      // ── Productivity ──────────────────────────────────────────
      case "http_webhook":
        output = {
          statusCode: 200,
          headers: { "content-type": "application/json" },
          body: { id: `ext_${Math.random().toString(36).substring(2, 6)}`, synced: true, status: "success" },
          url: resolvedConfig.url || "",
          method: resolvedConfig.method || "POST"
        };
        break;

      case "send_to_sheets":
        output = {
          success: true,
          spreadsheetId: resolvedConfig.spreadsheetId || "1BxiMVs0XRA5...",
          updatedRange: `${resolvedConfig.sheetName || "Sheet1"}!A${Math.floor(Math.random() * 50) + 2}:F${Math.floor(Math.random() * 50) + 2}`,
          rowsAdded: 1,
          operation: resolvedConfig.operation || "append"
        };
        break;

      case "create_calendar_event":
        output = {
          success: true,
          eventId: `evt_${Math.random().toString(36).substring(2, 10)}`,
          htmlLink: `https://calendar.google.com/calendar/event?eid=${Math.random().toString(36).substring(2, 10)}`,
          title: resolvedConfig.title || "Follow-up",
          meetingType: resolvedConfig.meetingType || "google_meet",
          meetLink: `https://meet.google.com/${Math.random().toString(36).substring(2, 12)}`
        };
        break;

      case "airtable_row":
        output = {
          success: true,
          id: `rec${Math.random().toString(36).substring(2, 12)}`,
          operation: resolvedConfig.operation || "create",
          baseId: resolvedConfig.baseId,
          tableId: resolvedConfig.tableId
        };
        break;

      case "notion_page":
        output = {
          success: true,
          pageId: `${Math.random().toString(36).substring(2, 8)}-${Math.random().toString(36).substring(2, 8)}`,
          url: `https://notion.so/${Math.random().toString(36).substring(2, 12)}`,
          operation: resolvedConfig.operation || "create"
        };
        break;

      case "send_notification": {
        const notifLead = input.lead || input.item || input;
        const notifMessage = resolvedConfig.message || "";
        // Resolve expressions in message
        const resolvedMessage = typeof notifMessage === "string" && notifMessage.includes("{{")
          ? resolveExpression(notifMessage, { $json: input, lead: notifLead })
          : notifMessage;
        output = {
          success: true,
          channel: resolvedConfig.channel || "in_app",
          message: resolvedMessage,
          sent: true,
          recipient: resolvedConfig.recipient || "team",
          sentAt: new Date().toISOString(),
        };
        break;
      }

      case "wait_delay":
        output = {
          sleptFor: `${resolvedConfig.duration || 1} ${resolvedConfig.unit || "hours"}`,
          resumeTime: new Date(Date.now() + (resolvedConfig.duration || 1) * 3600000).toISOString(),
          note: "In production this pauses execution on a background worker"
        };
        break;

      case "sticky_note":
        output = {};
        break;

      // ── n8n-Style Data Transformation Nodes ──────────────────────────────────
      case "set_fields": {
        // Edit Fields (Set) — set/edit fields on items
        const newFields: Record<string, any> = {};
        (resolvedConfig.fields || []).forEach((f: any) => {
          if (f.name) newFields[f.name] = f.value;
        });
        output = { success: true, fieldsSet: newFields, itemCount: 1 };
        break;
      }

      case "aggregate": {
        // Aggregate Items — combine multiple items
        const mode = resolvedConfig.mode || "append";
        output = {
          success: true,
          mode,
          itemCount: Array.isArray(input.items) ? input.items.length : 1,
          result: input.items || [input],
          aggregated: true,
        };
        break;
      }

      case "remove_duplicates": {
        // Remove Duplicates — deduplicate by key field
        const items = Array.isArray(input.items) ? input.items : [input];
        const key = resolvedConfig.keyField || "";
        const seen = new Set();
        const unique = items.filter((item: any) => {
          const val = key ? item[key] : JSON.stringify(item);
          if (seen.has(val)) return false;
          seen.add(val);
          return true;
        });
        output = {
          success: true,
          originalCount: items.length,
          uniqueCount: unique.length,
          duplicatesRemoved: items.length - unique.length,
          items: unique,
        };
        break;
      }

      case "summarize": {
        // Summarize — aggregate with grouping
        output = {
          success: true,
          mode: resolvedConfig.mode || "group_by",
          groupByField: resolvedConfig.groupByField || "",
          aggregateFunction: resolvedConfig.aggregateFunction || "count",
          result: input.items || [input],
          summarized: true,
        };
        break;
      }

      case "extract_from_file": {
        // Extract from File — parse file content
        output = {
          success: true,
          fileType: resolvedConfig.fileType || "json",
          extracted: true,
          data: input,
        };
        break;
      }

      case "convert_file": {
        // Convert to/from File — format conversion
        output = {
          success: true,
          fromFormat: resolvedConfig.fromFormat || "json",
          toFormat: resolvedConfig.toFormat || "csv",
          converted: true,
          data: input,
        };
        break;
      }

      case "date_time": {
        // Date & Time — format/parse/calculate dates
        const op = resolvedConfig.operation || "formatDate";
        const now = new Date();
        let result: any = {};
        switch (op) {
          case "formatDate":
            result = { formatted: now.toISOString(), format: resolvedConfig.format || "yyyy-MM-dd" };
            break;
          case "addToDate":
            result = { date: now.toISOString(), added: resolvedConfig.addition || 1, unit: resolvedConfig.additionUnit || "hours" };
            break;
          case "subtractFromDate":
            result = { date: now.toISOString(), subtracted: resolvedConfig.addition || 1, unit: resolvedConfig.additionUnit || "hours" };
            break;
          case "getCurrentDate":
            result = { date: now.toISOString() };
            break;
          case "extractDate":
            result = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
            break;
          default:
            result = { date: now.toISOString() };
        }
        output = { success: true, operation: op, ...result };
        break;
      }

      case "edit_fields": {
        // Edit Fields — set/remove/rename
        const edited: Record<string, any> = {};
        (resolvedConfig.fields || []).forEach((f: any) => {
          if (f.action === "set" && f.name) edited[f.name] = f.value;
          else if (f.action === "remove" && f.name) delete edited[f.name];
        });
        output = { success: true, fieldsEdited: edited };
        break;
      }

      case "read_csv_leads": {
        // Read CSV — client-side demo with your actual leads data
        const demoLeads = [
          { sno: "1", name: "Abhinav Saxena", phone: "919911778218", location: "Delhi", email: "Abhinavsaxena6767@GMAIL.COM" },
          { sno: "2", name: "Apoorv", phone: "919999424997", location: "Goa", email: "Apoorvchandhok@gmail.com" },
        ];
        const limit = resolvedConfig.limit || 0;
        const leads = limit > 0 ? demoLeads.slice(0, limit) : demoLeads;
        output = {
          success: true,
          leads,
          count: leads.length,
          items: leads,
          allItems: leads,
          ...leads[0] && { lead: leads[0] },
        };
        break;
      }

      case "no_operation": {
        // No Operation — pure passthrough
        output = { success: true, passthrough: true };
        break;
      }

      case "stop_error": {
        // Stop and Error — always throws
        const errMsg = resolvedConfig.errorMessage || "Workflow stopped by Stop and Error node";
        return { output: null, status: "error", error: errMsg, executionMs: Math.round(performance.now() - start) };
      }

      case "respond_webhook": {
        // Respond to Webhook — send response
        output = {
          success: true,
          responseCode: resolvedConfig.responseCode || 200,
          responseBody: resolvedConfig.responseBody || "",
          sent: true,
        };
        break;
      }

      case "split_in_batches": {
        // Split In Batches — n8n-style loop
        const allBatchItems = Array.isArray(input.items) ? input.items
          : Array.isArray(input.leads) ? input.leads
          : Array.isArray(input) ? input
          : [];
        const batchSize = resolvedConfig.batchSize || 10;
        const batch = allBatchItems.slice(0, batchSize);
        const remaining = allBatchItems.slice(batchSize);
        output = {
          batch,
          items: batch,
          currentIndex: 0,
          totalItems: allBatchItems.length,
          itemsLeft: remaining.length,
          hasMore: remaining.length > 0,
          allItems: allBatchItems,
          ...input,
        };
        break;
      }

      default:
        output = { success: true, nodeType: node.type };
    }

    const executionMs = Math.round(performance.now() - start);
    return { output, status: "success", executionMs };
  } catch (err: any) {
    const executionMs = Math.round(performance.now() - start);
    return { output: null, status: "error", error: err?.message || String(err), executionMs };
  }
}

// ── Main Builder Component ─────────────────────────────────────────────────────

function BuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(!!editId);

  const [nodeExecutionStatuses, setNodeExecutionStatuses] = useState<Record<string, "idle" | "running" | "success" | "error">>({});
  const [nodeExecutionTimes, setNodeExecutionTimes] = useState<Record<string, number>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executions, setExecutions] = useState<any[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [showExecutionsPanel, setShowExecutionsPanel] = useState(false);

  const [showAiModal, setShowAiModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalMode, setJsonModalMode] = useState<"export" | "import">("export");
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState("");
  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [showNodeCreator, setShowNodeCreator] = useState(false);
  const [insertBetweenEdge, setInsertBetweenEdge] = useState<{ sourceId: string; targetId: string; sourcePort?: string } | null>(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings>({
    timezone: "DEFAULT",
    executionOrder: "v1",
    saveDataSuccessExecution: "all",
    saveDataErrorExecution: "all",
    saveExecutionProgress: true,
    saveManualExecutions: true,
    executionTimeout: 0,
  });
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Undo/Redo History ──────────────────────────────────────────────────────
  const historyRef = useRef<HistoryState>(createHistoryState(100));

  const snapshotCurrent = useCallback(() => {
    return { nodes, edges, workflowName, workflowDescription };
  }, [nodes, edges, workflowName, workflowDescription]);

  const pushToHistory = useCallback(() => {
    historyRef.current = pushSnapshot(historyRef.current, snapshotCurrent());
  }, [snapshotCurrent]);

  const handleUndo = useCallback(() => {
    const result = historyUndo(historyRef.current, snapshotCurrent());
    if (result.snapshot) {
      historyRef.current = result.state;
      setNodes(result.snapshot.nodes);
      setEdges(result.snapshot.edges);
      if (result.snapshot.workflowName) setWorkflowName(result.snapshot.workflowName);
      if (result.snapshot.workflowDescription) setWorkflowDescription(result.snapshot.workflowDescription);
    }
  }, [snapshotCurrent]);

  const handleRedo = useCallback(() => {
    const result = historyRedo(historyRef.current, snapshotCurrent());
    if (result.snapshot) {
      historyRef.current = result.state;
      setNodes(result.snapshot.nodes);
      setEdges(result.snapshot.edges);
      if (result.snapshot.workflowName) setWorkflowName(result.snapshot.workflowName);
      if (result.snapshot.workflowDescription) setWorkflowDescription(result.snapshot.workflowDescription);
    }
  }, [snapshotCurrent]);

  const [historyInfo, setHistoryInfo] = useState({ undoCount: 0, redoCount: 0 });

  // Update history info on every state change
  useEffect(() => {
    setHistoryInfo({
      undoCount: historyRef.current.past.length,
      redoCount: historyRef.current.future.length,
    });
  }, [nodes, edges]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const data = { name: workflowName, description: workflowDescription, nodes, edges, isActive, tags: workflowTags };
      let savedId = editId;
      if (editId) {
        await updateWorkflow(editId, data);
      } else {
        const created = await createWorkflow(data);
        savedId = created.id;
        window.history.replaceState(null, "", `/workflows/builder?id=${created.id}`);
      }
      // Auto-save version
      if (savedId) {
        try {
          await fetch("/api/workflow/versions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workflowId: savedId, snapshot: data }),
          });
        } catch {}
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("Failed to save:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  // ── Keyboard Shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — Undo
      if (isCtrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Shift+Z — Redo
      if (isCtrl && e.shiftKey && e.key === "z") {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl+S — Save
      if (isCtrl && e.key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }

      // N — Open node creator (when not typing in an input)
      if (e.key === "n" && !isCtrl && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShowNodeCreator(true);
        return;
      }

      // Escape — Close panels
      if (e.key === "Escape") {
        if (showNodeCreator) {
          setShowNodeCreator(false);
          setInsertBetweenEdge(null);
        } else if (selectedNodeId) {
          setSelectedNodeId(null);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo, handleSave, showNodeCreator, selectedNodeId]);

  const { setCopilotContext } = useCopilotContext();

  // ── Node validation (runs on every nodes/edges change) ────────────────────
  const nodeValidations = useMemo(
    () => validateAllNodes(nodes, edges),
    [nodes, edges]
  );

  const totalIssues = Object.values(nodeValidations).reduce(
    (acc, v) => acc + v.errors.length + v.warnings.length,
    0
  );

  // Sync state to copilot
  useEffect(() => {
    setCopilotContext("Workflow Builder", {
      workflowName,
      nodesCount: nodes.length,
      edgesCount: edges.length,
      selectedNodeId,
      isActive
    });
  }, [workflowName, nodes, edges, selectedNodeId, isActive, setCopilotContext]);

  // Load existing workflow
  useEffect(() => {
    if (editId) {
      (async () => {
        try {
          const wf = await getWorkflow(editId);
          if (wf) {
            setWorkflowName(wf.name);
            setWorkflowDescription(wf.description);
            setNodes(wf.nodes);
            setEdges(wf.edges);
            setIsActive(wf.isActive);
          }
        } catch (err) {
          console.error("Failed to load workflow:", err);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [editId]);

  // Load mock executions once workflow is loaded
  useEffect(() => {
    if (!loading && nodes.length > 0 && executions.length === 0) {
      const exec1: any = {
        id: `exec_mock_1`,
        workflowId: editId || "new",
        status: "success",
        startedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        finishedAt: new Date(Date.now() - 1000 * 60 * 12 + 2300).toISOString(),
        trigger: "manual",
        nodeExecutions: {},
      };
      nodes.forEach((n) => {
        exec1.nodeExecutions[n.id] = {
          nodeId: n.id, nodeLabel: n.label, type: n.type, status: "success",
          input: { lead: DEMO_LEAD },
          output: { success: true, timestamp: new Date(Date.now() - 1000 * 60 * 12 + 1500).toISOString() },
          startedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
          finishedAt: new Date(Date.now() - 1000 * 60 * 12 + 200).toISOString(),
          executionMs: Math.floor(Math.random() * 300) + 50,
        };
      });
      setExecutions([exec1]);
    }
  }, [loading, nodes.length, editId]);

  const selectedExecution = executions.find((e) => e.id === selectedExecutionId) || null;

  // Sync node highlights with chosen execution
  useEffect(() => {
    if (selectedExecution) {
      const statuses: Record<string, "idle" | "running" | "success" | "error"> = {};
      nodes.forEach((n) => {
        const nodeRun = selectedExecution.nodeExecutions[n.id];
        statuses[n.id] = nodeRun ? nodeRun.status : "idle";
      });
      setNodeExecutionStatuses(statuses);
    } else {
      setNodeExecutionStatuses({});
    }
  }, [selectedExecutionId, selectedExecution, nodes]);

  // ── Node Operations ──────────────────────────────────────────────────────────
  const handleAddNode = useCallback(
    (metadata: NodeMetadata, position?: { x: number; y: number }) => {
      pushToHistory();
      let x = 300;
      let y = 0;
      if (position) {
        x = position.x;
        y = position.y;
      } else {
        const maxY = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position.y)) : -60;
        y = maxY + 170;
      }

      const newNode: WorkflowNode = {
        id: generateNodeId(),
        type: metadata.type,
        category: metadata.category,
        label: metadata.label,
        config: { ...metadata.defaultConfig },
        position: { x, y },
      };
      setNodes((prev) => [...prev, newNode]);
      setSelectedNodeId(newNode.id);
      setShowNodeCreator(false);
    },
    [nodes, pushToHistory]
  );

  const handleDeleteNode = useCallback((id: string) => {
    pushToHistory();
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.sourceId !== id && e.targetId !== id));
    setSelectedNodeId((prev) => (prev === id ? null : prev));
  }, [pushToHistory]);

  const handleMoveNode = useCallback(
    (id: string, position: { x: number; y: number }) => {
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, position } : n)));
    },
    []
  );

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const handleUpdateNodeConfig = useCallback(
    (id: string, config: Record<string, any>, label?: string) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, config, ...(label !== undefined ? { label } : {}) } : n))
      );
    },
    []
  );

  // ── Edge Operations ──────────────────────────────────────────────────────────
  const handleAddEdge = useCallback(
    (sourceId: string, targetId: string, sourcePort?: string) => {
      pushToHistory();
      const exists = edges.find((e) => e.sourceId === sourceId && e.targetId === targetId);
      if (exists) return;
      const newEdge: WorkflowEdge = {
        id: generateEdgeId(),
        sourceId,
        targetId,
        sourcePort: sourcePort as any,
        label: sourcePort === "yes" ? "Yes" : sourcePort === "no" ? "No" : sourcePort?.startsWith("output_") ? `Out ${sourcePort.replace("output_", "")}` : undefined,
      };
      setEdges((prev) => [...prev, newEdge]);
    },
    [edges, pushToHistory]
  );

  const handleDeleteEdge = useCallback((id: string) => {
    pushToHistory();
    setEdges((prev) => prev.filter((e) => e.id !== id));
  }, [pushToHistory]);

  // ── Manual Run Simulator ─────────────────────────────────────────────────────
  const runWorkflowManually = async () => {
    if (isExecuting || nodes.length === 0) return;

    setIsExecuting(true);
    setShowExecutionsPanel(true);
    setSelectedNodeId(null);

    let startNode = nodes.find((n) => n.type === "manual_trigger") || nodes.find((n) => n.category === "trigger");
    if (!startNode) startNode = nodes[0];

    const executionId = `exec_${Date.now()}`;
    const newExecution: any = {
      id: executionId,
      workflowId: editId || "new",
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: "",
      trigger: "manual",
      nodeExecutions: {},
    };

    const initialStatuses: Record<string, "idle" | "running" | "success" | "error"> = {};
    nodes.forEach((n) => { initialStatuses[n.id] = "idle"; });
    setNodeExecutionStatuses(initialStatuses);
    setNodeExecutionTimes({});
    setExecutions((prev) => [newExecution, ...prev]);
    setSelectedExecutionId(executionId);

    const statuses = { ...initialStatuses };
    const nodeExecs: Record<string, any> = {};
    const nodeOutputMap: Record<string, any> = {}; // for $node["label"] references
    const queue: { nodeId: string; parentOutput?: any }[] = [{ nodeId: startNode.id, parentOutput: { lead: { ...DEMO_LEAD } } }];
    const visited = new Set<string>();
    // Track loop state for n8n-style loop: loop_items re-queues itself with remaining items
    const loopState: Record<string, { remainingItems: any[]; currentIndex: number; allItems: any[] }> = {};
    let overallStatus: "success" | "error" = "success";
    let iterations = 0;
    const MAX_ITERATIONS = 500; // safety limit

    try {
      while (queue.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const { nodeId, parentOutput } = queue.shift()!;
        // Allow loop_nodes to be visited multiple times
        if (visited.has(nodeId) && !nodeId.includes("loop_items")) continue;
        visited.add(nodeId);

        const node = nodes.find((n) => n.id === nodeId);
        if (!node) continue;

        // Skip pinned data nodes (use pinned output directly)
        if (node.config._pinnedData) {
          statuses[node.id] = "success";
          setNodeExecutionStatuses({ ...statuses });
          nodeOutputMap[node.label] = node.config._pinnedData;
          nodeExecs[node.id] = {
            nodeId: node.id, nodeLabel: node.label, type: node.type, status: "success",
            input: parentOutput, output: node.config._pinnedData,
            startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
            executionMs: 0, pinned: true
          };
          const outgoingEdges = edges.filter((e) => e.sourceId === node.id);
          outgoingEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: node.config._pinnedData }));
          continue;
        }

        statuses[node.id] = "running";
        setNodeExecutionStatuses({ ...statuses });

        // Delay to simulate work
        await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 400));

        const input = parentOutput || { lead: { ...DEMO_LEAD } };
        const { output, status, error, executionMs } = await buildNodeOutput(node, input, nodeOutputMap);

        if (status === "error") overallStatus = "error";

        statuses[node.id] = status;
        setNodeExecutionStatuses({ ...statuses });
        setNodeExecutionTimes((prev) => ({ ...prev, [node.id]: executionMs }));

        nodeOutputMap[node.label] = output;
        nodeExecs[node.id] = {
          nodeId: node.id, nodeLabel: node.label, type: node.type, status,
          input, output, error,
          startedAt: new Date(Date.now() - executionMs).toISOString(),
          finishedAt: new Date().toISOString(),
          executionMs
        };

        const outgoingEdges = edges.filter((e) => e.sourceId === node.id);

        // Route based on node type
        // Check if node has error output and failed — route to error port
        const nodeOnError = (node as any).onError;
        if (status === "error" && nodeOnError === "continueErrorOutput") {
          const errorEdges = outgoingEdges.filter((e) => e.sourcePort === "error");
          errorEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: output }));
        } else if (node.type === "if_else" || node.type === "check_lead_field" || node.type === "check_sentiment" || node.type === "filter_by_tag" || node.type === "check_call_count") {
          const chosenBranch = output.branch;
          const matchedEdges = outgoingEdges.filter((e) => e.sourcePort === chosenBranch);
          matchedEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: output }));
        } else if (node.type === "switch_router") {
          const routedPort = output.outputIndex === -1 ? "fallback" : `output_${output.outputIndex}`;
          const matchedEdges = outgoingEdges.filter((e) => e.sourcePort === routedPort || (!e.sourcePort && output.outputIndex === -1));
          matchedEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: output }));
        } else if (node.type === "loop_items" || node.type === "split_in_batches") {
          // n8n-style loop: if there are remaining items, re-queue the loop node
          const allItems = output.allItems || [];
          const batchSize = output.batch?.length || 1;
          const remaining = output.allItems ? output.allItems.slice(batchSize) : [];

          if (remaining.length > 0) {
            // Loop: send current item via "loop" port, then re-queue loop node
            const loopEdges = outgoingEdges.filter((e) => e.sourcePort === "loop");
            loopEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: output }));

            // Re-queue the loop node itself with remaining items
            queue.push({
              nodeId: node.id,
              parentOutput: { ...input, items: remaining, leads: remaining, allItems: remaining, item: remaining[0] }
            });
          } else {
            // Done: send all processed items via "done" port
            const doneEdges = outgoingEdges.filter((e) => e.sourcePort === "done");
            doneEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: output }));
          }
        } else if (node.type === "stop_error") {
          // Stop and Error — halt execution, do not queue any children
          overallStatus = "error";
        } else {
          outgoingEdges.forEach((e) => queue.push({ nodeId: e.targetId, parentOutput: output }));
        }
      }
    } catch (err: any) {
      console.error("Workflow execution crash:", err);
      overallStatus = "error";
    } finally {
      setIsExecuting(false);

      if (overallStatus === "success") {
        setShowSuccessAnim(true);
        setTimeout(() => setShowSuccessAnim(false), 4000);
      }

      setExecutions((prev) =>
        prev.map((exec) =>
          exec.id === executionId
            ? { ...exec, status: overallStatus, finishedAt: new Date().toISOString(), nodeExecutions: nodeExecs }
            : exec
        )
      );
    }
  };

  // ── Single-Node Test Step ─────────────────────────────────────────────────────
  const [isTestingStep, setIsTestingStep] = useState(false);

  const handleTestStep = async (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || isTestingStep) return;

    setIsTestingStep(true);
    setNodeExecutionStatuses(prev => ({ ...prev, [nodeId]: "running" }));

    // Find the input: use last execution data, or the parent's output, or demo lead
    const lastExec = executions[0];
    const parentInput = lastExec?.nodeExecutions[nodeId]?.input ?? { lead: { ...DEMO_LEAD } };

    // Build node output map from latest execution
    const nodeOutputMap: Record<string, any> = {};
    if (lastExec) {
      Object.values(lastExec.nodeExecutions).forEach((ne: any) => {
        nodeOutputMap[ne.nodeLabel] = ne.output;
      });
    }

    const { output, status, error, executionMs } = await buildNodeOutput(node, parentInput, nodeOutputMap);

    setNodeExecutionStatuses(prev => ({ ...prev, [nodeId]: status }));

    const testExecId = executions[0]?.id ?? `exec_test_${Date.now()}`;
    setExecutions(prev => {
      const existing = prev[0];
      if (!existing) return prev;
      return [
        {
          ...existing,
          nodeExecutions: {
            ...existing.nodeExecutions,
            [nodeId]: {
              nodeId, nodeLabel: node.label, type: node.type, status,
              input: parentInput, output, error,
              startedAt: new Date(Date.now() - executionMs).toISOString(),
              finishedAt: new Date().toISOString(),
              executionMs
            }
          }
        },
        ...prev.slice(1)
      ];
    });

    setIsTestingStep(false);
  };

  // Build nodeOutputMap for the panel (all executed nodes' outputs for variable scope)
  const panelNodeOutputMap = React.useMemo(() => {
    const lastExec = executions[0];
    if (!lastExec) return undefined;
    const map: Record<string, { label: string; data: any }> = {};
    Object.values(lastExec.nodeExecutions).forEach((ne: any) => {
      map[ne.nodeId] = { label: ne.nodeLabel, data: ne.output };
    });
    return map;
  }, [executions]);

  // ── JSON Export / Import ─────────────────────────────────────────────────────
  const exportWorkflowJson = () => {
    const data = { name: workflowName, description: workflowDescription, nodes, edges, isActive, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workflowName.replace(/\s+/g, "_").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openImportModal = () => {
    setImportJsonText("");
    setImportError("");
    setJsonModalMode("import");
    setShowJsonModal(true);
  };

  const openExportModal = () => {
    setJsonModalMode("export");
    setShowJsonModal(true);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importJsonText);
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        setImportError("Invalid workflow JSON: missing nodes or edges arrays.");
        return;
      }
      if (parsed.name) setWorkflowName(parsed.name);
      if (parsed.description) setWorkflowDescription(parsed.description);
      setNodes(parsed.nodes);
      setEdges(parsed.edges);
      setShowJsonModal(false);
    } catch (e) {
      setImportError("Failed to parse JSON. Please check the format.");
    }
  };

  // ── AI Generate workflow ──────────────────────────────────────────────────────
  const handleAiSuccess = () => {
    // AiGenerateModal navigates to the new workflow itself
    setShowAiModal(false);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  // ── Insert Node Between (connection "+" button) ──────────────────────────────
  const handleInsertNodeBetween = useCallback(
    (metadata: NodeMetadata) => {
      if (!insertBetweenEdge) return;
      pushToHistory();

      const { sourceId, targetId, sourcePort } = insertBetweenEdge;

      // Create the new node at a position between source and target
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);
      const x = sourceNode && targetNode ? (sourceNode.position.x + targetNode.position.x) / 2 : 400;
      const y = sourceNode && targetNode ? (sourceNode.position.y + targetNode.position.y) / 2 + 85 : 300;

      const newNode: WorkflowNode = {
        id: generateNodeId(),
        type: metadata.type,
        category: metadata.category,
        label: metadata.label,
        config: { ...metadata.defaultConfig },
        position: { x, y },
      };

      // Remove old edge, add new node + two new edges
      setNodes((prev) => [...prev, newNode]);
      setEdges((prev) => {
        const filtered = prev.filter((e) => !(e.sourceId === sourceId && e.targetId === targetId));
        return [
          ...filtered,
          {
            id: generateEdgeId(),
            sourceId,
            targetId: newNode.id,
            sourcePort: sourcePort as any,
            label: sourcePort === "yes" ? "Yes" : sourcePort === "no" ? "No" : undefined,
          },
          {
            id: generateEdgeId(),
            sourceId: newNode.id,
            targetId,
            sourcePort: "default",
          },
        ];
      });

      setSelectedNodeId(newNode.id);
      setInsertBetweenEdge(null);
      setShowNodeCreator(false);
    },
    [insertBetweenEdge, nodes, pushToHistory]
  );

  // ── Node Creator handler (dispatches to add or insert) ──────────────────────
  const handleNodeCreatorSelect = useCallback(
    (metadata: NodeMetadata) => {
      if (insertBetweenEdge) {
        handleInsertNodeBetween(metadata);
      } else {
        handleAddNode(metadata);
      }
    },
    [insertBetweenEdge, handleInsertNodeBetween, handleAddNode]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#2f81f7] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-[#8b949e]">Loading workflow...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {showSuccessAnim && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center justify-center pointer-events-none">
          <div className="bg-white dark:bg-[#161b22] px-6 py-4 rounded-2xl shadow-[0_10px_40px_rgba(34,197,94,0.2)] border border-green-500/30 flex items-center gap-4 animate-in fade-in slide-in-from-top-8 zoom-in-75 duration-500 fill-mode-forwards" style={{ animationTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}>
            <div className="w-12 h-12 rounded-full bg-green-500 text-white flex items-center justify-center animate-in zoom-in-0 spin-in-180 duration-500 delay-150 fill-mode-both" style={{ animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={4} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Workflow Completed!</h3>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">All actions executed successfully</p>
            </div>
          </div>
        </div>
      )}
      {/* Top toolbar */}
      <div className="h-14 border-b border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] flex items-center justify-between px-3 flex-shrink-0 transition-colors duration-200 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => router.push("/workflows")}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowPalette(!showPalette)}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors flex-shrink-0"
            title={showPalette ? "Hide palette" : "Show palette"}
          >
            {showPalette ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d] flex-shrink-0" />

          {/* Undo/Redo */}
          <button
            onClick={handleUndo}
            disabled={historyInfo.undoCount === 0}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyInfo.redoCount === 0}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          {/* Tidy Up */}
          <button
            onClick={() => {
              pushToHistory();
              // Dispatch custom event that WorkflowCanvas listens to
              window.dispatchEvent(new CustomEvent("workflow:tidyup"));
            }}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
            title="Tidy Up Nodes"
          >
            <AlignCenter className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d] flex-shrink-0" />

          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-sm font-semibold text-gray-900 dark:text-[#e6edf3] bg-transparent border-none outline-none focus:ring-0 min-w-0 placeholder-gray-400 dark:placeholder-[#484f58] truncate max-w-[200px]"
            placeholder="Workflow name..."
          />
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Validation summary badge */}
          {totalIssues > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
              title={`${totalIssues} issue${totalIssues > 1 ? "s" : ""} found — hover nodes to see details`}
            >
              <span>⚠</span>
              <span className="hidden sm:inline">{totalIssues} issue{totalIssues > 1 ? "s" : ""}</span>
            </div>
          )}

          {/* AI Generate */}
          <button
            onClick={() => setShowAiModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border
              bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400
              border-purple-200 dark:border-purple-500/20
              hover:bg-purple-100 dark:hover:bg-purple-500/20"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Build</span>
          </button>

          {/* Import / Export */}
          <button
            onClick={openImportModal}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
            title="Import Workflow JSON"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={exportWorkflowJson}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
            title="Export Workflow JSON"
          >
            <Download className="w-4 h-4" />
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d]" />

          {/* Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
            title="Workflow Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          {/* Credentials */}
          <button
            onClick={() => setShowCredentialsModal(true)}
            className="p-2 rounded-lg text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
            title="Manage Credentials"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>

          {/* Version History */}
          <button
            onClick={async () => {
              if (editId) {
                try {
                  const res = await fetch(`/api/workflow/versions?workflowId=${editId}`);
                  const data = await res.json();
                  setVersions(data.versions || []);
                } catch {}
              }
              setShowVersionHistory(!showVersionHistory);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              showVersionHistory
                ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                : "bg-white dark:bg-[#21262d] text-gray-700 dark:text-[#c9d1d9] border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#30363d]"
            }`}
            title="Version History"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Versions</span>
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d]" />

          {/* Run Manually */}
          <button
            onClick={runWorkflowManually}
            disabled={isExecuting || nodes.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border shadow-sm ${
              isExecuting
                ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-500 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-600 border-green-600 hover:border-green-700 text-white shadow-green-500/20"
            } disabled:opacity-50`}
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                Run
              </>
            )}
          </button>

          {/* Executions */}
          <button
            onClick={() => { setShowExecutionsPanel(!showExecutionsPanel); if (!showExecutionsPanel) setSelectedNodeId(null); }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              showExecutionsPanel
                ? "bg-blue-50 dark:bg-[#2f81f7]/10 text-[#2f81f7] border-[#2f81f7]/30"
                : "bg-white dark:bg-[#21262d] text-gray-700 dark:text-[#c9d1d9] border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#30363d]"
            }`}
            title="Execution Logs"
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Logs</span>
            {executions.length > 0 && (
              <span className="px-1 py-px text-[9px] rounded bg-gray-100 dark:bg-[#30363d] text-gray-500 dark:text-[#8b949e]">
                {executions.length}
              </span>
            )}
          </button>

          <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d]" />

          {/* Active toggle */}
          <button
            onClick={() => setIsActive(!isActive)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isActive
                ? "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20"
                : "bg-gray-100 dark:bg-[#21262d] text-gray-500 dark:text-[#6e7681] border border-gray-200 dark:border-[#30363d]"
            }`}
          >
            {isActive ? <><CheckCircle2 className="w-3 h-3" /> Active</> : <><Pause className="w-3 h-3" /> Inactive</>}
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
              saveStatus === "saved"
                ? "bg-green-500 text-white border-green-600"
                : saveStatus === "error"
                ? "bg-red-500 text-white border-red-600"
                : "bg-[#2f81f7] text-white hover:bg-[#2672d9] border-[#2672d9] shadow-[#2f81f7]/25"
            } disabled:opacity-50 border`}
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Error!" : "Save"}
          </button>
        </div>
      </div>

      {/* Description bar */}
      <div className="border-b border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] px-4 py-1.5 flex-shrink-0 flex items-center gap-3">
        <input
          type="text"
          value={workflowDescription}
          onChange={(e) => setWorkflowDescription(e.target.value)}
          className="text-xs text-gray-500 dark:text-[#8b949e] bg-transparent border-none outline-none focus:ring-0 flex-1 placeholder-gray-400 dark:placeholder-[#484f58]"
          placeholder="Add a description for this workflow..."
        />
        {/* Tags */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {workflowTags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
              {tag}
              <button onClick={() => setWorkflowTags((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-indigo-800 dark:hover:text-indigo-200">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <input
            type="text"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                e.preventDefault();
                const val = (e.target as HTMLInputElement).value.trim();
                if (!workflowTags.includes(val)) {
                  setWorkflowTags((prev) => [...prev, val]);
                }
                (e.target as HTMLInputElement).value = "";
              }
            }}
            className="w-20 px-2 py-0.5 text-[10px] rounded-full border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-gray-600 dark:text-[#c9d1d9] focus:outline-none focus:ring-1 focus:ring-indigo-500/30 placeholder-gray-400 dark:placeholder-[#484f58]"
            placeholder="+ Add tag"
          />
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left palette — fixed width, doesn't push canvas */}
        {showPalette && (
          <div className="flex-shrink-0" style={{ width: '288px', zIndex: 5 }}>
            <WorkflowNodePalette onAddNode={handleAddNode} />
          </div>
        )}

        {/* Canvas — takes remaining space */}
        <div className="flex-1 min-w-0">
          <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          onDeleteNode={handleDeleteNode}
          onMoveNode={handleMoveNode}
          onAddEdge={handleAddEdge}
          onDeleteEdge={handleDeleteEdge}
          nodeExecutionStatuses={nodeExecutionStatuses}
          nodeExecutionTimes={nodeExecutionTimes}
          nodeValidations={nodeValidations}
          onAddNode={handleAddNode}
          onInsertBetween={setInsertBetweenEdge}
        />
        </div>

        {/* Right panel: config or executions — fixed overlay when node selected */}
        {selectedNode && (
          <WorkflowNodeConfigPanel
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onUpdate={handleUpdateNodeConfig}
            executionData={executions[0]?.nodeExecutions?.[selectedNode.id]}
            nodes={nodes}
            edges={edges}
            selectedExecution={selectedExecution}
            onSelectNode={setSelectedNodeId}
            onTestStep={handleTestStep}
            nodeOutputMap={panelNodeOutputMap}
            isTestingStep={isTestingStep}
          />
        )}
        
        {showExecutionsPanel && !selectedNode && (
          <div className="w-96 bg-white dark:bg-[#161b22] border-l border-gray-200 dark:border-[#30363d] h-full flex flex-col overflow-hidden flex-shrink-0">
            {/* Panel header */}
            <div className="p-3.5 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#2f81f7]" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[#e6edf3]">Executions</h3>
                <span className="text-[9px] bg-[#2f81f7]/10 text-[#2f81f7] px-1.5 py-px rounded font-bold">
                  {executions.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setExecutions([]); setSelectedExecutionId(null); }}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  title="Clear history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowExecutionsPanel(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Executions list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {executions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                  <History className="w-8 h-8 text-gray-300 dark:text-[#30363d] mb-2" />
                  <p className="text-xs font-medium text-gray-500 dark:text-[#8b949e]">No executions yet</p>
                  <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mt-1">Click "Run" to simulate workflow execution.</p>
                </div>
              ) : (
                executions.map((exec) => {
                  const isSelected = exec.id === selectedExecutionId;
                  const durationMs = exec.finishedAt
                    ? new Date(exec.finishedAt).getTime() - new Date(exec.startedAt).getTime()
                    : null;
                  const nodeCount = Object.keys(exec.nodeExecutions || {}).length;

                  return (
                    <button
                      key={exec.id}
                      onClick={() => setSelectedExecutionId(isSelected ? null : exec.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        isSelected
                          ? "border-[#2f81f7] bg-blue-50/30 dark:bg-[#2f81f7]/5"
                          : "border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">
                          {exec.id.startsWith("exec_mock") ? "🕐 Historical Run" : "▶ Manual Run"}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          exec.status === "success"
                            ? "bg-green-500/10 text-green-500 border border-green-500/20"
                            : exec.status === "running"
                            ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
                            : "bg-red-500/10 text-red-500 border border-red-500/20"
                        }`}>
                          {exec.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="text-[10px] text-gray-400 dark:text-[#6e7681] mt-1.5 flex items-center justify-between">
                        <span>{new Date(exec.startedAt).toLocaleTimeString()}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">{nodeCount} nodes</span>
                          <span>
                            {durationMs !== null
                              ? durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
                              : "running..."}
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-2 pt-2 border-t border-[#2f81f7]/15 text-[9px] text-[#2f81f7] font-medium flex items-center justify-between">
                          <span>✓ Loaded on canvas</span>
                          <span>Click nodes to inspect data</span>
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Node Creator Panel (n8n-style right slide-out, N key or insert-between) */}
      {(showNodeCreator || insertBetweenEdge) && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => { setShowNodeCreator(false); setInsertBetweenEdge(null); }} />
          {/* Right slide-out panel */}
          <div className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-white dark:bg-[#161b22] border-l border-gray-200 dark:border-[#30363d] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="px-3 py-2.5 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">
                {insertBetweenEdge ? "Insert Node Between" : "Add Node (N)"}
              </h3>
              <button onClick={() => { setShowNodeCreator(false); setInsertBetweenEdge(null); }} className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <WorkflowNodePalette
                onAddNode={handleNodeCreatorSelect}
                isCollapsed={false}
              />
            </div>
          </div>
        </>
      )}

      {/* AI Generate Modal */}
      {showAiModal && (
        <Suspense fallback={null}>
          <AiGenerateModalLazy
            isOpen={showAiModal}
            onClose={() => setShowAiModal(false)}
            onSuccess={handleAiSuccess}
          />
        </Suspense>
      )}

      {/* Version History Panel */}
      {showVersionHistory && (
        <div className="fixed right-0 top-14 bottom-0 z-40 w-80 bg-white dark:bg-[#161b22] border-l border-gray-200 dark:border-[#30363d] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="px-3 py-2.5 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">Version History</h3>
              <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-bold">{versions.length}</span>
            </div>
            <button onClick={() => setShowVersionHistory(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {versions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-4 text-center">
                <History className="w-8 h-8 text-gray-300 dark:text-[#30363d] mb-2" />
                <p className="text-xs font-medium text-gray-500 dark:text-[#8b949e]">No versions yet</p>
                <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mt-1">Versions are auto-saved on each save.</p>
              </div>
            ) : (
              versions.map((ver) => (
                <div
                  key={ver.id}
                  className="p-3 rounded-xl border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3]">v{ver.versionNumber}</span>
                    <span className="text-[9px] text-gray-400 dark:text-[#6e7681]">
                      {new Date(ver.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {ver.label && (
                    <p className="text-[10px] text-gray-500 dark:text-[#8b949e] mt-1">{ver.label}</p>
                  )}
                  <button
                    onClick={() => {
                      if (ver.snapshot) {
                        if (ver.snapshot.name) setWorkflowName(ver.snapshot.name);
                        if (ver.snapshot.description) setWorkflowDescription(ver.snapshot.description);
                        if (ver.snapshot.nodes) setNodes(ver.snapshot.nodes);
                        if (ver.snapshot.edges) setEdges(ver.snapshot.edges);
                        setShowVersionHistory(false);
                      }
                    }}
                    className="mt-2 text-[10px] font-medium text-[#2f81f7] hover:text-[#2672d9] transition-colors"
                  >
                    Restore this version
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Credential Modal */}
      <CredentialModal
        isOpen={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
        nodeType={selectedNode?.type}
      />

      {/* Workflow Settings Modal */}
      <WorkflowSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={workflowSettings}
        onSave={setWorkflowSettings}
        workflowId={editId || undefined}
      />

      {/* JSON Import/Export Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                {jsonModalMode === "export" ? <Download className="w-4 h-4 text-[#2f81f7]" /> : <Upload className="w-4 h-4 text-[#2f81f7]" />}
                <h3 className="font-semibold text-sm text-gray-900 dark:text-[#e6edf3]">
                  {jsonModalMode === "export" ? "Export Workflow JSON" : "Import Workflow JSON"}
                </h3>
              </div>
              <button onClick={() => setShowJsonModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#21262d] text-gray-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              {jsonModalMode === "export" ? (
                <>
                  <p className="text-xs text-gray-500 dark:text-[#8b949e]">Copy or download the workflow JSON to share or back it up.</p>
                  <pre className="p-3 bg-gray-50 dark:bg-[#0d1117] rounded-lg text-xs font-mono overflow-auto max-h-80 border border-gray-200 dark:border-[#30363d] text-gray-800 dark:text-[#c9d1d9] leading-relaxed">
                    {JSON.stringify({ name: workflowName, description: workflowDescription, nodes, edges, isActive }, null, 2)}
                  </pre>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 dark:text-[#8b949e]">Paste a workflow JSON to replace the current canvas. This will overwrite all nodes and edges.</p>
                  <textarea
                    value={importJsonText}
                    onChange={(e) => { setImportJsonText(e.target.value); setImportError(""); }}
                    placeholder='{"name": "My Workflow", "nodes": [...], "edges": [...]}'
                    rows={16}
                    className="w-full px-3 py-2.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 resize-none"
                  />
                  {importError && (
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                      {importError}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-[#30363d] flex items-center justify-end gap-2 flex-shrink-0">
              <button onClick={() => setShowJsonModal(false)} className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#c9d1d9] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
                Cancel
              </button>
              {jsonModalMode === "export" ? (
                <button onClick={exportWorkflowJson} className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#2f81f7] hover:bg-[#2672d9] text-white transition-colors flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Download JSON
                </button>
              ) : (
                <button onClick={handleImportJson} disabled={!importJsonText.trim()} className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#2f81f7] hover:bg-[#2672d9] text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  Import & Replace
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#2f81f7] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <BuilderContent />
    </Suspense>
  );
}
