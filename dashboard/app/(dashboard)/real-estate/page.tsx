"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Users, Play, Download, CheckCircle2, XCircle,
  Loader2, ChevronRight, ChevronLeft, Building, Mail, Phone,
  AlertCircle, RefreshCw, Trash2, Plus, X, Globe,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrochureData {
  name: string;
  fileName: string;
  content: string;
  charCount: number;
  description: string;
  totalChars?: number;
  truncated?: boolean;
  error?: string;
}

interface LeadRow {
  [key: string]: string;
}

interface CampaignResult {
  row_index: number;
  phone_number: string;
  lead_email: string;
  status: "Called" | "No Answer" | "Failed" | "Pending" | "Dialing";
  remarks: string;
  sentiment: string;
  intent: string;
  email_status?: string;
  interested_projects?: string[];
  brochure_sent?: string;
  property_requirements?: { budget?: string; location?: string; property_type?: string; bedrooms?: string };
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSV(text: string): { columns: string[]; rows: LeadRow[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { columns: [], rows: [] };
  const columns = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const rows = lines
    .slice(1)
    .map((line) => {
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === "," && !inQuotes) {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      const row: LeadRow = {};
      columns.forEach((col, idx) => {
        row[col] = cells[idx] ?? "";
      });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v.trim() !== ""));
  return { columns, rows };
}

async function parseXLSX(file: File): Promise<{ columns: string[]; rows: LeadRow[] }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = (await import("xlsx")).default;
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (jsonData.length === 0) return { columns: [], rows: [] };
  const columns = (jsonData[0] as string[]).map((c) => String(c).trim());
  const rows = jsonData
    .slice(1)
    .map((r) => {
      const row: LeadRow = {};
      columns.forEach((col, idx) => {
        row[col] = String((r as any[])[idx] ?? "").trim();
      });
      return row;
    })
    .filter((row) => Object.values(row).some((v) => v.trim() !== ""));
  return { columns, rows };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    Called: { color: "#3fb950", bg: "rgba(63,185,80,0.15)" },
    "No Answer": { color: "#d29922", bg: "rgba(210,153,34,0.15)" },
    Failed: { color: "#f85149", bg: "rgba(248,81,73,0.15)" },
    Pending: { color: "#8b949e", bg: "rgba(139,148,158,0.15)" },
    Dialing: { color: "#58a6ff", bg: "rgba(88,166,255,0.15)" },
  };
  const s = map[status] || map.Pending;
  return (
    <span
      style={{ color: s.color, backgroundColor: s.bg }}
      className="px-2 py-0.5 rounded-full text-xs font-medium"
    >
      {status}
    </span>
  );
}

function EmailBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    sent: { color: "#3fb950", bg: "rgba(63,185,80,0.15)", label: "Sent" },
    failed: { color: "#f85149", bg: "rgba(248,81,73,0.15)", label: "Failed" },
    not_requested: { color: "#8b949e", bg: "rgba(139,148,158,0.15)", label: "Not Sent" },
  };
  const s = map[status] || map.not_requested;
  return (
    <span
      style={{ color: s.color, backgroundColor: s.bg }}
      className="px-2 py-0.5 rounded-full text-xs font-medium"
    >
      {s.label}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, { color: string; bg: string; icon: string }> = {
    positive: { color: "#3fb950", bg: "rgba(63,185,80,0.15)", icon: "😊" },
    neutral: { color: "#d29922", bg: "rgba(210,153,34,0.15)", icon: "😐" },
    negative: { color: "#f85149", bg: "rgba(248,81,73,0.15)", icon: "😞" },
  };
  const key = sentiment?.toLowerCase() || "neutral";
  const s = map[key] || map.neutral;
  return (
    <span
      style={{ color: s.color, backgroundColor: s.bg }}
      className="px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1"
    >
      <span>{s.icon}</span> {sentiment || "—"}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function RealEstatePage() {
  // Wizard state
  const [step, setStep] = useState(1);

  // Step 1: Brochures
  const [brochures, setBrochures] = useState<BrochureData[]>([]);
  const [uploadingBrochures, setUploadingBrochures] = useState(false);
  const brochureFileRef = useRef<HTMLInputElement>(null);
  const [customPrompt, setCustomPrompt] = useState(`You are Priya, a friendly real estate consultant. You are calling to discuss property needs and help find the perfect home.

## YOUR OBJECTIVE
1. Introduce yourself and the company warmly
2. Profile the client: collect budget range, preferred location, property type, bedrooms
3. Based on their needs, recommend the most suitable project from our portfolio
4. Offer to send them the brochure for that project via email
5. If they are interested, confirm their email address and send the brochure

## CONVERSATION FLOW
- Greet them by name and introduce yourself
- Ask about their current living situation and what they are looking for
- Ask about their budget (use ranges like "fifty to eighty lakhs" not numbers)
- Ask about their preferred location/area
- Ask about property type: apartment, independent house, villa, plot
- Recommend 1-2 projects that match their needs
- Tell them key highlights of the recommended project(s)
- Ask if they would like to receive the brochure via email
- If yes, use the send_brochure tool to email it to them
- Thank them and offer to have a sales representative follow up

## CLIENT PROFILING QUESTIONS (ask naturally, not as a checklist)
- "Aap abhi kahan reh rahe hain?" / "Where are you currently staying?"
- "Aap kitne budget mein dekh rahe hain?" / "What is your budget range?"
- "Kis area mein aapko ghar chahiye?" / "Which area are you looking at?"
- "Aapko kya chahiye -- flat, independent house, ya villa?" / "What type of property?"
- "Kitne bedrooms chahiye?" / "How many bedrooms do you need?"

## TOOL USAGE
- Use the send_brochure tool when the client agrees to receive a brochure
- Pass the exact project_name from the catalog above and the client's email
- Only send ONE brochure -- the project that best matches their stated needs
- If they want multiple, offer to send the best match now and have sales follow up with others

## RULES
- Speak naturally, like a real estate consultant on a phone call
- Keep responses to 1-2 sentences at a time
- Match the client's language (Hindi, English, or Hinglish)
- Never invent project details -- only use information from the brochure catalog
- Always confirm the email address before sending
- If the client is not interested, thank them politely and end the call gracefully`);

  // Step 1: RAG / Knowledge Base
  const [ragUrls, setRagUrls] = useState<{ url: string; content: string }[]>([]);
  const [ragFiles, setRagFiles] = useState<{ name: string; content: string }[]>([]);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragUrlInput, setRagUrlInput] = useState("");
  const ragFileRef = useRef<HTMLInputElement>(null);

  // Step 2: Leads
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadColumns, setLeadColumns] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const [emailColumn, setEmailColumn] = useState("");
  const leadsFileRef = useRef<HTMLInputElement>(null);

  // Step 3: Campaign
  const [campaignId, setCampaignId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<CampaignResult[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);

  // Voice / LLM / STT config
  const [llmProvider, setLlmProvider] = useState("google");
  const [llmModel, setLlmModel] = useState("gemini-2.5-flash");
  const [ttsProvider, setTtsProvider] = useState("sarvam");
  const [ttsVoice, setTtsVoice] = useState("priya");
  const [ttsLanguage, setTtsLanguage] = useState("hi-IN");

  // Email config
  const [emailSubject, setEmailSubject] = useState("{{project.name}} — Project Brochure");
  const [emailBody, setEmailBody] = useState(
    `Dear {{lead.name}},\n\nThank you for your interest in {{project.name}}!\n\n{{project.description}}\n\nOur sales team will reach out to you shortly for any further assistance.\n\nBest Regards,\n{{sender.name}}`
  );
  const [senderName, setSenderName] = useState("Sales Team");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);

  // Check Gmail connection on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rapidx_credentials");
      if (saved) {
        const creds = JSON.parse(saved);
        if (creds.gmail?.email) {
          setGmailEmail(creds.gmail.email);
          setGmailConnected(true);
        }
      }
    } catch {}
  }, []);

  // Step 4: Results
  const [downloadReady, setDownloadReady] = useState(false);

  // Step 5: CRM
  interface CrmLead {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    status: string;
    custom_fields: Record<string, any>;
    created_at: string;
    updated_at: string;
  }
  const [crmLeads, setCrmLeads] = useState<CrmLead[]>([]);
  const [crmSearch, setCrmSearch] = useState("");
  const [crmStatusFilter, setCrmStatusFilter] = useState("");
  const [crmLoading, setCrmLoading] = useState(false);
  const [selectedCrmLead, setSelectedCrmLead] = useState<CrmLead | null>(null);

  const fetchCrmLeads = async (search?: string, status?: string) => {
    setCrmLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await fetch(`/api/real-estate/crm-leads?${params}`);
      const data = await res.json();
      setCrmLeads(data.leads || []);
    } catch (err) {
      console.error("Failed to fetch CRM leads:", err);
    } finally {
      setCrmLoading(false);
    }
  };

  // ── Config Persistence ────────────────────────────────────────────────────
  const CONFIG_STORAGE_KEY = "re_campaign_configs";
  const [configName, setConfigName] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<Record<string, any>>({});
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");

  const loadConfigsFromStorage = (): Record<string, any> => {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const persistConfigs = (configs: Record<string, any>) => {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
    setSavedConfigs(configs);
  };

  const saveCurrentConfig = (name: string) => {
    const config = {
      brochures,
      customPrompt,
      ragUrls,
      ragFiles,
      leads,
      leadColumns,
      phoneColumn,
      nameColumn,
      emailColumn,
      llmProvider, llmModel,
      ttsProvider, ttsVoice, ttsLanguage,
      emailSubject, emailBody, senderName,
      savedAt: new Date().toISOString(),
    };
    const updated = { ...savedConfigs, [name]: config };
    persistConfigs(updated);
    setConfigName(name);
    setShowSaveInput(false);
    setNewConfigName("");
  };

  const loadConfig = (name: string) => {
    const config = savedConfigs[name];
    if (!config) return;
    setBrochures(config.brochures || []);
    setCustomPrompt(config.customPrompt || "");
    setRagUrls(config.ragUrls || []);
    setRagFiles(config.ragFiles || []);
    setLeads(config.leads || []);
    setLeadColumns(config.leadColumns || []);
    setPhoneColumn(config.phoneColumn || "");
    setNameColumn(config.nameColumn || "");
    setEmailColumn(config.emailColumn || "");
    setLlmProvider(config.llmProvider || "groq");
    setLlmModel(config.llmModel || "llama-3.3-70b-versatile");
    setTtsProvider(config.ttsProvider || "sarvam");
    setTtsVoice(config.ttsVoice || "priya");
    setTtsLanguage(config.ttsLanguage || "hi-IN");
    setEmailSubject(config.emailSubject || "{{project.name}} — Project Brochure");
    setEmailBody(config.emailBody || "");
    setSenderName(config.senderName || "Sales Team");
    setConfigName(name);
  };

  const deleteConfig = (name: string) => {
    const updated = { ...savedConfigs };
    delete updated[name];
    persistConfigs(updated);
    if (configName === name) setConfigName("");
  };

  // Preset config for quick start
  const SATYA_HOMES_PRESET = {
    brochures: [
      {
        name: "Satya Helios",
        fileName: "satya-helios.pdf",
        content: "Satya Helios is a premium residential project located in Sector 150, Noida. The project offers 2 BHK and 3 BHK apartments with modern amenities. Price ranges from 55 Lakh to 90 Lakh. The project features a swimming pool, clubhouse, gymnasium, 24/7 security, and landscaped gardens. Possession expected by December 2027. RERA registered. Best suited for young professionals and families.",
        charCount: 450,
        description: "2BHK & 3BHK apartments in Sector 150, Noida. Price 55L - 90L. Ready by Dec 2027. Pool, clubhouse, gym, 24/7 security. Best for young professionals and families. RERA registered.",
        truncated: false,
      },
      {
        name: "Satya Orante",
        fileName: "satya-orante.pdf",
        content: "Satya Orante is a luxury villa project located in Sector 150, Noida. The project offers 3 BHK and 4 BHK independent villas with private gardens. Price ranges from 1.2 Cr to 2.5 Cr. The project features a private swimming pool, clubhouse, gymnasium, 24/7 security, and jogging track. Possession expected by June 2028. RERA registered. Best suited for high-net-worth families.",
        charCount: 480,
        description: "3BHK & 4BHK villas in Sector 150, Noida. Price 1.2Cr - 2.5Cr. Ready by Jun 2028. Private pool, clubhouse, gym, 24/7 security, jogging track. Best for HNIs. RERA registered.",
        truncated: false,
      },
      {
        name: "Satya Uptown",
        fileName: "satya-uptown.pdf",
        content: "Satya Uptown is an affordable housing project located in Sector 150, Noida. The project offers 1 BHK and 2 BHK apartments with smart home features. Price ranges from 35 Lakh to 55 Lakh. The project features a community hall, garden, 24/7 security, and kids play area. Possession expected by March 2027. PMAY eligible. Best suited for first-time homebuyers and young families.",
        charCount: 460,
        description: "1BHK & 2BHK apartments in Sector 150, Noida. Price 35L - 55L. Ready by Mar 2027. Community hall, garden, 24/7 security, kids play area. PMAY eligible. Best for first-time homebuyers.",
        truncated: false,
      },
    ],
    customPrompt: `You are Priya, a friendly real estate consultant from Satya Group. You are calling to discuss property needs and help find the perfect home.

## YOUR OBJECTIVE
1. Introduce yourself and Satya Group warmly
2. Profile the client: collect budget range, preferred location, property type, bedrooms
3. Based on their needs, recommend the most suitable project from our portfolio
4. Offer to send them the brochure for that project via email
5. If they are interested, confirm their email address and send the brochure

## CONVERSATION FLOW
- Greet them by name and introduce yourself as a Satya Group representative
- Ask about their current living situation and what they are looking for
- Ask about their budget (use ranges like "fifty to eighty lakhs" not numbers)
- Ask about their preferred location/area
- Ask about property type: apartment, independent house, villa, plot
- Recommend 1-2 projects that match their needs
- Tell them key highlights of the recommended project(s)
- Ask if they would like to receive the brochure via email
- If yes, use the send_brochure tool to email it to them
- Thank them and offer to have a sales representative follow up

## CLIENT PROFILING QUESTIONS (ask naturally, not as a checklist)
- "Aap abhi kahan reh rahe hain?" / "Where are you currently staying?"
- "Aap kitne budget mein dekh rahe hain?" / "What is your budget range?"
- "Kis area mein aapko ghar chahiye?" / "Which area are you looking at?"
- "Aapko kya chahiye -- flat, independent house, ya villa?" / "What type of property?"
- "Kitne bedrooms chahiye?" / "How many bedrooms do you need?"

## TOOL USAGE
- Use the send_brochure tool when the client agrees to receive a brochure
- Pass the exact project_name from the catalog above and the client's email
- Only send ONE brochure -- the project that best matches their stated needs
- If they want multiple, offer to send the best match now and have sales follow up with others

## RULES
- Speak naturally, like a real estate consultant on a phone call
- Keep responses to 1-2 sentences at a time
- Match the client's language (Hindi, English, or Hinglish)
- Never invent project details -- only use information from the brochure catalog
- Always confirm the email address before sending
- If the client is not interested, thank them politely and end the call gracefully`,
    ragUrls: [],
    ragFiles: [
      {
        name: "Satya Group FAQ.txt",
        content: "Satya Group is a leading real estate developer in Noida, established in 2005. We have delivered 15+ projects on time with RERA certification. Our projects are located in Sector 150, Noida — one of the fastest-growing areas in NCR. We offer flexible payment plans: construction-linked and possession-linked. Home loan partners: SBI, HDFC, ICICI, Axis Bank. We do NOT charge any hidden fees — all-inclusive pricing. Our USP: RERA certified, on-time delivery, premium construction quality, and transparent dealings. For any queries, call us at +91 120 4567 890 or email sales@satyagroup.com.",
      },
    ],
    llmProvider: "groq",
    llmModel: "llama-3.3-70b-versatile",
    ttsProvider: "sarvam",
    ttsVoice: "priya",
    ttsLanguage: "hi-IN",
    emailSubject: "{{project.name}} — Satya Group Brochure",
    emailBody: `Dear {{lead.name}},

Thank you for your interest in {{project.name}}!

{{project.description}}

Our sales team will reach out to you shortly for any further assistance.

Best Regards,
{{sender.name}}`,
    senderName: "Satya Group Sales Team",
    savedAt: new Date().toISOString(),
  };

  // Auto-load most recent config on mount
  useEffect(() => {
    const configs = loadConfigsFromStorage();
    setSavedConfigs(configs);
    const names = Object.keys(configs);
    if (names.length > 0) {
      // Load the most recently saved config
      const latest = names.reduce((a, b) =>
        (configs[a].savedAt || "") > (configs[b].savedAt || "") ? a : b
      );
      loadConfig(latest);
    } else {
      // No saved configs — create Satya Homes preset as default
      const preset = { ...SATYA_HOMES_PRESET };
      const updated = { "Satya Homes": preset };
      persistConfigs(updated);
      loadConfig("Satya Homes");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step 1: Brochure Upload ───────────────────────────────────────────────

  const handleBrochureUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingBrochures(true);

    try {
      const formData = new FormData();
      const names: string[] = [];
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
        names.push(files[i].name.replace(/\.pdf$/i, ""));
      }
      formData.append("names", JSON.stringify(names));

      console.log("[Brochure Upload] Sending", files.length, "files...");
      const res = await fetch("/api/real-estate/upload-brochures", {
        method: "POST",
        body: formData,
      });
      console.log("[Brochure Upload] Response status:", res.status);
      const data = await res.json();
      console.log("[Brochure Upload] Response:", data);

      if (data.error) {
        alert(`Upload error: ${data.error}`);
        return;
      }
      if (data.brochures) {
        const withDesc = data.brochures.map((b: BrochureData) => ({
          ...b,
          description: b.description || "",
        }));
        setBrochures((prev) => [...prev, ...withDesc]);
      }

      // Also upload brochures to dynamic RAG for semantic search
      for (let i = 0; i < files.length; i++) {
        try {
          const kbFormData = new FormData();
          kbFormData.append("file", files[i]);
          kbFormData.append("mode", "outbound");
          await fetch("/api/knowledge-base/upload", {
            method: "POST",
            body: kbFormData,
          });
          console.log(`[RAG] Uploaded brochure ${files[i].name} to dynamic knowledge base`);
        } catch (kbErr) {
          console.warn(`[RAG] Dynamic KB upload failed for brochure:`, kbErr);
        }
      }
    } catch (err: any) {
      console.error("Brochure upload failed:", err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingBrochures(false);
      if (brochureFileRef.current) brochureFileRef.current.value = "";
    }
  };

  const updateBrochureName = (index: number, name: string) => {
    setBrochures((prev) => prev.map((b, i) => (i === index ? { ...b, name } : b)));
  };

  const updateBrochureDescription = (index: number, description: string) => {
    setBrochures((prev) => prev.map((b, i) => (i === index ? { ...b, description } : b)));
  };

  const removeBrochure = (index: number) => {
    setBrochures((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Step 1: RAG / Knowledge Base ─────────────────────────────────────────

  const handleAddUrl = async () => {
    const url = ragUrlInput.trim();
    if (!url) return;

    // Check for duplicates
    if (ragUrls.some((r) => r.url === url)) {
      alert("This URL is already added.");
      return;
    }

    setRagUploading(true);
    try {
      const res = await fetch("/api/real-estate/scrape-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) {
        alert(`Failed to fetch URL: ${data.error}`);
        return;
      }
      setRagUrls((prev) => [...prev, { url: data.url, content: data.content }]);
      setRagUrlInput("");
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setRagUploading(false);
    }
  };

  const handleRagFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setRagUploading(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Check for duplicates by name
        if (ragFiles.some((f) => f.name === file.name)) continue;

        // 1. Upload to old endpoint for inline content (backward compat)
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/campaign/upload-rag", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) {
          alert(`Failed to process ${file.name}: ${data.error}`);
          continue;
        }
        setRagFiles((prev) => [...prev, { name: data.fileName, content: data.content }]);

        // 2. Upload to new dynamic RAG (pgvector semantic search)
        try {
          const kbFormData = new FormData();
          kbFormData.append("file", file);
          kbFormData.append("mode", "outbound");
          await fetch("/api/knowledge-base/upload", {
            method: "POST",
            body: kbFormData,
          });
          console.log(`[RAG] Uploaded ${file.name} to dynamic knowledge base`);
        } catch (kbErr) {
          console.warn(`[RAG] Dynamic KB upload failed for ${file.name}:`, kbErr);
          // Non-fatal — inline content still works
        }
      }
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setRagUploading(false);
      if (ragFileRef.current) ragFileRef.current.value = "";
    }
  };

  const removeRagUrl = (index: number) => {
    setRagUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const removeRagFile = (index: number) => {
    setRagFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ── RAG: inject raw cleaned text from files ─────────────────────────────
  const MAX_RAG_CHARS = 6000;

  const buildRagContent = useCallback(() => {
    const parts: string[] = [];
    let totalLen = 0;
    const budget = Math.floor(MAX_RAG_CHARS / Math.max(1, ragUrls.length + ragFiles.length));

    for (const item of ragUrls) {
      const hostname = (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })();
      const content = item.content.substring(0, budget).trim();
      if (content) {
        parts.push(`### From: ${hostname}\n${content}`);
        totalLen += content.length;
      }
    }
    for (const item of ragFiles) {
      const content = item.content.substring(0, budget).trim();
      if (content) {
        parts.push(`### From: ${item.name}\n${content}`);
        totalLen += content.length;
      }
    }
    return parts.join("\n\n");
  }, [ragUrls, ragFiles]);

  // ── Step 2: Leads Upload ──────────────────────────────────────────────────

  const handleLeadsUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";

    try {
      let parsed: { columns: string[]; rows: LeadRow[] };
      if (ext === "csv" || ext === "txt") {
        const text = await file.text();
        parsed = parseCSV(text);
      } else if (ext === "xlsx" || ext === "xls") {
        parsed = await parseXLSX(file);
      } else {
        alert("Please upload a CSV or Excel file.");
        return;
      }

      setLeadColumns(parsed.columns);
      setLeads(parsed.rows);

      // Auto-detect columns
      const phoneCol = parsed.columns.find((c) => /phone|mobile|cell|number/i.test(c));
      const nameCol = parsed.columns.find((c) => /^name$|first.?name|lead.?name/i.test(c));
      const emailCol = parsed.columns.find((c) => /email|e-mail/i.test(c));
      if (phoneCol) setPhoneColumn(phoneCol);
      if (nameCol) setNameColumn(nameCol);
      if (emailCol) setEmailColumn(emailCol);
    } catch (err) {
      console.error("Leads upload failed:", err);
    } finally {
      if (leadsFileRef.current) leadsFileRef.current.value = "";
    }
  };

  const validLeads = leads.filter((row) => phoneColumn && row[phoneColumn]?.trim());

  // ── Step 3: Campaign Execution ────────────────────────────────────────────

  const buildSystemPrompt = useCallback(() => {
    let prompt = customPrompt.trim();

    // Inject brochure info: name + description only (what the user typed)
    if (brochures.length > 0) {
      const brochureSection = brochures.map((b) => {
        const parts = [`### ${b.name}`];
        if (b.description?.trim()) parts.push(b.description.trim());
        return parts.join("\n");
      }).join("\n\n");

      prompt += `\n\n## PROJECT CATALOG\nThese are the available projects. Use only the information below.\n\n${brochureSection}`;
    }

    // Inject RAG knowledge base: full extracted text from files
    const ragContent = buildRagContent();
    if (ragContent.trim()) {
      prompt += `\n\n## KNOWLEDGE BASE\nUse the following documents to answer client questions. Only reference what is explicitly mentioned in these documents.\n\n${ragContent}`;
    }

    return prompt;
  }, [brochures, customPrompt, buildRagContent]);

  const startCampaign = async () => {
    if (validLeads.length === 0 || brochures.length === 0) return;

    // Warn if brochure descriptions are empty — agent will have no project data
    const emptyDescs = brochures.filter((b) => !b.description?.trim());
    if (emptyDescs.length > 0) {
      const names = emptyDescs.map((b) => b.name).join(", ");
      if (!confirm(`Warning: ${names} ${emptyDescs.length === 1 ? "has" : "have"} no description filled in. The AI agent needs project descriptions to recommend projects correctly. Without descriptions, it may make up fake project details.\n\nContinue anyway?`)) {
        return;
      }
    }

    cancelRef.current = false;
    setCancelled(false);
    setIsRunning(true);
    setCurrentIndex(0);
    setResults([]);
    setDownloadReady(false);

    try {
      // Initialize campaign
      const initRes = await fetch("/api/real-estate/start-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brochures: brochures.map((b) => ({
            name: b.name,
            fileName: b.fileName,
            content: b.content,
            charCount: b.charCount,
            description: b.description,
          })),
          leadsCount: validLeads.length,
          emailConfig: {
            subject: emailSubject,
            body: emailBody,
            senderName,
          },
          ragContent: buildRagContent(),
        }),
      });
      const initData = await initRes.json();
      const campId = initData.campaignId;
      setCampaignId(campId);

      const systemPrompt = buildSystemPrompt();

      // ── Detailed campaign start log ──────────────────────────────────────
      console.log("═══════════════════════════════════════════════════════════");
      console.log("[Campaign] STARTING CAMPAIGN");
      console.log("═══════════════════════════════════════════════════════════");
      console.log(`[Campaign] Total system prompt: ${systemPrompt.length} chars`);
      console.log("");
      console.log("[Campaign] ── BROCHURES ──");
      brochures.forEach((b, i) => {
        console.log(`  ${i + 1}. ${b.name}`);
        console.log(`     File: ${b.fileName}`);
        console.log(`     Description: ${b.description || "(EMPTY)"}`);
        console.log(`     Content length: ${b.content.length} chars`);
      });
      console.log("");
      console.log("[Campaign] ── RAG / KNOWLEDGE BASE ──");
      ragUrls.forEach((r, i) => {
        const hostname = (() => { try { return new URL(r.url).hostname; } catch { return r.url; } })();
        console.log(`  URL ${i + 1}: ${r.url} (${r.content.length} chars)`);
      });
      ragFiles.forEach((r, i) => {
        console.log(`  File ${i + 1}: ${r.name} (${r.content.length} chars)`);
      });
      if (ragUrls.length === 0 && ragFiles.length === 0) {
        console.log("  (none added)");
      }
      console.log("");
      console.log("[Campaign] ── FULL SYSTEM PROMPT ──");
      console.log(systemPrompt);
      console.log("═══════════════════════════════════════════════════════════");

      // Loop through leads sequentially
      for (let i = 0; i < validLeads.length; i++) {
        if (cancelRef.current) break;

        setCurrentIndex(i);
        const lead = validLeads[i];
        const phone = lead[phoneColumn]?.trim();
        const name = nameColumn ? lead[nameColumn]?.trim() : "";
        const email = emailColumn ? lead[emailColumn]?.trim() : "";

        if (!phone) continue;

        // Dispatch call
        try {
          await fetch("/api/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: phone,
              systemPrompt: systemPrompt,
              ragContent: buildRagContent(),
              leadName: name,
              leadEmail: email,
              leadData: lead,
              campaignId: campId,
              leadRowIndex: leads.indexOf(lead),
              overrideSystemPrompt: true,
              initialGreeting: (() => {
                // Extract agent name from system prompt (e.g. "You are Aman Sharma" → "Aman")
                const nameMatch = systemPrompt.match(/you are\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
                const agentName = nameMatch ? nameMatch[1].split(" ")[0] : "Agent";
                const isFemale = /\b(she|her|priya|isha|neha|ria|priyanka)\b/i.test(systemPrompt);
                const verb = isFemale ? "bol rahi hoon" : "bol raha hoon";
                return `Namaste ${name || ""} ji! Main ${agentName} ${verb}. Kya aapka ek minute ho sakta hai? Maine aapse property ke baare mein baat karni thi.`;
              })(),
              // Voice / LLM config
              modelProvider: llmProvider,
              llmModel: llmModel,
              ttsProvider: ttsProvider,
              voice: ttsVoice,
              ttsLanguage: ttsLanguage,
            }),
          });
        } catch (err) {
          console.error(`Dispatch failed for ${phone}:`, err);
        }

        // Poll for result (up to 3 minutes)
        const pollStart = Date.now();
        const timeout = 3 * 60 * 1000;
        while (Date.now() - pollStart < timeout) {
          if (cancelRef.current) break;
          await new Promise((r) => setTimeout(r, 4000));
          if (cancelRef.current) break;

          try {
            const resultRes = await fetch(`/api/campaign/results?campaignId=${campId}`);
            const resultData = await resultRes.json();
            const allResults: CampaignResult[] = resultData.results || [];
            const myResult = allResults.find(
              (r) => r.row_index === leads.indexOf(lead)
            );
            if (myResult) {
              setResults((prev) => {
                const filtered = prev.filter((r) => r.row_index !== myResult.row_index);
                return [...filtered, myResult];
              });

              // Sync to CRM
              fetch("/api/real-estate/crm-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  results: [{
                    phone_number: phone,
                    lead_name: name,
                    lead_email: email,
                    lead_data: lead,
                    status: myResult.status,
                    remarks: myResult.remarks,
                    sentiment: myResult.sentiment,
                    intent: myResult.intent,
                    interested_projects: myResult.interested_projects,
                    brochure_sent: myResult.brochure_sent,
                    property_requirements: myResult.property_requirements,
                    campaign_id: campId,
                  }],
                }),
              }).catch((err) => console.error("CRM sync failed:", err));

              break;
            }
          } catch {
            // continue polling
          }
        }
      }

      // Campaign complete
      setDownloadReady(true);
    } catch (err) {
      console.error("Campaign error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const cancelCampaign = () => {
    cancelRef.current = true;
    setCancelled(true);
    setIsRunning(false);
  };

  // ── Step 4: Download ──────────────────────────────────────────────────────

  const downloadCSV = async () => {
    if (!campaignId) return;

    try {
      const res = await fetch("/api/real-estate/download-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          leads: leads,
          columns: leadColumns,
        }),
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `real_estate_${campaignId}_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const resetAll = () => {
    setStep(1);
    setBrochures([]);
    setRagUrls([]);
    setRagFiles([]);
    setRagUrlInput("");
    setLeads([]);
    setLeadColumns([]);
    setPhoneColumn("");
    setNameColumn("");
    setEmailColumn("");
    setCampaignId("");
    setIsRunning(false);
    setCurrentIndex(0);
    setResults([]);
    setCancelled(false);
    setDownloadReady(false);
    setConfigName("");
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = {
    total: validLeads.length,
    called: results.filter((r) => r.status === "Called").length,
    noAnswer: results.filter((r) => r.status === "No Answer").length,
    failed: results.filter((r) => r.status === "Failed").length,
    emailsSent: results.filter((r) => r.email_status === "sent").length,
    interested: results.filter(
      (r) => r.interested_projects && r.interested_projects.length > 0
    ).length,
  };

  // ── Step Indicator ────────────────────────────────────────────────────────

  const steps = [
    { num: 1, label: "Brochures", icon: FileText },
    { num: 2, label: "Leads", icon: Users },
    { num: 3, label: "Campaign", icon: Phone },
    { num: 4, label: "Results", icon: Download },
    { num: 5, label: "CRM", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#161b22]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Building className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Real Estate AI Calling Agent</h1>
              <p className="text-sm text-[#8b949e]">
                Upload brochures & leads — AI calls, profiles, and sends brochures
              </p>
            </div>

            {/* Config Manager */}
            <div className="flex items-center gap-2">
              {configName && (
                <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg border border-emerald-400/20">
                  {configName}
                </span>
              )}
              {Object.keys(savedConfigs).length > 0 && (
                <select
                  value={configName}
                  onChange={(e) => {
                    if (e.target.value) loadConfig(e.target.value);
                  }}
                  className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500 max-w-[160px]"
                >
                  <option value="">Load config...</option>
                  {Object.keys(savedConfigs)
                    .sort((a, b) => (savedConfigs[b].savedAt || "").localeCompare(savedConfigs[a].savedAt || ""))
                    .map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                </select>
              )}
              {showSaveInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newConfigName}
                    onChange={(e) => setNewConfigName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newConfigName.trim()) saveCurrentConfig(newConfigName.trim());
                      if (e.key === "Escape") setShowSaveInput(false);
                    }}
                    className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-500 w-32"
                    placeholder="Config name..."
                    autoFocus
                  />
                  <button
                    onClick={() => newConfigName.trim() && saveCurrentConfig(newConfigName.trim())}
                    className="text-xs px-2 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowSaveInput(false)}
                    className="text-xs px-1.5 py-1.5 rounded-lg text-[#8b949e] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setShowSaveInput(true); setNewConfigName(configName || ""); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-emerald-400 hover:border-emerald-500/50 transition-all flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Save Config
                </button>
              )}
              {configName && savedConfigs[configName] && (
                <button
                  onClick={() => {
                    if (confirm(`Delete config "${configName}"?`)) deleteConfig(configName);
                  }}
                  className="text-xs px-2 py-1.5 rounded-lg text-[#8b949e] hover:text-red-400 transition-colors"
                  title="Delete config"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => s.num <= step && setStep(s.num)}
                  disabled={s.num > step + 1}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    step === s.num
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : step > s.num
                      ? "bg-[#21262d] text-[#3fb950] border border-[#30363d]"
                      : "text-[#8b949e] border border-transparent"
                  } ${isRunning && s.num < 3 ? "opacity-60" : ""}`}
                >
                  {step > s.num ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <s.icon className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-[#30363d] mx-1" />
                )}
              </div>
            ))}
            {isRunning && (
              <span className="ml-2 text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                Campaign running — steps are read-only
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Step 1: Brochures ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            {isRunning && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm flex items-center justify-between">
                <span>Viewing in read-only mode — campaign is running.</span>
                <button
                  onClick={() => setStep(3)}
                  className="text-xs underline hover:text-yellow-300"
                >
                  Back to Campaign →
                </button>
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold mb-1">Upload Project Brochures</h2>
              <p className="text-sm text-[#8b949e]">
                Upload PDF brochures for each real estate project. The AI agent will use these to match leads with the right project.
              </p>
            </div>

            {/* Upload area */}
            <div
              onClick={() => !isRunning && brochureFileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-[#161b22]/50 ${
                isRunning
                  ? "border-[#30363d] cursor-not-allowed opacity-60"
                  : "border-[#30363d] hover:border-emerald-500/50 cursor-pointer"
              }`}
            >
              <Upload className="w-8 h-8 text-[#8b949e] mx-auto mb-3" />
              <p className="text-sm text-[#8b949e]">
                {uploadingBrochures
                  ? "Uploading..."
                  : "Click to upload PDF brochures (multiple files supported)"}
              </p>
              <input
                ref={brochureFileRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => handleBrochureUpload(e.target.files)}
              />
            </div>

            {/* Brochure list */}
            {brochures.length > 0 && (
              <div className="space-y-3">
                {brochures.map((b, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-3"
                  >
                    <div className="flex items-center gap-4">
                      <FileText className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={b.name}
                          onChange={(e) => updateBrochureName(i, e.target.value)}
                          disabled={isRunning}
                          className="bg-transparent border-b border-[#30363d] focus:border-emerald-500 outline-none text-sm font-medium w-full pb-1 disabled:opacity-60"
                          placeholder="Project name"
                        />
                        <p className="text-xs text-[#8b949e] mt-1">
                          {b.fileName} — {b.charCount.toLocaleString()} chars
                          {b.truncated && " (truncated)"}
                          {b.error && <span className="text-red-400"> — {b.error}</span>}
                        </p>
                      </div>
                      {!isRunning && (
                        <button
                          onClick={() => removeBrochure(i)}
                          className="text-[#8b949e] hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-[#8b949e] mb-1">
                        Project Info for AI Agent
                      </label>
                      <textarea
                        value={b.description}
                        onChange={(e) => updateBrochureDescription(i, e.target.value)}
                        disabled={isRunning}
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none disabled:opacity-60"
                        rows={3}
                        placeholder="e.g. 2BHK & 3BHK apartments in Whitefield, Bangalore. Price 55L-1.2Cr. Ready by Dec 2027. Clubhouse, pool, 24/7 security. Best for young families and IT professionals."
                      />
                      <p className="text-xs text-[#8b949e] mt-1">
                        Help the AI decide when to recommend this project. Include: property type, location, price range, target audience, key USPs.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* System Prompt Editor */}
            <div className="mt-6 p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">System Prompt</h3>
                  <p className="text-xs text-[#8b949e]">
                    Edit the AI agent's prompt. Brochure catalog is always appended automatically.
                  </p>
                </div>
                <button
                  onClick={() => setCustomPrompt(`You are Priya, a friendly real estate consultant. You are calling to discuss property needs and help find the perfect home.

## YOUR OBJECTIVE
1. Introduce yourself and the company warmly
2. Profile the client: collect budget range, preferred location, property type, bedrooms
3. Based on their needs, recommend the most suitable project from our portfolio
4. Offer to send them the brochure for that project via email
5. If they are interested, confirm their email address and send the brochure

## CONVERSATION FLOW
- Greet them by name and introduce yourself
- Ask about their current living situation and what they are looking for
- Ask about their budget (use ranges like "fifty to eighty lakhs" not numbers)
- Ask about their preferred location/area
- Ask about property type: apartment, independent house, villa, plot
- Recommend 1-2 projects that match their needs
- Tell them key highlights of the recommended project(s)
- Ask if they would like to receive the brochure via email
- If yes, use the send_brochure tool to email it to them
- Thank them and offer to have a sales representative follow up

## CLIENT PROFILING QUESTIONS (ask naturally, not as a checklist)
- "Aap abhi kahan reh rahe hain?" / "Where are you currently staying?"
- "Aap kitne budget mein dekh rahe hain?" / "What is your budget range?"
- "Kis area mein aapko ghar chahiye?" / "Which area are you looking at?"
- "Aapko kya chahiye -- flat, independent house, ya villa?" / "What type of property?"
- "Kitne bedrooms chahiye?" / "How many bedrooms do you need?"

## TOOL USAGE
- Use the send_brochure tool when the client agrees to receive a brochure
- Pass the exact project_name from the catalog above and the client's email
- Only send ONE brochure -- the project that best matches their stated needs
- If they want multiple, offer to send the best match now and have sales follow up with others

## RULES
- Speak naturally, like a real estate consultant on a phone call
- Keep responses to 1-2 sentences at a time
- Match the client's language (Hindi, English, or Hinglish)
- Never invent project details -- only use information from the brochure catalog
- Always confirm the email address before sending
- If the client is not interested, thank them politely and end the call gracefully`)}
                  className="text-xs text-[#8b949e] hover:text-emerald-400 transition-colors"
                >
                  Reset to default
                </button>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={isRunning}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none font-mono disabled:opacity-60"
                rows={8}
                placeholder="Type your AI agent prompt here..."
              />
              <div className="flex items-center gap-4 mt-2">
                <span className="text-xs text-[#8b949e]">
                  {customPrompt.length} chars
                </span>
                <span className="text-xs text-[#8b949e]">
                  Brochure catalog with {brochures.length} project(s) will be appended automatically
                </span>
              </div>
            </div>

            {/* ── Knowledge Base / RAG ──────────────────────────────────────── */}
            <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Building className="w-4 h-4 text-blue-400" />
                    Additional Knowledge Base
                  </h3>
                  <p className="text-xs text-[#8b949e]">
                    Add your company website or reference documents for the AI agent to use during calls.
                  </p>
                </div>
                {(ragUrls.length > 0 || ragFiles.length > 0) && !isRunning && (
                  <button
                    onClick={() => { setRagUrls([]); setRagFiles([]); }}
                    className="text-xs text-[#8b949e] hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                )}
              </div>

              {/* URL input */}
              <div className="flex gap-2 mb-3">
                <input
                  type="url"
                  value={ragUrlInput}
                  onChange={(e) => setRagUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
                  disabled={isRunning || ragUploading}
                  className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-60"
                  placeholder="https://yourcompany.com/about"
                />
                <button
                  onClick={handleAddUrl}
                  disabled={isRunning || ragUploading || !ragUrlInput.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add URL
                </button>
              </div>

              {/* File upload */}
              <div
                onClick={() => !isRunning && !ragUploading && ragFileRef.current?.click()}
                className={`border border-dashed rounded-lg p-4 text-center transition-all mb-3 ${
                  isRunning
                    ? "border-[#30363d] cursor-not-allowed opacity-60"
                    : "border-[#30363d] hover:border-blue-500/50 cursor-pointer"
                }`}
              >
                {ragUploading ? (
                  <Loader2 className="w-5 h-5 text-blue-400 mx-auto animate-spin" />
                ) : (
                  <p className="text-xs text-[#8b949e]">
                    Click to upload PDF, DOCX, TXT, or CSV files
                  </p>
                )}
                <input
                  ref={ragFileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.csv,.md"
                  multiple
                  className="hidden"
                  onChange={(e) => handleRagFileUpload(e.target.files)}
                />
              </div>

              {/* Added items list */}
              {(ragUrls.length > 0 || ragFiles.length > 0) && (
                <div className="space-y-2">
                  {ragUrls.map((item, i) => (
                    <div
                      key={`url-${i}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-[#0d1117] border border-[#30363d] group"
                    >
                      <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#e6edf3] truncate">{item.url}</p>
                        <p className="text-[10px] text-[#8b949e]">{item.content.length.toLocaleString()} chars extracted</p>
                      </div>
                      {!isRunning && (
                        <button
                          onClick={() => removeRagUrl(i)}
                          className="text-[#8b949e] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {ragFiles.map((item, i) => (
                    <div
                      key={`file-${i}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-[#0d1117] border border-[#30363d] group"
                    >
                      <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#e6edf3] truncate">{item.name}</p>
                        <p className="text-[10px] text-[#8b949e]">{item.content.length.toLocaleString()} chars extracted</p>
                      </div>
                      {!isRunning && (
                        <button
                          onClick={() => removeRagFile(i)}
                          className="text-[#8b949e] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-[#8b949e]">
                    {(ragUrls.length + ragFiles.length)} source(s) — {(ragUrls.reduce((s, r) => s + r.content.length, 0) + ragFiles.reduce((s, r) => s + r.content.length, 0)).toLocaleString()} total chars will be appended to the prompt
                  </p>
                </div>
              )}
            </div>

            {/* Next button */}
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={brochures.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
              >
                Next: Upload Leads
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Leads ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            {isRunning && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm flex items-center justify-between">
                <span>Viewing in read-only mode — campaign is running.</span>
                <button
                  onClick={() => setStep(3)}
                  className="text-xs underline hover:text-yellow-300"
                >
                  Back to Campaign →
                </button>
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold mb-1">Upload Leads CSV</h2>
              <p className="text-sm text-[#8b949e]">
                Upload a CSV or Excel file with your leads. Map the phone, name, and email columns.
              </p>
            </div>

            {/* Upload area */}
            <div
              onClick={() => !isRunning && leadsFileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-[#161b22]/50 ${
                isRunning
                  ? "border-[#30363d] cursor-not-allowed opacity-60"
                  : "border-[#30363d] hover:border-emerald-500/50 cursor-pointer"
              }`}
            >
              <Upload className="w-8 h-8 text-[#8b949e] mx-auto mb-3" />
              <p className="text-sm text-[#8b949e]">
                Click to upload CSV or Excel file
              </p>
              <input
                ref={leadsFileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => handleLeadsUpload(e.target.files)}
              />
            </div>

            {/* Column mapping */}
            {leadColumns.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Phone Column *</label>
                    <select
                      value={phoneColumn}
                      onChange={(e) => setPhoneColumn(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">Select...</option>
                      {leadColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Name Column</label>
                    <select
                      value={nameColumn}
                      onChange={(e) => setNameColumn(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">Select...</option>
                      {leadColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Email Column</label>
                    <select
                      value={emailColumn}
                      onChange={(e) => setEmailColumn(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">Select...</option>
                      {leadColumns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div className="rounded-xl border border-[#30363d] overflow-hidden">
                  <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-xs text-[#8b949e]">
                    Preview — {validLeads.length} valid leads (showing first 5)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#30363d]">
                          {leadColumns.slice(0, 6).map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leads.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-[#30363d]/50">
                            {leadColumns.slice(0, 6).map((col) => (
                              <td key={col} className="px-3 py-2 text-xs">
                                {row[col] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#30363d] text-[#8b949e] hover:text-white text-sm transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={validLeads.length === 0 || !phoneColumn}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
              >
                Next: Run Campaign
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Campaign ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Configure & Run Campaign</h2>
              <p className="text-sm text-[#8b949e]">
                Set up voice, LLM, and email options before starting.
              </p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Brochures</p>
                <p className="text-2xl font-bold text-emerald-400">{brochures.length}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Leads</p>
                <p className="text-2xl font-bold text-blue-400">{validLeads.length}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Called</p>
                <p className="text-2xl font-bold text-white">{stats.called}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Emails Sent</p>
                <p className="text-2xl font-bold text-purple-400">{stats.emailsSent}</p>
              </div>
            </div>

            {/* ── Voice / LLM / STT Config ──────────────────────────────── */}
            {!isRunning && (
              <div className="p-5 rounded-xl bg-[#161b22] border border-[#30363d] space-y-5">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  Voice & AI Configuration
                </h3>

                {/* LLM */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">LLM Provider</label>
                    <select
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="groq">Groq</option>
                      <option value="cerebras">Cerebras (Free Tier)</option>
                      <option value="google">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">LLM Model</label>
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      {llmProvider === "groq" && (
                        <>
                          <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                          <option value="llama-3.1-8b-instant">Llama 3.1 8B (Fast)</option>
                          <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                        </>
                      )}
                      {llmProvider === "cerebras" && (
                        <>
                          <option value="gemma-4-31b">Gemma 4 31B (Free, 128K ctx)</option>
                          <option value="gpt-oss-120b">GPT-OSS 120B (Free, 65K ctx)</option>
                          <option value="llama-3.3-70b">Llama 3.3 70B (Free)</option>
                          <option value="llama-3.1-8b">Llama 3.1 8B (Free, Fast)</option>
                        </>
                      )}
                      {llmProvider === "google" && (
                        <>
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                          <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                        </>
                      )}
                      {llmProvider === "openai" && (
                        <>
                          <option value="gpt-4o">GPT-4o</option>
                          <option value="gpt-4o-mini">GPT-4o Mini</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* TTS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">TTS Provider</label>
                    <select
                      value={ttsProvider}
                      onChange={(e) => setTtsProvider(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="sarvam">Sarvam AI (Indian)</option>
                      <option value="deepgram">Deepgram Aura</option>
                      <option value="cartesia">Cartesia Sonic</option>
                      <option value="openai">OpenAI TTS</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Voice</label>
                    <select
                      value={ttsVoice}
                      onChange={(e) => setTtsVoice(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      {ttsProvider === "sarvam" && (
                        <>
                          <optgroup label="Female">
                            <option value="priya">Priya</option>
                            <option value="ishita">Ishita</option>
                            <option value="shreya">Shreya</option>
                            <option value="neha">Neha</option>
                            <option value="pooja">Pooja</option>
                            <option value="simran">Simran</option>
                            <option value="kavya">Kavya</option>
                            <option value="ritu">Ritu</option>
                          </optgroup>
                          <optgroup label="Male">
                            <option value="rahul">Rahul</option>
                            <option value="rohan">Rohan</option>
                            <option value="aditya">Aditya</option>
                            <option value="kabir">Kabir</option>
                            <option value="varun">Varun</option>
                          </optgroup>
                        </>
                      )}
                      {ttsProvider === "deepgram" && (
                        <>
                          <option value="aura-asteria-en">Asteria (F)</option>
                          <option value="aura-luna-en">Luna (F)</option>
                          <option value="aura-stella-en">Stella (F)</option>
                          <option value="aura-orion-en">Orion (M)</option>
                          <option value="aura-arcas-en">Arcas (M)</option>
                        </>
                      )}
                      {ttsProvider === "cartesia" && (
                        <>
                          <option value="bf0ba16d-90e2-43d4-a19a-c5bfb3e16586">Sonic (Default)</option>
                          <option value="78ab0ea0-6b78-46e0-ab27-fe2f15804074">Chinese Female</option>
                        </>
                      )}
                      {ttsProvider === "openai" && (
                        <>
                          <option value="alloy">Alloy</option>
                          <option value="echo">Echo</option>
                          <option value="fable">Fable</option>
                          <option value="onyx">Onyx</option>
                          <option value="nova">Nova</option>
                          <option value="shimmer">Shimmer</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Language</label>
                    <select
                      value={ttsLanguage}
                      onChange={(e) => setTtsLanguage(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="hi-IN">Hindi</option>
                      <option value="en-IN">English</option>
                      <option value="ta-IN">Tamil</option>
                      <option value="te-IN">Telugu</option>
                      <option value="mr-IN">Marathi</option>
                      <option value="gu-IN">Gujarati</option>
                      <option value="bn-IN">Bengali</option>
                      <option value="kn-IN">Kannada</option>
                      <option value="ml-IN">Malayalam</option>
                      <option value="pa-IN">Punjabi</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Email Config ─────────────────────────────────────────── */}
            {!isRunning && (
              <div className="p-5 rounded-xl bg-[#161b22] border border-[#30363d] space-y-5">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="w-4 h-4 text-purple-400" />
                  Email Configuration
                </h3>

                {/* Sender email status */}
                {gmailConnected ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-emerald-400 font-medium">Gmail Connected</p>
                      <p className="text-sm text-[#e6edf3]">
                        Emails will be sent from: <strong>{gmailEmail}</strong>
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        const testEmail = prompt("Send a test email to:", gmailEmail || "test@gmail.com");
                        if (!testEmail) return;
                        try {
                          const res = await fetch("/api/real-estate/test-email", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ toEmail: testEmail }),
                          });
                          const data = await res.json();
                          if (data.success) {
                            alert(`Test email sent successfully to ${testEmail}! Check your inbox.`);
                          } else {
                            alert(`Failed: ${data.error}`);
                          }
                        } catch (err: any) {
                          alert(`Error: ${err.message}`);
                        }
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all"
                    >
                      Send Test Email
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <div>
                      <p className="text-xs text-red-400 font-medium">Gmail Not Connected</p>
                      <p className="text-sm text-[#8b949e]">
                        Connect Gmail in{" "}
                        <a href="/integrations" className="text-emerald-400 underline">
                          Integrations
                        </a>{" "}
                        to send brochures.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Sender Name</label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="e.g. Sunrise Estates Sales Team"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Email Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      placeholder="Subject line"
                    />
                    <p className="text-xs text-[#8b949e] mt-1">
                      Variables: {"{{lead.name}}"}, {"{{project.name}}"}, {"{{sender.name}}"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">Email Body (HTML)</label>
                  <textarea
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none font-mono"
                    rows={10}
                    placeholder="Write your email template here..."
                  />
                  <div className="mt-2 p-3 rounded-lg bg-[#0d1117] border border-[#30363d]">
                    <p className="text-xs text-[#8b949e] mb-2">
                      <strong>Available dynamic variables:</strong>
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        ["{{lead.name}}", "From CSV → Name column"],
                        ["{{lead.email}}", "From CSV → Email column"],
                        ["{{lead.phone}}", "From CSV → Phone column"],
                        ["{{project.name}}", "Brochure name you entered"],
                        ["{{project.description}}", "Project info you wrote"],
                        ["{{sender.name}}", "Sender name above"],
                      ].map(([varName, desc]) => (
                        <div
                          key={varName}
                          className="text-xs cursor-pointer hover:bg-[#21262d] rounded px-2 py-1 transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(varName);
                          }}
                          title="Click to copy"
                        >
                          <span className="text-emerald-400 font-mono">{varName}</span>
                          <span className="text-[#8b949e] ml-1">— {desc}</span>
                        </div>
                      ))}
                    </div>
                    {leadColumns.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#30363d]">
                        <p className="text-[10px] text-[#8b949e] mb-1">
                          <strong>CSV column mapping:</strong>
                        </p>
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          <span className="text-blue-400">Name → <span className="text-[#e6edf3]">{nameColumn || "(not mapped)"}</span></span>
                          <span className="text-blue-400">Email → <span className="text-[#e6edf3]">{emailColumn || "(not mapped)"}</span></span>
                          <span className="text-blue-400">Phone → <span className="text-[#e6edf3]">{phoneColumn || "(not mapped)"}</span></span>
                        </div>
                        {leads.length > 0 && nameColumn && (
                          <p className="text-[10px] text-[#8b949e] mt-1">
                            Preview row: <span className="text-[#e6edf3]">{leads[0]?.[nameColumn]}</span>
                            {emailColumn && <span> · <span className="text-[#e6edf3]">{leads[0]?.[emailColumn]}</span></span>}
                            {phoneColumn && <span> · <span className="text-[#e6edf3]">{leads[0]?.[phoneColumn]}</span></span>}
                          </p>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-[#8b949e] mt-2">
                      Click a variable to copy it. Paste it anywhere in the subject or body.
                    </p>
                  </div>
                </div>

                {/* Email Preview */}
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1">
                    Preview (with sample data)
                  </label>
                  <div
                    className="p-4 rounded-lg bg-white text-gray-900 text-sm border border-[#30363d] whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: (() => {
                        // Use first lead row from CSV for preview, fallback to sample data
                        const previewLead = leads[0] || {};
                        const previewName = (nameColumn && previewLead[nameColumn]) || "Rahul Sharma";
                        const previewEmail = (emailColumn && previewLead[emailColumn]) || "rahul@example.com";
                        const previewPhone = (phoneColumn && previewLead[phoneColumn]) || "+91 98765 43210";
                        return emailBody
                          .replace(/\{\{lead\.name\}\}/g, previewName)
                          .replace(/\{\{lead\.email\}\}/g, previewEmail)
                          .replace(/\{\{lead\.phone\}\}/g, previewPhone)
                          .replace(/\{\{project\.name\}\}/g, brochures[0]?.name || "Sunset Towers")
                          .replace(/\{\{project\.description\}\}/g, brochures[0]?.description || "Premium apartments in Whitefield")
                          .replace(/\{\{sender\.name\}\}/g, senderName)
                          .replace(/\n/g, "<br>");
                      })(),
                    }}
                  />
                </div>
              </div>
            )}

            {/* Progress bar */}
            {isRunning && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[#8b949e]">
                  <span>
                    Calling lead {currentIndex + 1} of {validLeads.length}
                  </span>
                  <span>
                    {Math.round(((currentIndex + 1) / validLeads.length) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                    style={{
                      width: `${((currentIndex + 1) / validLeads.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {!isRunning && !downloadReady && (
                <button
                  onClick={startCampaign}
                  disabled={validLeads.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
                >
                  <Play className="w-4 h-4" />
                  Start Campaign
                </button>
              )}
              {isRunning && (
                <button
                  onClick={cancelCampaign}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-400 text-sm font-medium transition-all"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              )}
              {downloadReady && (
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all"
                >
                  View Results
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Live results table */}
            {results.length > 0 && (
              <div className="rounded-xl border border-[#30363d] overflow-hidden">
                <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-xs text-[#8b949e]">
                  Live Results — {results.length} of {validLeads.length}
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#161b22]">
                      <tr className="border-b border-[#30363d]">
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">#</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Phone</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Status</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Email</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Sentiment</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Brochure</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Interested Projects</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results
                        .sort((a, b) => a.row_index - b.row_index)
                        .map((r) => (
                          <tr key={r.row_index} className="border-b border-[#30363d]/50">
                            <td className="px-3 py-2 text-xs text-[#8b949e]">{r.row_index + 1}</td>
                            <td className="px-3 py-2 text-xs">{r.phone_number}</td>
                            <td className="px-3 py-2">
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-3 py-2">
                              <EmailBadge status={r.email_status || "not_requested"} />
                            </td>
                            <td className="px-3 py-2">
                              <SentimentBadge sentiment={r.sentiment} />
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {r.brochure_sent ? (
                                <span className="text-emerald-400">{r.brochure_sent}</span>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {r.interested_projects?.length
                                ? r.interested_projects.join(", ")
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs text-[#8b949e] max-w-xs truncate">
                              {r.remarks || "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Back button */}
            {!isRunning && (
              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#30363d] text-[#8b949e] hover:text-white text-sm transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Results ───────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Campaign Results</h2>
              <p className="text-sm text-[#8b949e]">
                Campaign complete! Download the enriched CSV with call summaries, email statuses, and project interests.
              </p>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-center">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-[#8b949e]">Total Leads</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-center">
                <p className="text-2xl font-bold text-emerald-400">{stats.called}</p>
                <p className="text-xs text-[#8b949e]">Called</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-center">
                <p className="text-2xl font-bold text-yellow-400">{stats.noAnswer}</p>
                <p className="text-xs text-[#8b949e]">No Answer</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-center">
                <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
                <p className="text-xs text-[#8b949e]">Failed</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-center">
                <p className="text-2xl font-bold text-purple-400">{stats.emailsSent}</p>
                <p className="text-xs text-[#8b949e]">Emails Sent</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] text-center">
                <p className="text-2xl font-bold text-blue-400">{stats.interested}</p>
                <p className="text-xs text-[#8b949e]">Interested</p>
              </div>
            </div>

            {/* Full results table */}
            <div className="rounded-xl border border-[#30363d] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#30363d] bg-[#161b22]">
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">#</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Phone</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Email</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Status</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Email Status</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Sentiment</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Brochure Sent</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Interested Projects</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results
                      .sort((a, b) => a.row_index - b.row_index)
                      .map((r) => (
                        <tr key={r.row_index} className="border-b border-[#30363d]/50 hover:bg-[#161b22]/50">
                          <td className="px-3 py-2 text-xs text-[#8b949e]">{r.row_index + 1}</td>
                          <td className="px-3 py-2 text-xs">{r.phone_number}</td>
                          <td className="px-3 py-2 text-xs">{r.lead_email || "—"}</td>
                          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          <td className="px-3 py-2"><EmailBadge status={r.email_status || "not_requested"} /></td>
                          <td className="px-3 py-2"><SentimentBadge sentiment={r.sentiment} /></td>
                          <td className="px-3 py-2 text-xs">
                            {r.brochure_sent ? (
                              <span className="text-emerald-400 font-medium">{r.brochure_sent}</span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {r.interested_projects?.length
                              ? r.interested_projects.join(", ")
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#8b949e] max-w-xs truncate">
                            {r.remarks || "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all"
              >
                <Download className="w-4 h-4" />
                Download Enriched CSV
              </button>
              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-[#30363d] text-[#8b949e] hover:text-white text-sm transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Start New Campaign
              </button>
              <button
                onClick={() => { fetchCrmLeads(); setStep(5); }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-medium transition-all"
              >
                <Users className="w-4 h-4" />
                View in CRM
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: CRM ────────────────────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">CRM — Lead Database</h2>
              <p className="text-sm text-[#8b949e]">
                All leads from your campaigns are synced here. Search, filter, and track client interactions.
              </p>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={crmSearch}
                  onChange={(e) => setCrmSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchCrmLeads(crmSearch, crmStatusFilter)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 pl-9 text-sm outline-none focus:border-emerald-500"
                  placeholder="Search by name or phone..."
                />
                <Users className="w-4 h-4 text-[#8b949e] absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <button
                onClick={() => fetchCrmLeads(crmSearch, crmStatusFilter)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-all"
              >
                Search
              </button>
              <select
                value={crmStatusFilter}
                onChange={(e) => {
                  setCrmStatusFilter(e.target.value);
                  fetchCrmLeads(crmSearch, e.target.value);
                }}
                className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="interested">Interested</option>
                <option value="converted">Converted</option>
                <option value="not_interested">Not Interested</option>
              </select>
            </div>

            {/* Load on mount */}
            {crmLeads.length === 0 && !crmLoading && (
              <div className="text-center py-8">
                <button
                  onClick={() => fetchCrmLeads()}
                  className="text-sm text-emerald-400 hover:text-emerald-300 underline"
                >
                  Load CRM Leads
                </button>
                <p className="text-xs text-[#8b949e] mt-2">
                  Click to load leads from your CRM database
                </p>
              </div>
            )}

            {/* Loading */}
            {crmLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                <span className="ml-2 text-sm text-[#8b949e]">Loading leads...</span>
              </div>
            )}

            {/* Leads table */}
            {crmLeads.length > 0 && (
              <div className="rounded-xl border border-[#30363d] overflow-hidden">
                <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-xs text-[#8b949e]">
                  {crmLeads.length} lead(s) found
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#161b22]">
                      <tr className="border-b border-[#30363d]">
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Name</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Phone</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Email</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Budget</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Location</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Property</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Interested Projects</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Last Call</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Status</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Sentiment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crmLeads.map((lead) => {
                        const cf = lead.custom_fields || {};
                        const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—";
                        return (
                          <tr
                            key={lead.id}
                            className="border-b border-[#30363d]/50 hover:bg-[#161b22]/50 cursor-pointer"
                            onClick={() => setSelectedCrmLead(selectedCrmLead?.id === lead.id ? null : lead)}
                          >
                            <td className="px-3 py-2 text-xs font-medium">{fullName}</td>
                            <td className="px-3 py-2 text-xs">{lead.phone}</td>
                            <td className="px-3 py-2 text-xs">{cf.email || "—"}</td>
                            <td className="px-3 py-2 text-xs">{cf.budget || "—"}</td>
                            <td className="px-3 py-2 text-xs">{cf.location || cf.city || "—"}</td>
                            <td className="px-3 py-2 text-xs">{cf.property_type || "—"}</td>
                            <td className="px-3 py-2 text-xs">
                              {cf.interested_projects?.length
                                ? cf.interested_projects.join(", ")
                                : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs text-[#8b949e]">
                              {cf.last_call_date
                                ? new Date(cf.last_call_date).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={cf.call_status || lead.status || "new"} />
                            </td>
                            <td className="px-3 py-2 text-xs">{cf.last_sentiment || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lead detail panel */}
            {selectedCrmLead && (
              <div className="p-5 rounded-xl bg-[#161b22] border border-[#30363d] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {[selectedCrmLead.first_name, selectedCrmLead.last_name].filter(Boolean).join(" ") || "Unknown Lead"}
                  </h3>
                  <button
                    onClick={() => setSelectedCrmLead(null)}
                    className="text-[#8b949e] hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    ["Phone", selectedCrmLead.phone],
                    ["Email", selectedCrmLead.custom_fields?.email],
                    ["Budget", selectedCrmLead.custom_fields?.budget],
                    ["Location", selectedCrmLead.custom_fields?.location || selectedCrmLead.custom_fields?.city],
                    ["Property Type", selectedCrmLead.custom_fields?.property_type],
                    ["Bedrooms", selectedCrmLead.custom_fields?.bedrooms],
                    ["Call Count", selectedCrmLead.custom_fields?.call_count],
                    ["Brochure Sent", selectedCrmLead.custom_fields?.brochure_sent],
                    ["Last Sentiment", selectedCrmLead.custom_fields?.last_sentiment],
                    ["Last Intent", selectedCrmLead.custom_fields?.last_intent],
                    ["Call Status", selectedCrmLead.custom_fields?.call_status],
                    ["Source Campaign", selectedCrmLead.custom_fields?.source_campaign],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[10px] text-[#8b949e] uppercase">{label}</p>
                      <p className="text-xs text-[#e6edf3]">
                        {Array.isArray(value) ? (value.length ? value.join(", ") : "—") : (value || "—")}
                      </p>
                    </div>
                  ))}
                </div>
                {selectedCrmLead.custom_fields?.notes && (
                  <div>
                    <p className="text-[10px] text-[#8b949e] uppercase mb-1">Notes</p>
                    <p className="text-xs text-[#e6edf3] bg-[#0d1117] rounded-lg p-3">
                      {selectedCrmLead.custom_fields.notes}
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-[#8b949e]">
                  Created: {new Date(selectedCrmLead.created_at).toLocaleString()} |
                  Updated: {new Date(selectedCrmLead.updated_at).toLocaleString()}
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setStep(4)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#30363d] text-[#8b949e] hover:text-white text-sm transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Results
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
