// ============================================================================
// Workflow Automation Types — n8n-parity Edition
// ============================================================================

// ── Trigger Types ────────────────────────────────────────────────────────────

export type TriggerType =
  | "new_lead"
  | "call_completed"
  | "scheduled"
  | "webhook_received"
  | "lead_status_changed"
  | "form_submitted"
  | "lead_tag_added"
  | "sentiment_detected"
  | "manual_trigger"
  | "error_trigger";

export interface TriggerConfig {
  callDirection?: "inbound" | "outbound" | "any";
  cronExpression?: string;
  scheduleDescription?: string;
  webhookPath?: string;
  fromStatus?: string;
  toStatus?: string;
  formId?: string;
  tagName?: string;
  sentimentType?: "positive" | "negative" | "neutral";
}

// ── Action Types ─────────────────────────────────────────────────────────────

export type ActionType =
  | "send_gmail"
  | "send_whatsapp"
  | "send_sms"
  | "send_slack"
  | "send_telegram"
  | "update_lead_status"
  | "add_tag"
  | "remove_tag"
  | "trigger_outbound_call"
  | "http_webhook"
  | "add_note"
  | "send_notification"
  | "send_to_sheets"
  | "create_calendar_event"
  | "wait_delay"
  | "code_node"
  | "sub_workflow"
  | "sticky_note"
  | "hubspot_create_contact"
  | "salesforce_update"
  | "airtable_row"
  | "notion_page"
  | "send_instagram_dm"
  | "read_csv_leads"
  // n8n-style data transformation nodes
  | "set_fields"
  | "aggregate"
  | "remove_duplicates"
  | "summarize"
  | "extract_from_file"
  | "convert_file"
  | "date_time"
  | "edit_fields"
  | "no_operation"
  | "stop_error"
  | "respond_webhook"
  | "split_in_batches";

export interface ReadCsvLeadsConfig {
  filePath: string;
  limit?: number;
}

// ── n8n-Style Data Transformation Configs ─────────────────────────────────────

export interface SetFieldsConfig {
  mode: "manual" | "expression";
  fields: Array<{ name: string; value: string }>;
}

export interface AggregateConfig {
  mode: "append" | "group_by" | "summarize";
  groupByField?: string;
  aggregateField?: string;
  aggregateFunction?: "count" | "sum" | "avg" | "min" | "max" | "join";
}

export interface RemoveDuplicatesConfig {
  keyField: string;
  compareMode: "exact" | "case_insensitive";
}

export interface SummarizeConfig {
  prompt: string;
  model?: string;
  maxTokens?: number;
}

export interface ExtractFromFileConfig {
  fileType: "csv" | "json" | "pdf" | "html" | "text";
  jsonPath?: string;
  csvDelimiter?: string;
}

export interface ConvertFileConfig {
  fromFormat: "json" | "csv" | "xml" | "html" | "text";
  toFormat: "json" | "csv" | "xml" | "html" | "text";
  options?: Record<string, any>;
}

export interface DateTimeConfig {
  operation: "format" | "parse" | "calculate" | "extract";
  inputField?: string;
  format?: string;
  addition?: number;
  additionUnit?: "seconds" | "minutes" | "hours" | "days" | "weeks" | "months";
}

export interface EditFieldsConfig {
  fields: Array<{ name: string; value: string; action: "set" | "remove" | "rename" }>;
}

export interface NoOperationConfig {
  // No-op — does nothing
}

export interface StopErrorConfig {
  errorMessage: string;
  errorType?: "nodeOperation" | "custom";
}

export interface RespondWebhookConfig {
  responseCode: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseContentType?: string;
}

export interface SplitInBatchesConfig {
  batchSize: number;
  batchMode?: "fixed" | "dynamic";
}

export interface GmailConfig {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

export interface WhatsAppConfig {
  phoneNumber: string;
  message: string;
  mediaUrl?: string;
  templateName?: string;
}

export interface SmsConfig {
  to: string;
  message: string;
  from?: string;
}

export interface SlackConfig {
  channel: string;
  message: string;
  username?: string;
  iconEmoji?: string;
}

export interface TelegramConfig {
  chatId: string;
  message: string;
  parseMode?: "Markdown" | "HTML" | "None";
}

export interface InstagramDmConfig {
  recipientId: string;
  message: string;
}

export interface UpdateLeadStatusConfig {
  newStatus: string;
}

export interface TagConfig {
  tagName: string;
}

export interface OutboundCallConfig {
  phoneNumber: string;
  agentConfig?: string;
  message?: string;
}

export interface HttpWebhookConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  authentication?: "none" | "basic" | "bearer" | "oauth2";
  authToken?: string;
  timeout?: number;
}

export interface NoteConfig {
  noteText: string;
}

export interface NotificationConfig {
  channel: "in_app" | "email" | "both";
  message: string;
  recipient?: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  operation: "append" | "update" | "get";
  rowData: Record<string, string>;
}

export interface CalendarEventConfig {
  title: string;
  description?: string;
  durationMinutes: number;
  delayFromTrigger?: number;
  attendees?: string[];
  meetingType?: "google_meet" | "zoom" | "in_person";
}

export interface WaitDelayConfig {
  duration: number;
  unit: "seconds" | "minutes" | "hours" | "days";
}

export interface CodeNodeConfig {
  language: "javascript" | "python";
  code: string;
  // output is whatever the code returns
}

export interface SubWorkflowConfig {
  workflowId: string;
  waitForCompletion: boolean;
  passInputData: boolean;
}

export interface StickyNoteConfig {
  content: string;
  color: "yellow" | "blue" | "green" | "pink" | "orange";
  width: number;
  height: number;
}

export interface HubspotConfig {
  operation: "create" | "update" | "get";
  properties: Record<string, string>;
}

export interface AirtableConfig {
  baseId: string;
  tableId: string;
  operation: "create" | "update" | "list";
  fields: Record<string, string>;
}

export interface NotionConfig {
  databaseId: string;
  operation: "create" | "update";
  properties: Record<string, string>;
}

// ── Flow Control Types ────────────────────────────────────────────────────────

export type FlowControlType =
  | "switch_router"
  | "merge_items"
  | "loop_items"
  | "if_else"
  | "filter_by_tag"
  | "check_lead_field"
  | "check_call_count"
  | "check_sentiment";

export interface SwitchRule {
  id: string;
  label: string;
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty"
    | "regex";
  value: string;
  outputIndex: number;
}

export interface SwitchConfig {
  mode: "rules" | "expression";
  expression?: string;
  rules: SwitchRule[];
  fallthrough: boolean; // send to "fallback" output if no rules match
}

export interface MergeConfig {
  mode: "append" | "merge_by_key" | "multiplex" | "wait_all";
  mergeKey?: string; // field to merge on when mode = merge_by_key
  inputCount: number; // number of input branches to wait for
}

export interface LoopConfig {
  mode: "items" | "batches";
  batchSize?: number; // for batches mode
  itemsExpression?: string; // e.g. "{{$json.leads}}"
}

// ── Condition Types ──────────────────────────────────────────────────────────

export type ConditionType = FlowControlType;

export interface IfElseConfig {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "greater_than"
    | "less_than"
    | "is_empty"
    | "is_not_empty";
  value: string;
  caseSensitive?: boolean;
}

export interface FilterByTagConfig {
  tagName: string;
  hasTag: boolean;
}

export interface CheckLeadFieldConfig {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "is_not_empty";
  value: string;
}

export interface CheckCallCountConfig {
  operator: "greater_than" | "less_than" | "equals";
  value: number;
}

export interface CheckSentimentConfig {
  sentiment: "positive" | "negative" | "neutral";
}

// ── Union Config Type ────────────────────────────────────────────────────────

export type NodeConfig =
  | TriggerConfig
  | GmailConfig
  | WhatsAppConfig
  | SmsConfig
  | SlackConfig
  | TelegramConfig
  | InstagramDmConfig
  | UpdateLeadStatusConfig
  | TagConfig
  | OutboundCallConfig
  | HttpWebhookConfig
  | NoteConfig
  | NotificationConfig
  | GoogleSheetsConfig
  | CalendarEventConfig
  | WaitDelayConfig
  | CodeNodeConfig
  | SubWorkflowConfig
  | StickyNoteConfig
  | HubspotConfig
  | AirtableConfig
  | NotionConfig
  | ReadCsvLeadsConfig
  | SwitchConfig
  | MergeConfig
  | LoopConfig
  | IfElseConfig
  | FilterByTagConfig
  | CheckLeadFieldConfig
  | CheckCallCountConfig
  | CheckSentimentConfig
  | SetFieldsConfig
  | AggregateConfig
  | RemoveDuplicatesConfig
  | SummarizeConfig
  | ExtractFromFileConfig
  | ConvertFileConfig
  | DateTimeConfig
  | EditFieldsConfig
  | NoOperationConfig
  | StopErrorConfig
  | RespondWebhookConfig
  | SplitInBatchesConfig;

// ── Node Types ───────────────────────────────────────────────────────────────

export type NodeCategory = "trigger" | "action" | "condition" | "flow" | "utility";

export interface WorkflowNode {
  id: string;
  type: TriggerType | ActionType | ConditionType | FlowControlType;
  category: NodeCategory;
  label: string;
  config: Record<string, any>;
  position: { x: number; y: number };
  notes?: string;
  disabled?: boolean;
  pinnedData?: any; // for data pinning
  // Error handling (n8n-pattern)
  continueOnFail?: boolean;
  retryOnFail?: boolean;
  retryCount?: number;
  retryIntervalMs?: number;
}

export interface WorkflowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort?: "default" | "yes" | "no" | string; // string for switch outputs: "output_0", "output_1", etc.
  label?: string;
}

// ── Workflow ─────────────────────────────────────────────────────────────────

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  industry?: string;
  tags?: string[];
  errorWorkflowId?: string; // ID of workflow to call on error
  settings?: {
    timezone?: string;
    saveDataSuccessExecution?: "all" | "none";
    saveDataErrorExecution?: "all" | "none";
    executionTimeout?: number;
  };
}

// ── Node Metadata (for palette rendering) ────────────────────────────────────

export interface NodeMetadata {
  type: TriggerType | ActionType | ConditionType | FlowControlType;
  category: NodeCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultConfig: Record<string, any>;
  paletteGroup?: string; // sub-group within category for display
  badge?: string; // e.g. "New", "Beta", "Pro"
}

// ── All available node definitions ───────────────────────────────────────────

export const TRIGGER_NODES: NodeMetadata[] = [
  {
    type: "manual_trigger",
    category: "trigger",
    label: "On Manual Run",
    description: "Fires when you click 'Run Workflow' manually",
    icon: "Play",
    color: "#3fb950",
    defaultConfig: {},
    paletteGroup: "Core",
  },
  {
    type: "new_lead",
    category: "trigger",
    label: "New Lead Captured",
    description: "Fires when a new lead is captured by the AI agent",
    icon: "UserPlus",
    color: "#3fb950",
    defaultConfig: {},
    paletteGroup: "CRM",
  },
  {
    type: "call_completed",
    category: "trigger",
    label: "Call Completed",
    description: "Fires when an inbound or outbound call ends",
    icon: "PhoneOff",
    color: "#3fb950",
    defaultConfig: { callDirection: "any" },
    paletteGroup: "CRM",
  },
  {
    type: "scheduled",
    category: "trigger",
    label: "Scheduled / Cron",
    description: "Fires on a recurring schedule or specific time",
    icon: "Clock",
    color: "#3fb950",
    defaultConfig: { cronExpression: "0 9 * * *", scheduleDescription: "Every day at 9:00 AM" },
    paletteGroup: "Core",
  },
  {
    type: "webhook_received",
    category: "trigger",
    label: "Webhook Received",
    description: "Fires when an external webhook hits your endpoint",
    icon: "Webhook",
    color: "#3fb950",
    defaultConfig: { webhookPath: "/api/webhook/custom" },
    paletteGroup: "Core",
  },
  {
    type: "lead_status_changed",
    category: "trigger",
    label: "Lead Status Changed",
    description: "Fires when a lead's status is updated",
    icon: "RefreshCw",
    color: "#3fb950",
    defaultConfig: { fromStatus: "any", toStatus: "any" },
    paletteGroup: "CRM",
  },
  {
    type: "form_submitted",
    category: "trigger",
    label: "Form Submitted",
    description: "Fires when a web or landing page form is submitted",
    icon: "FileText",
    color: "#3fb950",
    defaultConfig: {},
    paletteGroup: "Core",
  },
  {
    type: "lead_tag_added",
    category: "trigger",
    label: "Lead Tag Added",
    description: "Fires when a specific tag is added to a lead",
    icon: "Tag",
    color: "#3fb950",
    defaultConfig: { tagName: "" },
    paletteGroup: "CRM",
  },
  {
    type: "sentiment_detected",
    category: "trigger",
    label: "Sentiment Detected",
    description: "Fires when a specific sentiment is detected in a call",
    icon: "Heart",
    color: "#3fb950",
    defaultConfig: { sentimentType: "positive" },
    paletteGroup: "AI",
  },
  {
    type: "error_trigger",
    category: "trigger",
    label: "On Error",
    description: "Fires when another workflow fails — acts as an error handler",
    icon: "AlertTriangle",
    color: "#f85149",
    defaultConfig: {},
    paletteGroup: "Core",
    badge: "Handler",
  },
];

export const FLOW_NODES: NodeMetadata[] = [
  {
    type: "if_else",
    category: "condition",
    label: "If / Else",
    description: "Two-branch router: Yes or No based on a condition",
    icon: "GitBranch",
    color: "#d29922",
    defaultConfig: { field: "lead.city", operator: "equals", value: "" },
    paletteGroup: "Logic",
  },
  {
    type: "switch_router",
    category: "condition",
    label: "Switch (Multi-route)",
    description: "Route to N different outputs based on rules or an expression",
    icon: "Shuffle",
    color: "#d29922",
    defaultConfig: {
      mode: "rules",
      rules: [
        { id: "r1", label: "Output 1", field: "lead.status", operator: "equals", value: "New", outputIndex: 0 },
      ],
      fallthrough: true,
    },
    paletteGroup: "Logic",
    badge: "New",
  },
  {
    type: "merge_items",
    category: "condition",
    label: "Merge Branches",
    description: "Synchronize and combine data from parallel branches",
    icon: "Combine",
    color: "#d29922",
    defaultConfig: { mode: "append", inputCount: 2 },
    paletteGroup: "Logic",
    badge: "New",
  },
  {
    type: "loop_items",
    category: "condition",
    label: "Loop Over Items",
    description: "Iterate over an array of items, running subsequent nodes for each",
    icon: "Repeat",
    color: "#d29922",
    defaultConfig: { mode: "items", batchSize: 10, itemsExpression: "{{$json.items}}" },
    paletteGroup: "Logic",
    badge: "New",
  },
  {
    type: "filter_by_tag",
    category: "condition",
    label: "Filter by Tag",
    description: "Continue only if lead has (or doesn't have) a specific tag",
    icon: "Filter",
    color: "#d29922",
    defaultConfig: { tagName: "", hasTag: true },
    paletteGroup: "Logic",
  },
  {
    type: "check_lead_field",
    category: "condition",
    label: "Check Lead Field",
    description: "Check a lead's field value before continuing",
    icon: "Search",
    color: "#d29922",
    defaultConfig: { field: "lead.name", operator: "is_not_empty", value: "" },
    paletteGroup: "Logic",
  },
  {
    type: "check_call_count",
    category: "condition",
    label: "Check Call Count",
    description: "Branch based on number of calls with this lead",
    icon: "Hash",
    color: "#d29922",
    defaultConfig: { operator: "greater_than", value: 1 },
    paletteGroup: "Logic",
  },
  {
    type: "check_sentiment",
    category: "condition",
    label: "Check Sentiment",
    description: "Branch based on the call sentiment analysis result",
    icon: "Smile",
    color: "#d29922",
    defaultConfig: { sentiment: "positive" },
    paletteGroup: "Logic",
  },
];

export const ACTION_NODES: NodeMetadata[] = [
  // ── Code / Transform ──────────────────────────────────────
  {
    type: "code_node",
    category: "action",
    label: "Code",
    description: "Run custom JavaScript to transform or process data",
    icon: "Code2",
    color: "#7c3aed",
    defaultConfig: {
      language: "javascript",
      code: `// Input data is available as $input
// Return transformed items as an array
const items = $input.all();

return items.map(item => ({
  ...item.json,
  processed: true,
  timestamp: new Date().toISOString()
}));`,
    },
    paletteGroup: "Core",
    badge: "New",
  },
  {
    type: "sub_workflow",
    category: "action",
    label: "Execute Workflow",
    description: "Call another workflow and optionally wait for its result",
    icon: "Workflow",
    color: "#7c3aed",
    defaultConfig: { workflowId: "", waitForCompletion: true, passInputData: true },
    paletteGroup: "Core",
    badge: "New",
  },
  // ── Messaging ─────────────────────────────────────────────
  {
    type: "send_gmail",
    category: "action",
    label: "Send Gmail",
    description: "Send a personalized email via Gmail",
    icon: "Mail",
    color: "#ea4335",
    defaultConfig: { to: "{{$json.lead.email}}", subject: "", body: "", cc: "", bcc: "" },
    paletteGroup: "Messaging",
  },
  {
    type: "send_whatsapp",
    category: "action",
    label: "Send WhatsApp",
    description: "Send a WhatsApp message via Meta Cloud API",
    icon: "MessageCircle",
    color: "#25d366",
    defaultConfig: { phoneNumber: "{{$json.lead.phone}}", message: "", mediaUrl: "" },
    paletteGroup: "Messaging",
  },
  {
    type: "send_sms",
    category: "action",
    label: "Send SMS",
    description: "Send an SMS via Twilio or similar provider",
    icon: "Smartphone",
    color: "#f59e0b",
    defaultConfig: { to: "{{$json.lead.phone}}", message: "" },
    paletteGroup: "Messaging",
    badge: "New",
  },
  {
    type: "send_slack",
    category: "action",
    label: "Send Slack Message",
    description: "Post a message to a Slack channel or DM",
    icon: "MessageSquare",
    color: "#4a154b",
    defaultConfig: { channel: "#general", message: "" },
    paletteGroup: "Messaging",
    badge: "New",
  },
  {
    type: "send_telegram",
    category: "action",
    label: "Send Telegram",
    description: "Send a Telegram message to a user or group",
    icon: "Send",
    color: "#26a5e4",
    defaultConfig: { chatId: "", message: "", parseMode: "Markdown" },
    paletteGroup: "Messaging",
    badge: "New",
  },
  {
    type: "send_instagram_dm",
    category: "action",
    label: "Send Instagram DM",
    description: "Send a direct message via Instagram Business API",
    icon: "Instagram",
    color: "#e1306c",
    defaultConfig: { recipientId: "", message: "" },
    paletteGroup: "Messaging",
    badge: "New",
  },
  // ── CRM ───────────────────────────────────────────────────
  {
    type: "update_lead_status",
    category: "action",
    label: "Update Lead Status",
    description: "Change the lead's status in the CRM",
    icon: "UserCheck",
    color: "#2f81f7",
    defaultConfig: { newStatus: "Contacted" },
    paletteGroup: "CRM",
  },
  {
    type: "add_tag",
    category: "action",
    label: "Add Tag",
    description: "Add a tag/label to a lead",
    icon: "TagIcon",
    color: "#2f81f7",
    defaultConfig: { tagName: "" },
    paletteGroup: "CRM",
  },
  {
    type: "remove_tag",
    category: "action",
    label: "Remove Tag",
    description: "Remove a tag/label from a lead",
    icon: "XCircle",
    color: "#2f81f7",
    defaultConfig: { tagName: "" },
    paletteGroup: "CRM",
  },
  {
    type: "trigger_outbound_call",
    category: "action",
    label: "Trigger Outbound Call",
    description: "Initiate an AI-powered outbound call",
    icon: "PhoneOutgoing",
    color: "#2f81f7",
    defaultConfig: { phoneNumber: "{{$json.lead.phone}}", message: "" },
    paletteGroup: "CRM",
  },
  {
    type: "add_note",
    category: "action",
    label: "Add Note to Lead",
    description: "Attach a note or comment to the lead record",
    icon: "StickyNote",
    color: "#2f81f7",
    defaultConfig: { noteText: "" },
    paletteGroup: "CRM",
  },
  {
    type: "hubspot_create_contact",
    category: "action",
    label: "HubSpot — Create/Update Contact",
    description: "Create or update a contact in HubSpot CRM",
    icon: "Building2",
    color: "#ff5c35",
    defaultConfig: { operation: "create", properties: { email: "{{$json.lead.email}}", firstname: "{{$json.lead.name}}" } },
    paletteGroup: "CRM",
    badge: "New",
  },
  {
    type: "salesforce_update",
    category: "action",
    label: "Salesforce — Update Record",
    description: "Create or update a record in Salesforce",
    icon: "Cloud",
    color: "#00a1e0",
    defaultConfig: { operation: "update", properties: {} },
    paletteGroup: "CRM",
    badge: "New",
  },
  // ── Productivity ──────────────────────────────────────────
  {
    type: "http_webhook",
    category: "action",
    label: "HTTP Request",
    description: "Make an HTTP request to any external API",
    icon: "Globe",
    color: "#8b5cf6",
    defaultConfig: { url: "", method: "POST", body: "", authentication: "none", headers: {} },
    paletteGroup: "Core",
  },
  {
    type: "send_to_sheets",
    category: "action",
    label: "Google Sheets — Append Row",
    description: "Append lead data to a Google Sheet",
    icon: "Sheet",
    color: "#34a853",
    defaultConfig: { spreadsheetId: "", sheetName: "Sheet1", operation: "append", rowData: {} },
    paletteGroup: "Productivity",
  },
  {
    type: "create_calendar_event",
    category: "action",
    label: "Google Calendar — Create Event",
    description: "Create a Google Calendar event for follow-up",
    icon: "Calendar",
    color: "#2f81f7",
    defaultConfig: { title: "", durationMinutes: 30, delayFromTrigger: 24, meetingType: "google_meet" },
    paletteGroup: "Productivity",
  },
  {
    type: "airtable_row",
    category: "action",
    label: "Airtable — Add Row",
    description: "Create or update a record in Airtable",
    icon: "Table2",
    color: "#ff6b2b",
    defaultConfig: { baseId: "", tableId: "", operation: "create", fields: {} },
    paletteGroup: "Productivity",
    badge: "New",
  },
  {
    type: "notion_page",
    category: "action",
    label: "Notion — Create Page",
    description: "Create or update a page in a Notion database",
    icon: "FileCode2",
    color: "#000000",
    defaultConfig: { databaseId: "", operation: "create", properties: {} },
    paletteGroup: "Productivity",
    badge: "New",
  },
  {
    type: "read_csv_leads",
    category: "action",
    label: "Read CSV Leads",
    description: "Reads leads from the local data/leads.csv file to use in loops",
    icon: "FileText",
    color: "#000000",
    defaultConfig: { filePath: "../data/leads.csv", limit: 0 },
    paletteGroup: "Data",
    badge: "New",
  },
  {
    type: "send_notification",
    category: "action",
    label: "Send Notification",
    description: "Send an in-app or email notification to your team",
    icon: "Bell",
    color: "#2f81f7",
    defaultConfig: { channel: "in_app", message: "" },
    paletteGroup: "Core",
  },
  // ── Utilities ─────────────────────────────────────────────
  {
    type: "wait_delay",
    category: "action",
    label: "Wait / Delay",
    description: "Pause the workflow for a specified duration",
    icon: "Timer",
    color: "#8b949e",
    defaultConfig: { duration: 1, unit: "hours" },
    paletteGroup: "Utilities",
  },
  {
    type: "sticky_note",
    category: "utility",
    label: "Sticky Note",
    description: "Add an annotation or comment to the canvas",
    icon: "StickyNote",
    color: "#f59e0b",
    defaultConfig: { content: "Add your note here...", color: "yellow", width: 200, height: 120 },
    paletteGroup: "Utilities",
  },
  // ── n8n-Style Data Transformation Nodes ──────────────────────────────────────
  {
    type: "set_fields",
    category: "action",
    label: "Edit Fields (Set)",
    description: "Set or edit specific fields on items",
    icon: "Edit2",
    color: "#2f81f7",
    defaultConfig: { mode: "manual", fields: [{ name: "", value: "" }] },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "aggregate",
    category: "action",
    label: "Aggregate Items",
    description: "Combine multiple items into a single item",
    icon: "Combine",
    color: "#8b5cf6",
    defaultConfig: { mode: "append", groupByField: "", aggregateField: "", aggregateFunction: "count" },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "remove_duplicates",
    category: "action",
    label: "Remove Duplicates",
    description: "Remove duplicate items based on a key field",
    icon: "Copy",
    color: "#8b5cf6",
    defaultConfig: { keyField: "", compareMode: "exact" },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "summarize",
    category: "action",
    label: "Summarize",
    description: "Aggregate items with grouping and calculations",
    icon: "BarChart3",
    color: "#8b5cf6",
    defaultConfig: { mode: "group_by", groupByField: "", aggregateField: "", aggregateFunction: "count" },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "extract_from_file",
    category: "action",
    label: "Extract from File",
    description: "Parse and extract data from files (CSV, JSON, PDF, etc.)",
    icon: "FileUp",
    color: "#8b5cf6",
    defaultConfig: { fileType: "json", jsonPath: "", csvDelimiter: "," },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "convert_file",
    category: "action",
    label: "Convert to/from File",
    description: "Convert data between different formats",
    icon: "RefreshCw",
    color: "#8b5cf6",
    defaultConfig: { fromFormat: "json", toFormat: "csv", options: {} },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "date_time",
    category: "action",
    label: "Date & Time",
    description: "Format, parse, or calculate with dates and times",
    icon: "Clock",
    color: "#408000",
    defaultConfig: { operation: "formatDate", inputField: "", format: "yyyy-MM-dd" },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "edit_fields",
    category: "action",
    label: "Edit Fields",
    description: "Set, remove, or rename fields on items",
    icon: "Pencil",
    color: "#2f81f7",
    defaultConfig: { fields: [{ name: "", value: "", action: "set" }] },
    paletteGroup: "Data",
    badge: "n8n",
  },
  {
    type: "no_operation",
    category: "action",
    label: "No Operation",
    description: "Pass-through node — does nothing, useful for testing",
    icon: "Circle",
    color: "#8b949e",
    defaultConfig: {},
    paletteGroup: "Utilities",
    badge: "n8n",
  },
  {
    type: "stop_error",
    category: "action",
    label: "Stop and Error",
    description: "Halt workflow execution with an error message",
    icon: "Octagon",
    color: "#f85149",
    defaultConfig: { errorMessage: "Workflow stopped", errorType: "errorMessage" },
    paletteGroup: "Flow",
    badge: "n8n",
  },
  {
    type: "respond_webhook",
    category: "action",
    label: "Respond to Webhook",
    description: "Send a response back to the webhook caller",
    icon: "Reply",
    color: "#e44d8f",
    defaultConfig: { responseCode: 200, responseHeaders: {}, responseBody: "", responseContentType: "application/json" },
    paletteGroup: "Core",
    badge: "n8n",
  },
  {
    type: "split_in_batches",
    category: "action",
    label: "Split In Batches",
    description: "Process items in configurable batch sizes (n8n-style loop)",
    icon: "Layers",
    color: "#1a8c3a",
    defaultConfig: { batchSize: 10 },
    paletteGroup: "Flow",
    badge: "n8n",
  },
];

// Legacy alias for backwards compatibility
export const CONDITION_NODES = FLOW_NODES;

export const ALL_NODE_METADATA: NodeMetadata[] = [
  ...TRIGGER_NODES,
  ...FLOW_NODES,
  ...ACTION_NODES,
];

export function getNodeMetadata(type: string): NodeMetadata | undefined {
  return ALL_NODE_METADATA.find((n) => n.type === type);
}

// ── Palette Groups for UI ─────────────────────────────────────────────────────

export interface PaletteSection {
  id: string;
  title: string;
  accent: string;
  nodes: NodeMetadata[];
}

export function buildPaletteSections(filter?: string): PaletteSection[] {
  const query = filter?.toLowerCase().trim() || "";

  const allNodes = ALL_NODE_METADATA.filter((n) => {
    if (!query) return true;
    return (
      n.label.toLowerCase().includes(query) ||
      n.description.toLowerCase().includes(query) ||
      n.type.toLowerCase().includes(query) ||
      (n.paletteGroup?.toLowerCase().includes(query) ?? false)
    );
  });

  if (query) {
    // Flat search results — single section
    return [{ id: "results", title: `Results (${allNodes.length})`, accent: "#2f81f7", nodes: allNodes }];
  }

  return [
    {
      id: "triggers",
      title: "Triggers",
      accent: "#3fb950",
      nodes: allNodes.filter((n) => n.category === "trigger"),
    },
    {
      id: "flow",
      title: "Flow Control",
      accent: "#d29922",
      nodes: allNodes.filter((n) => ["condition", "flow"].includes(n.category)),
    },
    {
      id: "messaging",
      title: "Messaging",
      accent: "#25d366",
      nodes: allNodes.filter((n) => n.paletteGroup === "Messaging"),
    },
    {
      id: "crm",
      title: "CRM & Leads",
      accent: "#2f81f7",
      nodes: allNodes.filter((n) => n.paletteGroup === "CRM"),
    },
    {
      id: "productivity",
      title: "Productivity",
      accent: "#34a853",
      nodes: allNodes.filter((n) => n.paletteGroup === "Productivity"),
    },
    {
      id: "data",
      title: "Data Transformation",
      accent: "#8b5cf6",
      nodes: allNodes.filter((n) => n.paletteGroup === "Data"),
    },
    {
      id: "core",
      title: "Core / HTTP",
      accent: "#8b5cf6",
      nodes: allNodes.filter(
        (n) => n.paletteGroup === "Core" && n.category !== "trigger"
      ),
    },
    {
      id: "utilities",
      title: "Utilities",
      accent: "#8b949e",
      nodes: allNodes.filter((n) => n.paletteGroup === "Utilities"),
    },
  ].filter((s) => s.nodes.length > 0);
}
