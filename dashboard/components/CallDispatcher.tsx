"use client";

import { useState, useEffect, useRef } from 'react';
import {
    Phone, Loader2, RefreshCw, ChevronDown, Play, StopCircle, Globe,
    Bot, Brain, Upload, FileText, X, ChevronUp, MessageSquare
} from 'lucide-react';
import type { ProviderCatalog, VoiceOption, ModelOption } from '@/lib/providers';
import { FALLBACK_CATALOG, STT_LANGUAGES } from '@/lib/providers';

// ── Collapsible section wrapper ──────────────────────────────────────────────
function Section({ title, icon: Icon, children, defaultOpen = true, color = "indigo" }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    defaultOpen?: boolean;
    color?: string;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const colorMap: Record<string, string> = {
        indigo: "text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10",
        purple: "text-purple-500 dark:text-[#a371f7] bg-purple-50 dark:bg-[#a371f7]/10",
        cyan:   "text-cyan-500 dark:text-[#39d2c0] bg-cyan-50 dark:bg-[#39d2c0]/10",
        green:  "text-green-500 dark:text-[#2ea043] bg-green-50 dark:bg-[#2ea043]/10",
    };
    return (
        <div className="rounded-xl border border-gray-200 dark:border-[#30363d] bg-gray-50/50 dark:bg-[#0d1117]/40 overflow-hidden">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-100/50 dark:hover:bg-white/[0.02] transition-colors">
                <div className={`p-1.5 rounded-lg ${colorMap[color] || colorMap.indigo}`}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-[#e6edf3] flex-1">{title}</span>
                {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
            {open && (
                <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-200/50 dark:border-[#30363d]">
                    {children}
                </div>
            )}
        </div>
    );
}

export default function CallDispatcher() {
    const [phoneNumber, setPhoneNumber] = useState('+91');
    const [agentName, setAgentName] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [greeting, setGreeting] = useState('');
    const [callContext, setCallContext] = useState('');
    const [ragContent, setRagContent] = useState('');
    const [ragFileName, setRagFileName] = useState('');
    const [ragUploading, setRagUploading] = useState(false);
    const ragInputRef = useRef<HTMLInputElement>(null);

    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    // Voice / model
    const [selectedProvider, setSelectedProvider] = useState('groq');
    const [selectedLlmModel, setSelectedLlmModel] = useState('');
    const [selectedVoice, setSelectedVoice] = useState('aravind');
    const [selectedTtsProvider, setSelectedTtsProvider] = useState('sarvam');
    const [selectedLanguage, setSelectedLanguage] = useState('en-IN');

    // Voice preview state
    const [previewState, setPreviewState] = useState<"idle" | "loading" | "playing">("idle");
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Dynamic catalog
    const [catalog, setCatalog] = useState<ProviderCatalog>(FALLBACK_CATALOG);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});

    const loadCatalog = async () => {
        setCatalogLoading(true);
        try {
            const res = await fetch('/api/providers');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setCatalog(data.catalog);
            setLiveStatus(data.live_fetched ?? {});
        } catch {
            // Keep fallback
        } finally {
            setCatalogLoading(false);
        }
    };

    useEffect(() => {
        Promise.all([
            fetch('/api/agent-config?mode=outbound').then(r => r.json()).catch(() => null),
            loadCatalog(),
        ]).then(([configData]) => {
            if (configData?.config) {
                if (configData.config.llm_provider) setSelectedProvider(configData.config.llm_provider);
                if (configData.config.tts_provider) setSelectedTtsProvider(configData.config.tts_provider);
                if (configData.config.tts_voice) setSelectedVoice(configData.config.tts_voice);
                if (configData.config.tts_language) setSelectedLanguage(configData.config.tts_language);
            }
        });
    }, []);

    // Auto-select first LLM model when provider or catalog changes
    useEffect(() => {
        if (!catalogLoading && !selectedLlmModel) {
            const models = catalog.llm[selectedProvider]?.models ?? [];
            if (models.length > 0) setSelectedLlmModel(models[0].value);
        }
    }, [catalogLoading, selectedProvider, catalog]);

    const handleTtsProviderChange = (provider: string) => {
        setSelectedTtsProvider(provider);
        stopPreview();
        const voices = catalog.tts[provider]?.voices ?? [];
        if (voices.length > 0) setSelectedVoice(voices[0].value);
    };

    const handleLlmProviderChange = (provider: string) => {
        setSelectedProvider(provider);
        const models = catalog.llm[provider]?.models ?? [];
        if (models.length > 0) setSelectedLlmModel(models[0].value);
    };

    // ── RAG upload ──────────────────────────────────────────────────────────
    const handleRagUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setRagUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/campaign/upload-rag', { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');
            const data = await res.json();
            setRagContent(data.content || '');
            setRagFileName(file.name);
        } catch (err: any) {
            setMessage(`RAG upload failed: ${err.message}`);
            setStatus('error');
        } finally {
            setRagUploading(false);
            if (ragInputRef.current) ragInputRef.current.value = '';
        }
    };

    // ── Voice preview ───────────────────────────────────────────────────────
    const stopPreview = () => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        setPreviewState("idle");
    };

    const playPreview = async () => {
        stopPreview();
        setPreviewState("loading");
        try {
            const params = new URLSearchParams({
                provider: selectedTtsProvider, voice: selectedVoice,
                model: "", language: selectedLanguage,
            });
            const res = await fetch(`/api/voice-preview?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => { setPreviewState("idle"); URL.revokeObjectURL(url); };
            audio.onerror = () => { setPreviewState("idle"); URL.revokeObjectURL(url); };
            await audio.play();
            setPreviewState("playing");
        } catch (e: any) {
            setPreviewState("idle");
            setMessage(`Preview failed: ${e.message}`);
            setStatus('error');
        }
    };

    // ── Dispatch ────────────────────────────────────────────────────────────
    const handleDispatch = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMessage('');

        // Assemble full prompt — system prompt is the primary persona
        let fullPrompt = systemPrompt.trim();
        if (callContext.trim()) {
            fullPrompt += `\n\n## Additional Call Context:\n${callContext.trim()}`;
        }
        if (ragContent.trim()) {
            fullPrompt += `\n\n## Knowledge Base:\n${ragContent.trim()}`;
        }

        try {
            const res = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber,
                    prompt: fullPrompt,
                    modelProvider: selectedProvider,
                    voice: selectedVoice,
                    ttsProvider: selectedTtsProvider,
                    ttsLanguage: selectedLanguage,
                    // Signal the Python agent to fully override the base config
                    overrideSystemPrompt: !!systemPrompt.trim(),
                    greeting: greeting,
                    agentName: agentName,
                    // ── Dynamic per-call config: always send live UI values ──────────
                    // Python agent reads these and overrides ws_config directly
                    systemPrompt:    systemPrompt.trim(),
                    llmModel:        selectedLlmModel || catalog.llm[selectedProvider]?.models?.[0]?.value || "",
                    initialGreeting: greeting,
                    ragContent:      ragContent.trim(),
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setStatus('success');
                setMessage(`✓ Call dispatched to ${phoneNumber} — Room: ${data.roomName}`);
            } else {
                setStatus('error');
                setMessage(data.error || 'Failed to dispatch call');
            }
        } catch (err: any) {
            setStatus('error');
            setMessage(err.message || 'Network error');
        }
    };

    const inputClass = "w-full px-3 py-2.5 bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#8b949e] outline-none transition-all text-sm";

    const llmProviders = Object.entries(catalog.llm).map(([k, v]) => ({ value: k, label: v.label }));
    const ttsProviders = Object.entries(catalog.tts).map(([k, v]) => ({ value: k, label: v.label }));
    const voices = (catalog.tts[selectedTtsProvider]?.voices ?? []).map(v => ({
        value: v.value,
        label: v.gender ? `${v.label} (${v.gender === 'female' ? '♀' : v.gender === 'male' ? '♂' : '◈'})` : v.label,
    }));
    const ttsLanguages = catalog.tts[selectedTtsProvider]?.languages ?? STT_LANGUAGES;

    const _ttsLangCatalog = catalog.tts[selectedTtsProvider]?.languages;
    const voiceLangTags: ModelOption[] = _ttsLangCatalog
        ? _ttsLangCatalog
        : selectedTtsProvider === "openai"
            ? [{ value: "multi", label: "57 languages" }]
            : selectedTtsProvider === "cartesia"
                ? [{ value: "en", label: "Multilingual (60+)" }]
                : selectedTtsProvider === "deepgram"
                    ? [{ value: "en-US", label: "English (US)" }]
                    : [];
    const voiceLangChips = voiceLangTags.slice(0, 9);
    const voiceLangExtra = voiceLangTags.length > 9 ? voiceLangTags.length - 9 : 0;

    return (
        <div className="w-full">
            <div className="p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-[#30363d]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Phone className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#e6edf3]">Manual Dial</h2>
                            <p className="text-sm text-gray-500 dark:text-[#8b949e]">Deploy an agent to a specific number</p>
                        </div>
                    </div>
                    <button onClick={loadCatalog} disabled={catalogLoading} title="Refresh voices & models"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-[#8b949e] border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
                        <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                        {catalogLoading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>

                <form onSubmit={handleDispatch} className="space-y-4">
                    {/* Phone number — full width */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-[#e6edf3]">Phone Number *</label>
                        <input type="tel" placeholder="+919876543210" required value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)} className={inputClass} />
                    </div>

                    {/* Two-column layout: Agent Persona | Knowledge Base + Context */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Left: Agent Persona */}
                        <Section title="Agent Persona" icon={Bot} color="indigo" defaultOpen={true}>
                            <p className="text-xs text-gray-400 dark:text-[#8b949e]">
                                Defines who the agent is for this call. If left blank, the saved outbound config defaults apply.
                            </p>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider mb-1.5">Agent Name (optional)</label>
                                <input type="text" placeholder="e.g. Priya, Rahul, Alex" value={agentName}
                                    onChange={(e) => setAgentName(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider">System Prompt</label>
                                    <span className="text-[10px] text-gray-400 dark:text-[#484f58] font-mono">{systemPrompt.length} chars</span>
                                </div>
                                <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={8}
                                    placeholder="You are a helpful agent calling about... Define the agent's full persona, knowledge, rules, and tone here."
                                    className={`${inputClass} resize-none`} />
                                {systemPrompt.trim() && (
                                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1">
                                        ✓ This prompt will fully override the saved outbound config for this call.
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider mb-1.5">Initial Greeting (optional)</label>
                                <input type="text" placeholder="e.g. Hello, this is Priya calling from XYZ. Is this a good time?"
                                    value={greeting} onChange={(e) => setGreeting(e.target.value)} className={inputClass} />
                            </div>
                        </Section>

                        {/* Right: Knowledge Base + Call Context */}
                        <div className="space-y-4">
                            <Section title="Knowledge Base" icon={Brain} color="cyan" defaultOpen={false}>
                                <p className="text-xs text-gray-400 dark:text-[#8b949e]">Upload a PDF, DOCX, or TXT file. The extracted text will be injected into the agent's context.</p>
                                <input type="file" ref={ragInputRef} onChange={handleRagUpload} accept=".pdf,.docx,.txt" className="hidden" />
                                {ragFileName ? (
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-cyan-50 dark:bg-[#39d2c0]/10 border border-cyan-200 dark:border-[#39d2c0]/30">
                                        <FileText className="w-4 h-4 text-cyan-500 dark:text-[#39d2c0] flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-800 dark:text-[#e6edf3] truncate">{ragFileName}</p>
                                            <p className="text-[10px] text-gray-400 dark:text-[#8b949e]">{ragContent.length.toLocaleString()} chars extracted</p>
                                        </div>
                                        <button type="button" onClick={() => { setRagContent(''); setRagFileName(''); }}
                                            className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-[#da3633] transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <button type="button" onClick={() => ragInputRef.current?.click()} disabled={ragUploading}
                                        className="w-full flex flex-col items-center gap-2 py-6 rounded-lg border-2 border-dashed border-gray-200 dark:border-[#30363d] hover:border-cyan-400 dark:hover:border-[#39d2c0]/50 hover:bg-cyan-50/30 dark:hover:bg-[#39d2c0]/5 transition-colors text-gray-400 dark:text-[#8b949e]">
                                        {ragUploading ? <Loader2 className="w-5 h-5 animate-spin text-cyan-500" /> : <Upload className="w-5 h-5" />}
                                        <span className="text-xs font-medium">{ragUploading ? 'Uploading...' : 'Click to upload knowledge base'}</span>
                                        <span className="text-[10px] text-gray-300 dark:text-[#484f58]">PDF, DOCX, TXT</span>
                                    </button>
                                )}
                            </Section>

                            <Section title="Additional Call Context" icon={MessageSquare} color="purple" defaultOpen={false}>
                                <p className="text-xs text-gray-400 dark:text-[#8b949e]">Short note about this specific call (e.g. what the caller enquired about previously). Appended below the system prompt.</p>
                                <textarea placeholder="e.g. This customer recently test-drove the Hyundai Creta and asked about finance options..."
                                    value={callContext} onChange={(e) => setCallContext(e.target.value)} rows={3}
                                    className={`${inputClass} resize-none`} />
                            </Section>
                        </div>
                    </div>

                    {/* Voice / Model selectors — full width */}
                    <div className="rounded-xl border border-gray-200 dark:border-[#30363d] bg-gray-50/50 dark:bg-[#0d1117]/40 p-4 space-y-4">
                        <p className="text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider">Voice & Model</p>

                        {!catalogLoading && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8b949e]">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                                Voices & models fetched live from provider APIs
                                {liveStatus.sarvam_voices && <span className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 font-medium">Sarvam ✓</span>}
                                {liveStatus.groq_models && <span className="px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium">Groq ✓</span>}
                            </div>
                        )}

                        {/* LLM Provider + Model */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider">LLM Provider</label>
                                <div className="relative">
                                    <select className={`${inputClass} appearance-none pr-8`} value={selectedProvider}
                                        onChange={(e) => handleLlmProviderChange(e.target.value)} disabled={catalogLoading}>
                                        {catalogLoading ? <option>Loading...</option> : llmProviders.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider">LLM Model</label>
                                <div className="relative">
                                    <select className={`${inputClass} appearance-none pr-8`} value={selectedLlmModel}
                                        onChange={(e) => setSelectedLlmModel(e.target.value)} disabled={catalogLoading}>
                                        {catalogLoading ? <option>Loading...</option> :
                                            (catalog.llm[selectedProvider]?.models ?? []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider">TTS Provider</label>
                                <div className="relative">
                                    <select className={`${inputClass} appearance-none pr-8`} value={selectedTtsProvider}
                                        onChange={(e) => handleTtsProviderChange(e.target.value)} disabled={catalogLoading}>
                                        {catalogLoading ? <option>Loading...</option> : ttsProviders.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                </div>
                            </div>
                        </div>

                        {/* Voice selector + Preview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider flex items-center gap-1.5">
                                    Voice
                                    {(liveStatus.sarvam_voices && selectedTtsProvider === 'sarvam') && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" title="Live from Sarvam API" />
                                    )}
                                    {catalogLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                                </label>
                                <div className="flex gap-2 items-center">
                                    <div className="relative flex-1 min-w-0">
                                        <select className={`${inputClass} appearance-none pr-8`} value={selectedVoice}
                                            onChange={(e) => { setSelectedVoice(e.target.value); stopPreview(); }} disabled={catalogLoading}>
                                            {catalogLoading ? <option>Loading voices...</option> : voices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    </div>
                                    <button type="button" onClick={previewState === "playing" ? stopPreview : playPreview}
                                        disabled={previewState === "loading" || !selectedVoice || catalogLoading} title={previewState === "playing" ? "Stop preview" : "Preview this voice"}
                                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all whitespace-nowrap ${previewState === "playing"
                                            ? "bg-indigo-500 text-white border-indigo-500"
                                            : previewState === "loading"
                                                ? "bg-gray-100 dark:bg-[#21262d] text-gray-400 border-gray-200 dark:border-[#30363d] cursor-wait"
                                                : "bg-white dark:bg-[#0d1117] text-gray-600 dark:text-[#8b949e] border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] disabled:opacity-40"
                                        }`}>
                                        {previewState === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : previewState === "playing" ? <StopCircle className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                        <span>{previewState === "playing" ? "Stop" : "Preview"}</span>
                                    </button>
                                </div>
                                {voiceLangChips.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        <Globe className="w-3 h-3 text-gray-400 dark:text-[#484f58] flex-shrink-0" />
                                        {[...voiceLangChips].sort((a, b) => a.value === selectedLanguage ? -1 : b.value === selectedLanguage ? 1 : 0).map((lang) => {
                                            const isActive = lang.value === selectedLanguage;
                                            return (
                                                <button key={lang.value} type="button" title={`Switch to ${lang.label}`}
                                                    onClick={() => { setSelectedLanguage(lang.value); stopPreview(); }}
                                                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap transition-all ${isActive ? "bg-blue-500 text-white border-blue-500 shadow-sm" : "bg-blue-50/80 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20"}`}>
                                                    {isActive && <span className="mr-0.5">✓</span>}
                                                    {lang.label.replace(" (India)", "").replace(" (US)", "")}
                                                </button>
                                            );
                                        })}
                                        {voiceLangExtra > 0 && <span className="text-[10px] text-gray-400 dark:text-[#484f58]">+{voiceLangExtra} more</span>}
                                    </div>
                                )}
                            </div>

                            {catalog.tts[selectedTtsProvider]?.languages && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-600 dark:text-[#8b949e] uppercase tracking-wider">Language</label>
                                    <div className="relative">
                                        <select className={`${inputClass} appearance-none pr-8`} value={selectedLanguage}
                                            onChange={(e) => { setSelectedLanguage(e.target.value); stopPreview(); }} disabled={catalogLoading}>
                                            {ttsLanguages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Dispatch button + message — full width */}
                    <button type="submit" disabled={status === 'loading' || catalogLoading}
                        className="w-full py-2.5 px-4 bg-indigo-500 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm shadow-indigo-500/20">
                        {status === 'loading' ? (<><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</>) : (<><Phone className="w-4 h-4" /> Initiate Call</>)}
                    </button>

                    {message && (
                        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 border ${status === 'success'
                            ? 'bg-green-50 dark:bg-[#2ea043]/10 text-green-700 dark:text-[#2ea043] border-green-200 dark:border-[#2ea043]/20'
                            : 'bg-red-50 dark:bg-[#da3633]/10 text-red-700 dark:text-[#da3633] border-red-200 dark:border-[#da3633]/20'
                        }`}>
                            {message}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
