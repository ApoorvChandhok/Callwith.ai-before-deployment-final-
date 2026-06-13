"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot, Save, RotateCcw, Plus, Trash2, Link2, FileText, Upload,
  Mic, Volume2, Brain, Wrench, Phone, ChevronDown, ChevronUp,
  CheckCircle, AlertCircle, Loader2, Sparkles, Globe, Settings2,
  MessageSquare, Zap, X, RefreshCw
} from "lucide-react";
import type { ProviderCatalog, VoiceOption, ModelOption } from "@/lib/providers";
import { FALLBACK_CATALOG, STT_LANGUAGES } from "@/lib/providers";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Resource {
  type: "url" | "text" | "file";
  name: string;
  value: string;
}

interface CustomFunction {
  name: string;
  description: string;
  enabled: boolean;
}

interface AgentConfig {
  agent_name: string;
  call_description: string;
  system_prompt: string;
  initial_greeting: string;
  fallback_greeting: string;
  stt_provider: string;
  stt_model: string;
  stt_language: string;
  tts_provider: string;
  tts_voice: string;
  tts_language: string;
  tts_model: string;
  llm_provider: string;
  llm_model: string;
  llm_temperature: number;
  transfer_number: string;
  resources: Resource[];
  custom_functions: CustomFunction[];
}

// ─── Section Wrapper ────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, subtitle, children, defaultOpen = true, accentColor = "blue" }: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const colors: Record<string, string> = {
    blue: "text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10",
    purple: "text-purple-500 dark:text-[#a371f7] bg-purple-50 dark:bg-[#a371f7]/10",
    green: "text-green-500 dark:text-[#2ea043] bg-green-50 dark:bg-[#2ea043]/10",
    orange: "text-orange-500 dark:text-[#fb8f24] bg-orange-50 dark:bg-[#fb8f24]/10",
    cyan: "text-cyan-500 dark:text-[#39d2c0] bg-cyan-50 dark:bg-[#39d2c0]/10",
    pink: "text-pink-500 dark:text-[#f778ba] bg-pink-50 dark:bg-[#f778ba]/10",
    yellow: "text-yellow-600 dark:text-[#d29922] bg-yellow-50 dark:bg-[#d29922]/10",
  };

  return (
    <div className="bg-white/80 dark:bg-[#161b22]/60 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-white/10 shadow-xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-indigo-500/30">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-5 text-left hover:bg-white/40 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className={`p-2 rounded-lg ${colors[accentColor] || colors.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-[#e6edf3] text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-[#8b949e] mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-gray-200/50 dark:border-white/5 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Form Field Helpers ─────────────────────────────────────────────────────────
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-700 dark:text-[#8b949e] uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

function TextInput({ id, value, onChange, placeholder, type = "text" }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl border border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-black/20 backdrop-blur-sm text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all placeholder:text-gray-400 dark:placeholder:text-[#484f58]"
    />
  );
}

function TextArea({ id, value, onChange, placeholder, rows = 3 }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 rounded-xl border border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-black/20 backdrop-blur-sm text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all font-mono leading-relaxed resize-y placeholder:text-gray-400 dark:placeholder:text-[#484f58]"
    />
  );
}

interface SelectProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  loading?: boolean;
  liveSource?: boolean;
}

function Select({ id, value, onChange, options, loading, liveSource }: SelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-black/20 backdrop-blur-sm text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all cursor-pointer disabled:opacity-60 appearance-none pr-8"
      >
        {loading ? (
          <option>Loading...</option>
        ) : (
          options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))
        )}
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
        {liveSource && !loading && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Live data from provider API" />}
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function AgentConfigForm({ mode }: { mode: "inbound" | "outbound" }) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Dynamic provider catalog
  const [catalog, setCatalog] = useState<ProviderCatalog>(FALLBACK_CATALOG);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});

  // Resource add form state
  const [newResourceType, setNewResourceType] = useState<"url" | "text">("url");
  const [newResourceName, setNewResourceName] = useState("");
  const [newResourceValue, setNewResourceValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load provider catalog dynamically
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/providers");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setCatalog(data.catalog);
      setLiveStatus(data.live_fetched ?? {});
    } catch {
      // Keep fallback catalog
      console.warn("[AgentConfigForm] Provider catalog fetch failed, using fallback");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // Load config
  useEffect(() => {
    setLoading(true);
    fetch(`/api/agent-config?mode=${mode}`)
      .then((r) => r.json())
      .then((data) => {
        setConfig(data.config);
        setIsDirty(false);
      })
      .catch((e) => {
        showToast("error", "Failed to load configuration");
        console.error(e);
      })
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Helpers
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const update = useCallback(<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
    setIsDirty(true);
  }, []);

  // Save
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, config }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      // Clear provider cache so fresh data is fetched after key changes
      await fetch("/api/providers", { method: "DELETE" }).catch(() => {});
      showToast("success", "Configuration saved! Changes will apply on the next call.");
      setIsDirty(false);
    } catch (e: any) {
      showToast("error", `Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = async () => {
    setLoading(true);
    try {
      await fetch("/api/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, config: null }),
      });
      const fresh = await fetch(`/api/agent-config?mode=${mode}`).then(r => r.json());
      setConfig(fresh.config);
      setIsDirty(false);
      showToast("success", "Configuration reset to defaults.");
    } catch (e: any) {
      showToast("error", `Reset failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Resource management
  const addResource = () => {
    if (!config || !newResourceName.trim() || !newResourceValue.trim()) return;
    const resources = [...config.resources, { type: newResourceType, name: newResourceName.trim(), value: newResourceValue.trim() }];
    update("resources", resources);
    setNewResourceName("");
    setNewResourceValue("");
  };

  const removeResource = (idx: number) => {
    if (!config) return;
    const resources = config.resources.filter((_, i) => i !== idx);
    update("resources", resources);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !config) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("mode", mode);
      formData.append("file", file);
      const res = await fetch("/api/agent-config/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const resources = [...config.resources, data.resource as Resource];
      update("resources", resources);
      showToast("success", `File "${file.name}" uploaded successfully.`);
    } catch (e: any) {
      showToast("error", `Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Toggle function tool
  const toggleFunction = (idx: number) => {
    if (!config) return;
    const fns = [...config.custom_functions];
    fns[idx] = { ...fns[idx], enabled: !fns[idx].enabled };
    update("custom_functions", fns);
  };

  // ─── Derived catalog data ───────────────────────────────────────────────────
  const ttsProviderOptions = Object.entries(catalog.tts).map(([key, val]) => ({
    value: key,
    label: val.label,
  }));
  const llmProviderOptions = Object.entries(catalog.llm).map(([key, val]) => ({
    value: key,
    label: val.label,
  }));
  const sttProviderOptions = Object.entries(catalog.stt).map(([key, val]) => ({
    value: key,
    label: val.label,
  }));

  const currentTtsProvider = config?.tts_provider ?? "sarvam";
  const currentLlmProvider = config?.llm_provider ?? "groq";
  const currentSttProvider = config?.stt_provider ?? "deepgram";

  const ttsVoices: VoiceOption[] = catalog.tts[currentTtsProvider]?.voices ?? [];
  const ttsModels: ModelOption[] = catalog.tts[currentTtsProvider]?.models ?? [];
  const ttsLanguages: ModelOption[] = catalog.tts[currentTtsProvider]?.languages ?? STT_LANGUAGES;
  const llmModels: ModelOption[] = catalog.llm[currentLlmProvider]?.models ?? [];
  const sttModels: ModelOption[] = catalog.stt[currentSttProvider]?.models ?? [];

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const modeLabel = mode === "inbound" ? "Inbound" : "Outbound";
  const modeColorClass = mode === "inbound" ? "from-indigo-500 to-blue-500" : "from-purple-500 to-indigo-500";

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-10 relative">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium transition-all animate-in slide-in-from-right duration-300 ${
          toast.type === "success"
            ? "bg-green-50 dark:bg-[#2ea043]/10 text-green-700 dark:text-[#2ea043] border-green-200 dark:border-[#2ea043]/30"
            : "bg-red-50 dark:bg-[#da3633]/10 text-red-700 dark:text-[#da3633] border-red-200 dark:border-[#da3633]/30"
        }`}>
          {toast.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-[#e6edf3] flex items-center gap-3">
            <span className={`inline-block w-2.5 h-2.5 rounded-full bg-gradient-to-br ${modeColorClass}`} />
            {modeLabel} Agent Configuration
          </h2>
          <p className="text-gray-500 dark:text-[#8b949e] text-sm mt-1 flex items-center gap-2">
            Configure your AI voice agent without touching code. Changes apply on the next call.
            {!catalogLoading && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                Live provider data
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadCatalog}
            disabled={catalogLoading}
            title="Refresh provider catalog"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200/50 dark:border-white/10 text-gray-600 dark:text-[#8b949e] hover:bg-gray-100/50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl border border-gray-200/50 dark:border-white/10 text-gray-600 dark:text-[#8b949e] hover:bg-gray-100/50 dark:hover:bg-white/[0.03] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all shadow-sm ${
              isDirty
                ? "bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]"
                : "bg-gray-200/50 dark:bg-[#21262d]/50 text-gray-400 dark:text-[#484f58] cursor-not-allowed border border-gray-200/50 dark:border-white/5"
            }`}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>

      {/* Section 1: Agent Identity */}
      <Section icon={Bot} title="Agent Identity" subtitle="Name and purpose of this AI agent" accentColor="blue">
        <div>
          <Label htmlFor="agent_name">Agent Name</Label>
          <TextInput id="agent_name" value={config.agent_name} onChange={(v) => update("agent_name", v)} placeholder="e.g. Sales Advisor" />
        </div>
        <div>
          <Label htmlFor="call_description">What's this call about?</Label>
          <TextArea
            id="call_description"
            value={config.call_description}
            onChange={(v) => update("call_description", v)}
            placeholder="Brief description of the agent's purpose and what callers can expect..."
            rows={2}
          />
        </div>
      </Section>

      {/* Section 2: System Prompt & Greetings */}
      <Section icon={MessageSquare} title="System Prompt & Greetings" subtitle="The core instructions and personality for the AI" accentColor="purple">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="system_prompt">System Prompt</Label>
            <span className="text-[10px] text-gray-400 dark:text-[#484f58] font-mono">
              {config.system_prompt.length} chars
            </span>
          </div>
          <TextArea
            id="system_prompt"
            value={config.system_prompt}
            onChange={(v) => update("system_prompt", v)}
            placeholder="You are a helpful AI assistant..."
            rows={16}
          />
          <p className="text-[10px] text-gray-400 dark:text-[#484f58] mt-1">
            This is the main instruction set the LLM follows. Include persona, knowledge, rules, and communication style.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="initial_greeting">Initial Greeting</Label>
            <TextArea
              id="initial_greeting"
              value={config.initial_greeting}
              onChange={(v) => update("initial_greeting", v)}
              placeholder="What the agent says when the call starts..."
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="fallback_greeting">Fallback Greeting</Label>
            <TextArea
              id="fallback_greeting"
              value={config.fallback_greeting}
              onChange={(v) => update("fallback_greeting", v)}
              placeholder="Greeting if already connected..."
              rows={3}
            />
          </div>
        </div>
      </Section>

      {/* Section 3: Resources / Knowledge Base */}
      <Section icon={Sparkles} title="Resources & Knowledge Base" subtitle="Add URLs, files, or text content as reference material for the AI" accentColor="cyan">
        {config.resources.length > 0 && (
          <div className="space-y-2">
            {config.resources.map((res, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm border border-gray-200/50 dark:border-white/5 group"
              >
                <div className={`p-1.5 rounded-lg mt-0.5 ${
                  res.type === "url" ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500" :
                  res.type === "file" ? "bg-green-50 dark:bg-[#2ea043]/10 text-green-500 dark:text-[#2ea043]" :
                  "bg-purple-50 dark:bg-[#a371f7]/10 text-purple-500 dark:text-[#a371f7]"
                }`}>
                  {res.type === "url" ? <Globe className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-[#e6edf3] truncate">{res.name}</p>
                  <p className="text-xs text-gray-400 dark:text-[#484f58] mt-0.5 truncate font-mono">
                    {res.type === "url" ? res.value : `${res.value.substring(0, 80)}${res.value.length > 80 ? "..." : ""}`}
                  </p>
                </div>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-gray-200 dark:bg-[#30363d] text-gray-500 dark:text-[#8b949e]">
                  {res.type}
                </span>
                <button
                  onClick={() => removeResource(idx)}
                  className="p-1 text-gray-300 dark:text-[#484f58] hover:text-red-500 dark:hover:text-[#da3633] opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="border border-dashed border-gray-200/80 dark:border-white/10 rounded-xl p-5 space-y-4 bg-white/20 dark:bg-black/10 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewResourceType("url")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                newResourceType === "url"
                  ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 shadow-sm"
                  : "text-gray-500 dark:text-[#8b949e] border-gray-200/50 dark:border-white/10 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
              }`}
            >
              <Link2 className="w-3 h-3" />URL
            </button>
            <button
              onClick={() => setNewResourceType("text")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                newResourceType === "text"
                  ? "bg-purple-50 dark:bg-[#a371f7]/10 text-purple-600 dark:text-[#a371f7] border-purple-200 dark:border-[#a371f7]/30 shadow-sm"
                  : "text-gray-500 dark:text-[#8b949e] border-gray-200/50 dark:border-white/10 hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
              }`}
            >
              <FileText className="w-3 h-3" />Text
            </button>
            <div className="border-l border-gray-200/50 dark:border-white/10 h-5 mx-1" />
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.md,.csv,.json" className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border text-gray-500 dark:text-[#8b949e] border-gray-200/50 dark:border-white/10 hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-all"
            >
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Upload File
            </button>
          </div>
          <TextInput
            id="resource_name"
            value={newResourceName}
            onChange={setNewResourceName}
            placeholder={newResourceType === "url" ? "Resource name (e.g. Product Website)" : "Resource name (e.g. Product FAQ)"}
          />
          <div>
            {newResourceType === "url" ? (
              <TextInput id="resource_value" value={newResourceValue} onChange={setNewResourceValue} placeholder="https://example.com/product-info" type="url" />
            ) : (
              <TextArea id="resource_value" value={newResourceValue} onChange={setNewResourceValue} placeholder="Paste your knowledge base content here..." rows={4} />
            )}
          </div>
          <button
            onClick={addResource}
            disabled={!newResourceName.trim() || !newResourceValue.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white hover:from-indigo-600 hover:to-violet-700 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Add Resource
          </button>
        </div>
        {config.resources.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-[#484f58] text-center py-2">
            No resources added yet. Add URLs, text content, or upload files to expand the AI&apos;s knowledge.
          </p>
        )}
      </Section>

      {/* Section 4: Voice & Speech Settings — FULLY DYNAMIC */}
      <Section icon={Volume2} title="Voice & Speech Settings" subtitle="Text-to-speech and speech-to-text configuration" accentColor="green">
        {/* Live indicator */}
        {!catalogLoading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8b949e] bg-green-50 dark:bg-green-500/5 border border-green-200/50 dark:border-green-500/20 rounded-lg px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
            Voice options fetched live from provider APIs
            <button onClick={loadCatalog} className="ml-auto text-green-600 dark:text-green-400 hover:underline flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        )}

        {/* TTS Provider → Model → Voice (3-column) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="tts_provider">TTS Provider</Label>
            <Select
              id="tts_provider"
              value={config.tts_provider}
              onChange={(v) => {
                update("tts_provider", v);
                // Auto-select first voice & model for the new provider
                const voices = catalog.tts[v]?.voices ?? [];
                const models = catalog.tts[v]?.models ?? [];
                if (voices.length > 0) update("tts_voice", voices[0].value);
                if (models.length > 0) update("tts_model", models[0].value);
              }}
              options={ttsProviderOptions}
              loading={catalogLoading}
            />
          </div>
          <div>
            <Label htmlFor="tts_model">TTS Model</Label>
            <Select
              id="tts_model"
              value={config.tts_model ?? ttsModels[0]?.value ?? ""}
              onChange={(v) => update("tts_model", v)}
              options={ttsModels}
              loading={catalogLoading}
              liveSource={liveStatus.sarvam_voices && currentTtsProvider === "sarvam"}
            />
          </div>
          <div>
            <Label htmlFor="tts_voice">Voice</Label>
            <Select
              id="tts_voice"
              value={config.tts_voice}
              onChange={(v) => update("tts_voice", v)}
              options={ttsVoices.map(v => ({
                value: v.value,
                label: v.gender ? `${v.label} (${v.gender === "female" ? "♀" : v.gender === "male" ? "♂" : "◈"})` : v.label
              }))}
              loading={catalogLoading}
              liveSource={!!liveStatus.sarvam_voices || !!liveStatus.cartesia_voices}
            />
          </div>
        </div>

        {/* Language (only for Sarvam and other multi-language providers) */}
        {catalog.tts[currentTtsProvider]?.languages && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tts_language">Language</Label>
              <Select
                id="tts_language"
                value={config.tts_language}
                onChange={(v) => update("tts_language", v)}
                options={ttsLanguages}
                loading={catalogLoading}
              />
            </div>
          </div>
        )}

        {/* STT */}
        <div className="border-t border-gray-100 dark:border-[#30363d]/50 pt-4">
          <p className="text-xs font-semibold text-gray-700 dark:text-[#8b949e] uppercase tracking-wider mb-3">Speech-to-Text (STT)</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="stt_provider">STT Provider</Label>
              <Select
                id="stt_provider"
                value={config.stt_provider ?? "deepgram"}
                onChange={(v) => {
                  update("stt_provider", v);
                  const models = catalog.stt[v]?.models ?? [];
                  if (models.length > 0) update("stt_model", models[0].value);
                }}
                options={sttProviderOptions}
                loading={catalogLoading}
              />
            </div>
            <div>
              <Label htmlFor="stt_model">STT Model</Label>
              <Select
                id="stt_model"
                value={config.stt_model}
                onChange={(v) => update("stt_model", v)}
                options={sttModels}
                loading={catalogLoading}
                liveSource={!!liveStatus.deepgram_models}
              />
            </div>
            <div>
              <Label htmlFor="stt_language">STT Language</Label>
              <Select
                id="stt_language"
                value={config.stt_language}
                onChange={(v) => update("stt_language", v)}
                options={STT_LANGUAGES}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Section 5: LLM Settings — FULLY DYNAMIC */}
      <Section icon={Brain} title="LLM Settings" subtitle="Large language model provider and parameters" accentColor="orange">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="llm_provider">LLM Provider</Label>
            <Select
              id="llm_provider"
              value={config.llm_provider}
              onChange={(v) => {
                update("llm_provider", v);
                const models = catalog.llm[v]?.models ?? [];
                if (models.length > 0) update("llm_model", models[0].value);
              }}
              options={llmProviderOptions}
              loading={catalogLoading}
            />
          </div>
          <div>
            <Label htmlFor="llm_model">Model</Label>
            <Select
              id="llm_model"
              value={config.llm_model}
              onChange={(v) => update("llm_model", v)}
              options={llmModels}
              loading={catalogLoading}
              liveSource={!!liveStatus.groq_models || !!liveStatus.openai_models}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="llm_temperature">Temperature</Label>
            <span className="text-xs font-mono text-gray-500 dark:text-[#8b949e] bg-gray-100 dark:bg-[#21262d] px-2 py-0.5 rounded">
              {config.llm_temperature.toFixed(2)}
            </span>
          </div>
          <input
            id="llm_temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.llm_temperature}
            onChange={(e) => update("llm_temperature", parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-[#484f58] mt-1">
            <span>Precise (0.0)</span>
            <span>Creative (1.0)</span>
          </div>
        </div>
      </Section>

      {/* Section 6: Functions / Tools */}
      <Section icon={Wrench} title="Functions & Tools" subtitle="Enable or disable built-in AI agent capabilities" accentColor="yellow">
        <div className="space-y-2">
          {config.custom_functions.map((fn, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                fn.enabled
                  ? "bg-green-50/50 dark:bg-[#2ea043]/10 border-green-200 dark:border-[#2ea043]/20 shadow-sm"
                  : "bg-white/40 dark:bg-white/[0.02] backdrop-blur-sm border-gray-200/50 dark:border-white/5"
              }`}
            >
              <button
                onClick={() => toggleFunction(idx)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  fn.enabled ? "bg-green-500 dark:bg-[#2ea043]" : "bg-gray-300 dark:bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    fn.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-[#e6edf3] font-mono">{fn.name}</p>
                <p className="text-xs text-gray-500 dark:text-[#8b949e]">{fn.description}</p>
              </div>
              <Zap className={`w-4 h-4 ${fn.enabled ? "text-green-500 dark:text-[#2ea043]" : "text-gray-300 dark:text-[#30363d]"}`} />
            </div>
          ))}
        </div>

        <div className="border-t border-gray-100 dark:border-[#30363d]/50 pt-4">
          <Label htmlFor="transfer_number">Default Transfer Number</Label>
          <TextInput
            id="transfer_number"
            value={config.transfer_number}
            onChange={(v) => update("transfer_number", v)}
            placeholder="+91XXXXXXXXXX"
            type="tel"
          />
          <p className="text-[10px] text-gray-400 dark:text-[#484f58] mt-1">
            Phone number to transfer calls to when the transfer function is triggered.
          </p>
        </div>
      </Section>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200/50 dark:border-white/5 bg-white/70 dark:bg-[#161b22]/70 backdrop-blur-xl py-4 px-8 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.1)]">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 dark:text-[#c9d1d9] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
              You have unsaved changes
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200/50 dark:border-white/10 text-gray-600 dark:text-[#8b949e] hover:bg-gray-100/50 dark:hover:bg-white/[0.03] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-all"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
