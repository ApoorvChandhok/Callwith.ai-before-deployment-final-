"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Users, Play, Download, CheckCircle2,
  Loader2, ChevronRight, ChevronLeft, CarFront, Phone,
  RefreshCw, Trash2, Plus, X, Globe,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  interested_cars?: string[];
  test_drive_booked?: string;
  car_requirements?: { budget?: string; brand?: string; car_type?: string; new_used?: string };
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
  const XLSXModule = await import("xlsx");
  const XLSX = XLSXModule.default || XLSXModule;
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

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, { color: string; bg: string; icon: string }> = {
    positive: { color: "#3fb950", bg: "rgba(63,185,80,0.15)", icon: "\u{1F60A}" },
    neutral: { color: "#d29922", bg: "rgba(210,153,34,0.15)", icon: "\u{1F610}" },
    negative: { color: "#f85149", bg: "rgba(248,81,73,0.15)", icon: "\u{1F61E}" },
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

// ── Default System Prompt ─────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `Tum Neha ho — AutoVerse dealership ki experienced car sales consultant ho. Tumhe 8 saal ka experience hai. Tum natural Hinglish bolti ho jaise Delhi mein log baat karte hain.

# TUMHARI PERSONALITY
- Friendly ho par pushy nahi
- Genuinely interested ho customer ki needs mein
- Natural fillers use karo: "Haan ji", "Bilkul", "Achha", "Samajh gayi"
- Har baar alag respond karo — kabhi script mat lagao
- Agar budget tight hai toh affordable options suggest karo bina judgment ke

# BAAT KA FLOW — SABSE ZAROORI

## STEP 1 — Greeting & Rapport (30 second)
Tumhara intro: "Hi! Main Neha hoon, AutoVerse se."
Customer ka jawaab suno — "Kaise hain aap?" ya kuch bhi bole.
Phir naturally poocho: "Achha, humari website dekhi thi kya? Koi gaadi pasand aayi ya bas dekh rahe the?"
Ya: "Aap gaadi badalna chahte hain ya pehli gaadi leni hai?"

## STEP 2 — Need Discovery (2-3 minute)
Jab customer bole ki gaadi chahiye, tab naturally poocho:

**Purpose:**
- "Kis liye chahiye — daily commute, family, ya travel?"
- "City mein chalayenge ya highway bhi?"

**Budget:**
- "Kitne budget mein dekh rahe hain?"
- "Ek range bata do — kitna tak ja sakte hain?"

**Car Preferences:**
- "Naya chahiye ya pre-owned?"
- "Sedan, SUV, ya hatchback — kya pasand hai?"
- "Koi brand hai jo specifically dekh rahe hain?"
- "Family kitne log hain?"

## STEP 3 — Recommendation (2-3 minute)
Knowledge base se 1-2 cars recommend karo:
1. "Aapke liye [Car] bahut achha rahega kyunki..."
2. Key features (2-3 max): mileage, safety, comfort
3. Price batao — EMI available hai

## STEP 4 — Objection Handling
- "Mehnga hai": EMI options batao, used car suggest karo
- "Brand chahiye": Agar hai toh batao, nahi hai toh similar suggest karo
- "Abhi nahi chahiye": Number lo, test drive offer karo

## STEP 5 — Test Drive
Agar interested hain:
- "Test drive ke liye aa sakte hain? Kaunsa din convenient?"
- Location batao: Janakpuri, Palam, ya Rajouri Garden

## STEP 6 — Closing
- Number zaroor lo follow-up ke liye
- "Bahut shukriya! Apna khayal rakhiye."

# KNOWLEDGE BASE
Neeche diye gaye cars ki information use karo. Sirf wohi batao jo knowledge base mein hai.

# RULES — KABHI TODNA MAT
1. Car details mat uchhalo — sirf knowledge base se batao
2. Customer ko push mat karo — helpful bano
3. Call khatam karne se pehle phone number zaroor lo
4. Test drive offer karo — yeh best closing hai
5. 1-2 sentences se zyada mat bolo
6. Agar kuch nahi pata toh bolo "Ek minute, check karti hoon"
7. Kabhi mat bolo "main AI hoon" — tum Neha ho, real person
8. Numbers words mein bolo: "paanch lakh", "das baje"

# COMPARISONS — Jab customer puche "ye better hai ya wo"
Knowledge base mein comparisons diye gaye hain. Unhe use karo:
- Compact SUV: Creta vs Seltos vs Brezza vs Nexon
- Sedan: City vs Verna vs Slavia vs Dzire
- Luxury EV: BYD Seal vs BMW i4 vs Mercedes EQA
- Budget EV: Nexon EV vs MG ZS vs BYD Atto 3
- SUV vs Sedan: Creta vs City

Comparison ke time:
1. Dono cars ke pros batao
2. Customer ki needs ke hisaab se recommend karo
3. Price, mileage, safety — teeno compare karo
4. "Aapke liye [Car] better hai kyunki..." — clear recommendation do`;

const LLM_OPTIONS: Record<string, { value: string; label: string }[]> = {
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Fast)" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
  ],
  google: [
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  ],
  openai: [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  ],
};

const TTS_VOICES: Record<string, { group: string; options: { value: string; label: string }[] }[]> = {
  sarvam: [
    { group: "Female", options: [
      { value: "neha", label: "Neha" }, { value: "priya", label: "Priya" },
      { value: "ishita", label: "Ishita" }, { value: "shreya", label: "Shreya" },
      { value: "pooja", label: "Pooja" }, { value: "simran", label: "Simran" },
      { value: "kavya", label: "Kavya" }, { value: "ritu", label: "Ritu" },
    ]},
    { group: "Male", options: [
      { value: "rahul", label: "Rahul" }, { value: "rohan", label: "Rohan" },
      { value: "aditya", label: "Aditya" }, { value: "kabir", label: "Kabir" },
      { value: "varun", label: "Varun" },
    ]},
  ],
  deepgram: [{ group: "", options: [
    { value: "aura-asteria-en", label: "Asteria (F)" }, { value: "aura-luna-en", label: "Luna (F)" },
    { value: "aura-stella-en", label: "Stella (F)" }, { value: "aura-orion-en", label: "Orion (M)" },
    { value: "aura-arcas-en", label: "Arcas (M)" },
  ]}],
  cartesia: [{ group: "", options: [{ value: "bf0ba16d-90e2-43d4-a19a-c5bfb3e16586", label: "Sonic (Default)" }] }],
  openai: [{ group: "", options: [
    { value: "alloy", label: "Alloy" }, { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" }, { value: "onyx", label: "Onyx" },
    { value: "nova", label: "Nova" }, { value: "shimmer", label: "Shimmer" },
  ]}],
};

const LANG_OPTIONS = [
  { value: "hi-IN", label: "Hindi" }, { value: "en-IN", label: "English" },
  { value: "ta-IN", label: "Tamil" }, { value: "te-IN", label: "Telugu" },
  { value: "mr-IN", label: "Marathi" }, { value: "gu-IN", label: "Gujarati" },
  { value: "bn-IN", label: "Bengali" }, { value: "kn-IN", label: "Kannada" },
  { value: "ml-IN", label: "Malayalam" }, { value: "pa-IN", label: "Punjabi" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function CarDealershipPage() {
  // Wizard state
  const [step, setStep] = useState(1);

  // Step 1: Knowledge Base (RAG)
  const [ragUrls, setRagUrls] = useState<{ url: string; content: string }[]>([]);
  const [ragFiles, setRagFiles] = useState<{ name: string; content: string }[]>([]);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragUrlInput, setRagUrlInput] = useState("");
  const ragFileRef = useRef<HTMLInputElement>(null);

  // System prompt
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  // Step 2: Leads
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadColumns, setLeadColumns] = useState<string[]>([]);
  const [phoneColumn, setPhoneColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");
  const leadsFileRef = useRef<HTMLInputElement>(null);

  // Step 3: Campaign
  const [campaignId, setCampaignId] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<CampaignResult[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);

  // Voice / LLM config
  const [llmProvider, setLlmProvider] = useState("google");
  const [llmModel, setLlmModel] = useState("gemini-2.5-flash");
  const [ttsProvider, setTtsProvider] = useState("sarvam");
  const [ttsVoice, setTtsVoice] = useState("neha");
  const [ttsLanguage, setTtsLanguage] = useState("hi-IN");

  // Step 4: Results
  const [downloadReady, setDownloadReady] = useState(false);

  // ── Config Persistence (user-specific) ──────────────────────────────────────
  const [userEmail, setUserEmail] = useState<string>("");
  const [configName, setConfigName] = useState("");
  const [savedConfigs, setSavedConfigs] = useState<Record<string, any>>({});
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newConfigName, setNewConfigName] = useState("");

  // Get current user email on mount
  useEffect(() => {
    const getUserEmail = async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setUserEmail(user.email);
      } catch {}
    };
    getUserEmail();
  }, []);

  // User-specific localStorage key
  const getConfigKey = () => userEmail ? `cd_campaign_configs_${userEmail}` : "cd_campaign_configs";

  const loadConfigsFromStorage = (): Record<string, any> => {
    try {
      const raw = localStorage.getItem(getConfigKey());
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const persistConfigs = (configs: Record<string, any>) => {
    localStorage.setItem(getConfigKey(), JSON.stringify(configs));
    setSavedConfigs(configs);
  };

  const saveCurrentConfig = (name: string) => {
    const config = {
      ragUrls, ragFiles, customPrompt, leads, leadColumns,
      phoneColumn, nameColumn, llmProvider, llmModel,
      ttsProvider, ttsVoice, ttsLanguage,
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
    setRagUrls(config.ragUrls || []);
    setRagFiles(config.ragFiles || []);
    setCustomPrompt(config.customPrompt || DEFAULT_SYSTEM_PROMPT);
    setLeads(config.leads || []);
    setLeadColumns(config.leadColumns || []);
    setPhoneColumn(config.phoneColumn || "");
    setNameColumn(config.nameColumn || "");
    setLlmProvider(config.llmProvider || "groq");
    setLlmModel(config.llmModel || "llama-3.3-70b-versatile");
    setTtsProvider(config.ttsProvider || "sarvam");
    setTtsVoice(config.ttsVoice || "neha");
    setTtsLanguage(config.ttsLanguage || "hi-IN");
    setConfigName(name);
  };

  const deleteConfig = (name: string) => {
    const updated = { ...savedConfigs };
    delete updated[name];
    persistConfigs(updated);
    if (configName === name) setConfigName("");
  };

  // Auto-load most recent config on mount (wait for userEmail)
  useEffect(() => {
    if (!userEmail) return;
    const configs = loadConfigsFromStorage();
    setSavedConfigs(configs);
    const names = Object.keys(configs);
    if (names.length > 0) {
      const latest = names.reduce((a, b) =>
        (configs[a].savedAt || "") > (configs[b].savedAt || "") ? a : b
      );
      loadConfig(latest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  // ── Step 1: RAG / Knowledge Base ─────────────────────────────────────────

  const handleAddUrl = async () => {
    const url = ragUrlInput.trim();
    if (!url) return;
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
        if (ragFiles.some((f) => f.name === file.name)) continue;
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

  const MAX_RAG_CHARS = 6000;

  const buildRagContent = useCallback(() => {
    const parts: string[] = [];
    const budget = Math.floor(MAX_RAG_CHARS / Math.max(1, ragUrls.length + ragFiles.length));
    for (const item of ragUrls) {
      const hostname = (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })();
      const content = item.content.substring(0, budget).trim();
      if (content) parts.push(`### From: ${hostname}\n${content}`);
    }
    for (const item of ragFiles) {
      const content = item.content.substring(0, budget).trim();
      if (content) parts.push(`### From: ${item.name}\n${content}`);
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
      const phoneCol = parsed.columns.find((c) => /phone|mobile|cell|number/i.test(c));
      const nameCol = parsed.columns.find((c) => /^name$|first.?name|lead.?name/i.test(c));
      if (phoneCol) setPhoneColumn(phoneCol);
      if (nameCol) setNameColumn(nameCol);
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
    const ragContent = buildRagContent();
    if (ragContent.trim()) {
      prompt += `\n\n## KNOWLEDGE BASE\nUse the following documents to answer client questions about car inventory. Only reference what is explicitly mentioned in these documents.\n\n${ragContent}`;
    }
    return prompt;
  }, [customPrompt, buildRagContent]);

  const startCampaign = async () => {
    if (validLeads.length === 0) return;

    cancelRef.current = false;
    setCancelled(false);
    setIsRunning(true);
    setCurrentIndex(0);
    setResults([]);
    setDownloadReady(false);

    try {
      const initRes = await fetch("/api/car-dealership/start-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadsCount: validLeads.length,
          ragContent: buildRagContent(),
        }),
      });
      const initData = await initRes.json();
      const campId = initData.campaignId;
      setCampaignId(campId);

      const systemPrompt = buildSystemPrompt();

      console.log("[Campaign] Starting car dealership campaign");
      console.log(`[Campaign] System prompt: ${systemPrompt.length} chars`);
      console.log(`[Campaign] RAG sources: ${ragUrls.length} URLs, ${ragFiles.length} files`);

      for (let i = 0; i < validLeads.length; i++) {
        if (cancelRef.current) break;
        setCurrentIndex(i);
        const lead = validLeads[i];
        const phone = lead[phoneColumn]?.trim();
        const name = nameColumn ? lead[nameColumn]?.trim() : "";

        if (!phone) continue;

        try {
          await fetch("/api/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              phoneNumber: phone,
              systemPrompt,
              ragContent: buildRagContent(),
              leadName: name,
              leadData: lead,
              campaignId: campId,
              leadRowIndex: leads.indexOf(lead),
              overrideSystemPrompt: true,
              initialGreeting: `Hi! Main Neha hoon, AutoVerse se. Kaise hain aap?`,
              modelProvider: llmProvider,
              ttsProvider,
              voice: ttsVoice,
              ttsLanguage,
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
              break;
            }
          } catch { /* continue polling */ }
        }
      }

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
      const res = await fetch("/api/car-dealership/download-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, leads, columns: leadColumns }),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `car_dealership_${campaignId}_results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    }
  };

  const resetAll = () => {
    setStep(1);
    setRagUrls([]);
    setRagFiles([]);
    setRagUrlInput("");
    setLeads([]);
    setLeadColumns([]);
    setPhoneColumn("");
    setNameColumn("");
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
    interested: results.filter(
      (r) => r.interested_cars && r.interested_cars.length > 0
    ).length,
  };

  // ── Step Indicator ────────────────────────────────────────────────────────

  const steps = [
    { num: 1, label: "Knowledge Base", icon: FileText },
    { num: 2, label: "Leads", icon: Users },
    { num: 3, label: "Campaign", icon: Phone },
    { num: 4, label: "Results", icon: Download },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#161b22]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <CarFront className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold">Car Dealership AI Calling Agent</h1>
              <p className="text-sm text-[#8b949e]">
                Upload car inventory & leads -- AI calls, profiles customers, and books test drives
              </p>
            </div>

            {/* Config Manager */}
            <div className="flex items-center gap-2">
              {configName && (
                <span className="text-xs text-blue-400 bg-blue-400/10 px-2 py-1 rounded-lg border border-blue-400/20">
                  {configName}
                </span>
              )}
              {Object.keys(savedConfigs).length > 0 && (
                <select
                  value={configName}
                  onChange={(e) => { if (e.target.value) loadConfig(e.target.value); }}
                  className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500 max-w-[160px]"
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
                    className="bg-[#0d1117] border border-[#30363d] rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500 w-32"
                    placeholder="Config name..."
                    autoFocus
                  />
                  <button
                    onClick={() => newConfigName.trim() && saveCurrentConfig(newConfigName.trim())}
                    className="text-xs px-2 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
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
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[#30363d] text-[#8b949e] hover:text-blue-400 hover:border-blue-500/50 transition-all flex items-center gap-1"
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
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
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
                Campaign running
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ── Step 1: Knowledge Base ───────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            {isRunning && (
              <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm flex items-center justify-between">
                <span>Viewing in read-only mode -- campaign is running.</span>
                <button onClick={() => setStep(3)} className="text-xs underline hover:text-yellow-300">
                  Back to Campaign
                </button>
              </div>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-1">Car Inventory Knowledge Base</h2>
              <p className="text-sm text-[#8b949e]">
                Upload your car inventory files or add URLs. The AI agent will use this to recommend cars during calls.
              </p>
            </div>

            {/* System Prompt Editor */}
            <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">System Prompt</h3>
                  <p className="text-xs text-[#8b949e]">
                    Edit the AI agent prompt. Knowledge base content is appended automatically.
                  </p>
                </div>
                <button
                  onClick={() => setCustomPrompt(DEFAULT_SYSTEM_PROMPT)}
                  className="text-xs text-[#8b949e] hover:text-blue-400 transition-colors"
                >
                  Reset to default
                </button>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={isRunning}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 resize-none font-mono disabled:opacity-60"
                rows={10}
                placeholder="Type your AI agent prompt here..."
              />
              <div className="flex items-center gap-4 mt-2">
                <span className="text-xs text-[#8b949e]">{customPrompt.length} chars</span>
                <span className="text-xs text-[#8b949e]">
                  Knowledge base with {ragUrls.length + ragFiles.length} source(s) will be appended
                </span>
              </div>
            </div>

            {/* RAG / Knowledge Base */}
            <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <CarFront className="w-4 h-4 text-blue-400" />
                    Car Inventory / Knowledge Base
                  </h3>
                  <p className="text-xs text-[#8b949e]">
                    Add inventory lists, spec sheets, or website URLs for the AI agent to reference.
                  </p>
                </div>
                {(ragUrls.length > 0 || ragFiles.length > 0) && !isRunning && (
                  <button
                    onClick={() => { setRagUrls([]); setRagFiles([]); }}
                    className="text-xs text-[#8b949e] hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
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
                  placeholder="https://yourdealership.com/inventory"
                />
                <button
                  onClick={handleAddUrl}
                  disabled={isRunning || ragUploading || !ragUrlInput.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add URL
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
                    Click to upload PDF, DOCX, TXT, or CSV inventory files
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
                    {(ragUrls.length + ragFiles.length)} source(s) -- {(ragUrls.reduce((s, r) => s + r.content.length, 0) + ragFiles.reduce((s, r) => s + r.content.length, 0)).toLocaleString()} total chars will be appended to the prompt
                  </p>
                </div>
              )}
            </div>

            {/* Next button */}
            <div className="flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all"
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
                <span>Viewing in read-only mode -- campaign is running.</span>
                <button onClick={() => setStep(3)} className="text-xs underline hover:text-yellow-300">
                  Back to Campaign
                </button>
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold mb-1">Upload Leads CSV</h2>
              <p className="text-sm text-[#8b949e]">
                Upload a CSV or Excel file with your leads. Map the phone and name columns.
              </p>
            </div>

            {/* Upload area */}
            <div
              onClick={() => !isRunning && leadsFileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-[#161b22]/50 ${
                isRunning
                  ? "border-[#30363d] cursor-not-allowed opacity-60"
                  : "border-[#30363d] hover:border-blue-500/50 cursor-pointer"
              }`}
            >
              <Upload className="w-8 h-8 text-[#8b949e] mx-auto mb-3" />
              <p className="text-sm text-[#8b949e]">Click to upload CSV or Excel file</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Phone Column *</label>
                    <select
                      value={phoneColumn}
                      onChange={(e) => setPhoneColumn(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                    Preview -- {validLeads.length} valid leads (showing first 5)
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#30363d]">
                          {leadColumns.slice(0, 6).map((col) => (
                            <th key={col} className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">
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
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={validLeads.length === 0 || !phoneColumn}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
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
                Set up voice and LLM options before starting the campaign.
              </p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Knowledge Sources</p>
                <p className="text-2xl font-bold text-blue-400">{ragUrls.length + ragFiles.length}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Leads</p>
                <p className="text-2xl font-bold text-emerald-400">{validLeads.length}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
                <p className="text-xs text-[#8b949e]">Called</p>
                <p className="text-2xl font-bold text-white">{stats.called}</p>
              </div>
            </div>

            {/* Voice / LLM Config */}
            {!isRunning && (
              <div className="p-5 rounded-xl bg-[#161b22] border border-[#30363d] space-y-5">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-400" />
                  Voice & AI Configuration
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">LLM Provider</label>
                    <select
                      value={llmProvider}
                      onChange={(e) => setLlmProvider(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      <option value="groq">Groq</option>
                      <option value="google">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">LLM Model</label>
                    <select
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {(LLM_OPTIONS[llmProvider] || []).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">TTS Provider</label>
                    <select
                      value={ttsProvider}
                      onChange={(e) => setTtsProvider(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
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
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {(TTS_VOICES[ttsProvider] || []).map((g) =>
                        g.group ? (
                          <optgroup key={g.group} label={g.group}>
                            {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </optgroup>
                        ) : g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#8b949e] mb-1">Language</label>
                    <select
                      value={ttsLanguage}
                      onChange={(e) => setTtsLanguage(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {LANG_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Progress bar */}
            {isRunning && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-[#8b949e]">
                  <span>Calling lead {currentIndex + 1} of {validLeads.length}</span>
                  <span>{Math.round(((currentIndex + 1) / validLeads.length) * 100)}%</span>
                </div>
                <div className="h-2 bg-[#21262d] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                    style={{ width: `${((currentIndex + 1) / validLeads.length) * 100}%` }}
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
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all"
                >
                  <Play className="w-4 h-4" /> Start Campaign
                </button>
              )}
              {isRunning && (
                <button
                  onClick={cancelCampaign}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-red-600/20 border border-red-500/30 hover:bg-red-600/30 text-red-400 text-sm font-medium transition-all"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
              {downloadReady && (
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all"
                >
                  View Results <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Live results table */}
            {results.length > 0 && (
              <div className="rounded-xl border border-[#30363d] overflow-hidden">
                <div className="px-4 py-2 bg-[#161b22] border-b border-[#30363d] text-xs text-[#8b949e]">
                  Live Results -- {results.length} of {validLeads.length}
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#161b22]">
                      <tr className="border-b border-[#30363d]">
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">#</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Phone</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Status</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Sentiment</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Interested Cars</th>
                        <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Test Drive</th>
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
                            <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                            <td className="px-3 py-2"><SentimentBadge sentiment={r.sentiment} /></td>
                            <td className="px-3 py-2 text-xs">
                              {r.interested_cars?.length ? r.interested_cars.join(", ") : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {r.test_drive_booked ? (
                                <span className="text-emerald-400">{r.test_drive_booked}</span>
                              ) : "—"}
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
                  <ChevronLeft className="w-4 h-4" /> Back
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
                Campaign complete! Download the enriched CSV with call summaries, sentiments, and car interests.
              </p>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Status</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Sentiment</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Interested Cars</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Test Drive</th>
                      <th className="px-3 py-2 text-left text-xs text-[#8b949e] font-medium">Car Requirements</th>
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
                          <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                          <td className="px-3 py-2"><SentimentBadge sentiment={r.sentiment} /></td>
                          <td className="px-3 py-2 text-xs">
                            {r.interested_cars?.length ? r.interested_cars.join(", ") : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {r.test_drive_booked ? (
                              <span className="text-emerald-400 font-medium">{r.test_drive_booked}</span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-2 text-xs text-[#8b949e]">
                            {r.car_requirements
                              ? [r.car_requirements.budget, r.car_requirements.brand, r.car_requirements.car_type, r.car_requirements.new_used].filter(Boolean).join(", ")
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
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all"
              >
                <Download className="w-4 h-4" /> Download Enriched CSV
              </button>
              <button
                onClick={resetAll}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl border border-[#30363d] text-[#8b949e] hover:text-white text-sm transition-all"
              >
                <RefreshCw className="w-4 h-4" /> Start New Campaign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
