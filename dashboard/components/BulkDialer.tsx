"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    Users, Upload, Play, Loader2, RefreshCw, ChevronDown, StopCircle,
    Globe, FileText, Download, CheckCircle2, XCircle, PhoneMissed,
    Phone, Brain, Table2, AlertCircle, Clock, BookMarked, Save, Trash2, Plus, X, Bot
} from 'lucide-react';
import type { ProviderCatalog, VoiceOption, ModelOption } from '@/lib/providers';
import { FALLBACK_CATALOG, STT_LANGUAGES } from '@/lib/providers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeadRow {
    [key: string]: string;
}

interface CampaignResult {
    row_index: number;
    phone_number: string;
    lead_email: string;
    status: "Called" | "No Answer" | "Failed" | "Pending";
    remarks: string;
    sentiment: "Positive" | "Neutral" | "Negative" | "";
    intent: string;
    timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateCampaignId(): string {
    return `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// ── LocalStorage persistence keys ─────────────────────────────────────────────
const VOICE_PREFS_KEY = 'bulkdialer_voice_prefs';
const DRAFT_KEY       = 'bulkdialer_draft';

// ── Campaign Template type ────────────────────────────────────────────────────
interface CampaignTemplate {
    id: string;
    name: string;
    config: {
        prompt: string;
        agentName: string;
        greeting: string;
        ttsProvider: string;
        voice: string;
        language: string;
        llmProvider: string;
        ragContent: string;
        ragFileName: string;
    };
    created_at: string;
}

function parseCSV(text: string): { columns: string[]; rows: LeadRow[] } {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length === 0) return { columns: [], rows: [] };
    const columns = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
        // Handle quoted cells
        const cells: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; }
            else { current += ch; }
        }
        cells.push(current.trim());
        const row: LeadRow = {};
        columns.forEach((col, idx) => { row[col] = cells[idx] ?? ''; });
        return row;
    }).filter(row => Object.values(row).some(v => v.trim() !== ''));
    return { columns, rows };
}

async function parseXLSX(file: File): Promise<{ columns: string[]; rows: LeadRow[] }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = (await import('xlsx')).default;
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const jsonData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (jsonData.length === 0) return { columns: [], rows: [] };
    const columns = (jsonData[0] as string[]).map(c => String(c).trim());
    const rows = jsonData.slice(1).map(r => {
        const row: LeadRow = {};
        columns.forEach((col, idx) => { row[col] = String((r as any[])[idx] ?? '').trim(); });
        return row;
    }).filter(row => Object.values(row).some(v => v.trim() !== ''));
    return { columns, rows };
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
    const map: Record<string, { color: string; label: string }> = {
        Positive: { color: '#3fb950', label: '😊 Positive' },
        Negative: { color: '#f85149', label: '😞 Negative' },
        Neutral:  { color: '#d29922', label: '😐 Neutral'  },
    };
    const s = map[sentiment] || { color: '#8b949e', label: sentiment || '—' };
    return (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: `${s.color}20`, color: s.color, border: `1px solid ${s.color}40` }}>
            {s.label}
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { icon: any; color: string }> = {
        Called:     { icon: CheckCircle2,  color: '#3fb950' },
        Connected:  { icon: Phone,         color: '#f0883e' },
        'No Answer':{ icon: PhoneMissed,   color: '#d29922' },
        Failed:     { icon: XCircle,       color: '#f85149' },
        Pending:    { icon: Clock,         color: '#8b949e' },
        Dialing:    { icon: Phone,         color: '#2f81f7' },
    };
    const s = map[status] || { icon: Clock, color: '#8b949e' };
    const Icon = s.icon;
    return (
        <span className="flex items-center gap-1 text-[10px] font-semibold"
            style={{ color: s.color }}>
            <Icon className="w-3 h-3" />
            {status}
        </span>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BulkDialer() {
    // ── File / leads state
    const [leadsFile, setLeadsFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [leads, setLeads] = useState<LeadRow[]>([]);
    const [columnMap, setColumnMap] = useState({ phone: '', name: '', email: '' });
    const [extraColumns, setExtraColumns] = useState<string[]>([]);
    const [parseError, setParseError] = useState('');

    // ── RAG state (supports multiple files)
    const [ragFiles, setRagFiles] = useState<Array<{ file: File; content: string; info: { charCount: number; fileName: string; truncated?: boolean } }>>([]);
    const [ragLoading, setRagLoading] = useState(false);
    // Combined RAG content from all files (derived)
    const ragContent = ragFiles.map(f => f.content).join('\n\n');

    // ── Campaign state
    const [prompt, setPrompt] = useState('');
    const [agentName, setAgentName] = useState('');
    const [greeting, setGreeting] = useState('');
    const [campaignId, setCampaignId] = useState('');
    const [status, setStatus] = useState<'idle' | 'processing' | 'dialing' | 'completed' | 'error'>('idle');
    const [progress, setProgress] = useState({ total: 0, current: 0 });
    const [message, setMessage] = useState('');
    const [campaignResults, setCampaignResults] = useState<CampaignResult[]>([]);
    const [isCancelled, setIsCancelled] = useState(false);
    const cancelRef = useRef(false);

    // ── Campaign Template state
    const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [templateSaveError, setTemplateSaveError] = useState('');

    // ── Provider state
    const [catalog, setCatalog] = useState<ProviderCatalog>(FALLBACK_CATALOG);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});
    const [selectedProvider, setSelectedProvider] = useState('google');
    const [selectedLlmModel, setSelectedLlmModel] = useState('');
    const [selectedVoice, setSelectedVoice] = useState('ishita');
    const [selectedTtsProvider, setSelectedTtsProvider] = useState('sarvam');
    const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
    const [speechSpeed, setSpeechSpeed] = useState(1.0);

    // ── Voice preview
    const [previewState, setPreviewState] = useState<"idle" | "loading" | "playing">("idle");
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // ── Prompt & greeting editor refs
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
    const greetingInputRef  = useRef<HTMLInputElement>(null);
    const formRef           = useRef<HTMLFormElement>(null);
    // Track which field (prompt / greeting) was last focused for tag insertion
    const [lastFocusedField, setLastFocusedField] = useState<'prompt' | 'greeting'>('prompt');

    // ── Polling ref + draft-save debounce
    const pollingRef    = useRef<NodeJS.Timeout | null>(null);
    const draftTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [draftSaved, setDraftSaved] = useState(false);

    // ── Run-again trigger (incremented by handleRunAgain to auto-resubmit)
    const [runAgainTrigger, setRunAgainTrigger] = useState(0);

    // ── Prompt editor modal state
    const [showPromptModal, setShowPromptModal] = useState(false);

    // ── File input keys (incremented to reset the browser file input DOM state)
    const [leadsInputKey, setLeadsInputKey] = useState(Date.now());
    const [ragInputKey, setRagInputKey] = useState(Date.now() + 1);

    // ── Load catalog & agent config
    const loadCatalog = async () => {
        setCatalogLoading(true);
        try {
            const res = await fetch('/api/providers');
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setCatalog(data.catalog);
            setLiveStatus(data.live_fetched ?? {});
        } catch { /* keep fallback */ } finally { setCatalogLoading(false); }
    };

    useEffect(() => {
        // ① Restore last-used voice prefs instantly (before any API calls)
        try {
            const saved = localStorage.getItem(VOICE_PREFS_KEY);
            if (saved) {
                const prefs = JSON.parse(saved);
                if (prefs.provider)    setSelectedProvider(prefs.provider);
                if (prefs.ttsProvider) setSelectedTtsProvider(prefs.ttsProvider);
                if (prefs.voice) {
                    // Validate voice is compatible with current TTS provider
                    const validVoices = SARVAM_BULBUL_VOICES;
                    if (prefs.ttsProvider !== 'sarvam' || validVoices.has(prefs.voice)) {
                        setSelectedVoice(prefs.voice);
                    }
                    // If invalid, keep default 'ishita'
                }
                if (prefs.language)    setSelectedLanguage(prefs.language);
                if (prefs.speed)       setSpeechSpeed(prefs.speed);
            }
        } catch { /* ignore */ }

        // ② Restore draft (prompt, greeting, agentName, RAG content, lead rows)
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (d.prompt)    setPrompt(d.prompt);
                if (d.greeting)  setGreeting(d.greeting);
                if (d.agentName) setAgentName(d.agentName);
                if (d.ragFiles?.length > 0) {
                    // Restore RAG files from draft (File objects lost, but content + info preserved)
                    setRagFiles(d.ragFiles.map((f: any) => ({ file: { name: f.info?.fileName || 'Draft file' } as File, content: f.content, info: f.info })));
                }
                if (d.leads?.length > 0 && d.columns?.length > 0) {
                    setLeads(d.leads);
                    setColumns(d.columns);
                    setColumnMap(d.columnMap || { phone: '', name: '', email: '' });
                    // File object can't be serialised — mark as draft-restored
                    setLeadsFile({ name: `Draft restored · ${d.leads.length} leads` } as File);
                }
            }
        } catch { /* ignore */ }

        // ③ Load catalog + templates; only apply agent-config defaults if no saved prefs
        Promise.all([
            fetch('/api/agent-config?mode=outbound').then(r => r.json()).catch(() => null),
            loadCatalog(),
            loadTemplates(),
        ]).then(([configData]) => {
            if (!localStorage.getItem(VOICE_PREFS_KEY) && configData?.config) {
                if (configData.config.llm_provider) setSelectedProvider(configData.config.llm_provider);
                if (configData.config.tts_provider) setSelectedTtsProvider(configData.config.tts_provider);
                if (configData.config.tts_voice)    setSelectedVoice(configData.config.tts_voice);
                if (configData.config.tts_language) setSelectedLanguage(configData.config.tts_language);
            }
        });
    }, []);

    // Auto-select first LLM model when provider or catalog changes
    useEffect(() => {
        if (!catalogLoading && !selectedLlmModel) {
            const m = catalog.llm[selectedProvider]?.models ?? [];
            if (m.length > 0) setSelectedLlmModel(m[0].value);
        }
    }, [catalogLoading, selectedProvider, catalog]);

    // ── Load templates from API
    const loadTemplates = async () => {
        setTemplatesLoading(true);
        try {
            const res = await fetch('/api/campaign/templates');
            if (res.ok) {
                const data = await res.json();
                setTemplates(data.templates || []);
            }
        } catch { /* non-fatal */ } finally { setTemplatesLoading(false); }
    };

    // ── Save current state as a new template
    const handleSaveTemplate = async () => {
        if (!newTemplateName.trim()) return;
        setSavingTemplate(true);
        setTemplateSaveError('');
        try {
            const res = await fetch('/api/campaign/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTemplateName.trim(),
                    config: {
                        prompt, agentName, greeting,
                        ttsProvider: selectedTtsProvider, voice: selectedVoice,
                        language: selectedLanguage, llmProvider: selectedProvider,
                        ragContent, ragFileName: ragFiles.map(f => f.info?.fileName).filter(Boolean).join(', ') || '',
                    },
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                await loadTemplates();
                setShowSaveModal(false);
                setNewTemplateName('');
                setTemplateSaveError('');
            } else {
                setTemplateSaveError(data.error || `Save failed (HTTP ${res.status})`);
            }
        } catch (e: any) {
            setTemplateSaveError(e.message || 'Network error saving template');
        } finally {
            setSavingTemplate(false);
        }
    };

    // ── Load a template into form fields
    const handleLoadTemplate = (t: CampaignTemplate) => {
        setPrompt(t.config.prompt || '');
        setAgentName(t.config.agentName || '');
        setGreeting(t.config.greeting || '');
        setSelectedTtsProvider(t.config.ttsProvider || selectedTtsProvider);
        setSelectedVoice(t.config.voice || selectedVoice);
        setSelectedLanguage(t.config.language || selectedLanguage);
        setSelectedProvider(t.config.llmProvider || selectedProvider);
        if (t.config.ragContent) {
            setRagFiles([{
                file: { name: t.config.ragFileName || 'Loaded from template' } as File,
                content: t.config.ragContent,
                info: { charCount: t.config.ragContent.length, fileName: t.config.ragFileName || 'Loaded from template' },
            }]);
        }
    };

    // ── Delete a template
    const handleDeleteTemplate = async (id: string) => {
        try {
            await fetch(`/api/campaign/templates?id=${id}`, { method: 'DELETE' });
            setTemplates(prev => prev.filter(t => t.id !== id));
        } catch { /* non-fatal */ }
    };

    // ── Persist last-used voice/LLM preferences to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify({
                provider: selectedProvider, ttsProvider: selectedTtsProvider,
                voice: selectedVoice, language: selectedLanguage, speed: speechSpeed
            }));
        } catch { /* ignore — storage may be unavailable */ }
    }, [selectedProvider, selectedTtsProvider, selectedVoice, selectedLanguage]);

    // ── Debounce-save full draft to localStorage (prompt, greeting, RAG, leads)
    useEffect(() => {
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(() => {
            try {
                // RAG files: only save metadata (content + info) — File objects can't be serialised
                const ragDraft = ragFiles.map(f => ({ content: f.content, info: f.info }));
                localStorage.setItem(DRAFT_KEY, JSON.stringify({
                    prompt, greeting, agentName, ragFiles: ragDraft,
                    leads, columns, columnMap,
                }));
                setDraftSaved(true);
                setTimeout(() => setDraftSaved(false), 2000);
            } catch { /* storage full or unavailable */ }
        }, 800);
        return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    }, [prompt, greeting, agentName, ragFiles, leads, columns, columnMap]);

    // ── Auto-trigger Run Again once status resets to idle
    useEffect(() => {
        if (runAgainTrigger > 0 && status === 'idle') {
            formRef.current?.requestSubmit();
        }
    }, [runAgainTrigger, status]);

    // ── Poll campaign results while dialing AND after completion
    // Calls are dispatched with a short delay but take minutes to actually finish.
    // The Python agent writes results asynchronously on disconnect, so we must keep
    // polling after the campaign loop ends until all results arrive.
    useEffect(() => {
        if ((status === 'dialing' || status === 'completed') && campaignId) {
            pollingRef.current = setInterval(async () => {
                try {
                    const res = await fetch(`/api/campaign/results?campaignId=${campaignId}`);
                    if (res.ok) {
                        const data = await res.json();
                        setCampaignResults(data.results || []);
                    }
                } catch { /* non-fatal */ }
            }, 4000);
        } else {
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        }
        return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    }, [status, campaignId]);

    // ── Parse leads file
    const handleLeadsFile = async (file: File) => {
        setLeadsFile(file);
        setParseError('');
        setColumns([]);
        setLeads([]);
        setColumnMap({ phone: '', name: '', email: '' });
        try {
            let parsed: { columns: string[]; rows: LeadRow[] };
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            if (ext === 'csv' || ext === 'txt') {
                const text = await file.text();
                parsed = parseCSV(text);
            } else if (ext === 'xlsx' || ext === 'xls') {
                parsed = await parseXLSX(file);
            } else {
                setParseError('Unsupported file type. Please upload CSV or Excel (.xlsx).');
                return;
            }
            if (parsed.columns.length === 0) { setParseError('Could not detect columns. Is the file empty?'); return; }
            setColumns(parsed.columns);
            setLeads(parsed.rows);
            // Auto-detect common column names
            const colsLower = parsed.columns.map(c => c.toLowerCase());
            const phoneCol  = parsed.columns[colsLower.findIndex(c => c.includes('phone') || c.includes('mobile') || c.includes('number'))] || '';
            const nameCol   = parsed.columns[colsLower.findIndex(c => c.includes('name'))] || '';
            const emailCol  = parsed.columns[colsLower.findIndex(c => c.includes('email') || c.includes('mail'))] || '';
            setColumnMap({ phone: phoneCol, name: nameCol, email: emailCol });
        } catch (err: any) {
            setParseError(`Failed to parse file: ${err.message}`);
        }
    };

    // ── Upload RAG file
    const handleRagFile = async (file: File) => {
        // Prevent duplicate files
        if (ragFiles.some(f => f.file.name === file.name && f.file.size === file.size)) return;
        setRagLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/campaign/upload-rag', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            setRagFiles(prev => [...prev, { file, content: data.content, info: { charCount: data.charCount, fileName: data.fileName, truncated: data.truncated } }]);
        } catch (err: any) {
            setMessage(`RAG upload failed: ${err.message}`);
            setStatus('error');
        } finally {
            setRagLoading(false);
        }
    };

    const handleTtsProviderChange = (provider: string) => {
        setSelectedTtsProvider(provider);
        stopPreview();
        const voices = catalog.tts[provider]?.voices ?? [];
        if (voices.length > 0) setSelectedVoice(voices[0].value);
    };

    const stopPreview = () => {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        setPreviewState("idle");
    };

    const playPreview = async () => {
        stopPreview();
        setPreviewState("loading");
        try {
            const params = new URLSearchParams({ provider: selectedTtsProvider, voice: selectedVoice, model: "", language: selectedLanguage });
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

    // ── Start campaign
    const handleStartCampaign = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!columnMap.phone || !columnMap.name || !columnMap.email) {
            setStatus('error');
            setMessage('Please map all required columns: Phone, Name, and Email.');
            return;
        }
        if (leads.length === 0) { setStatus('error'); setMessage('No leads found in the uploaded file.'); return; }

        const validLeads = leads.filter(l => {
            const phone = l[columnMap.phone]?.trim();
            return phone && phone.length >= 10;
        });
        if (validLeads.length === 0) { setStatus('error'); setMessage('No valid phone numbers found in the selected column.'); return; }

        const newCampaignId = generateCampaignId();
        setCampaignId(newCampaignId);
        setCampaignResults([]);
        cancelRef.current = false;
        setIsCancelled(false);
        setStatus('dialing');
        setProgress({ total: validLeads.length, current: 0 });
        setMessage('');

        let successCount = 0, failCount = 0;

        for (let i = 0; i < validLeads.length; i++) {
            if (cancelRef.current) { setMessage(`Campaign cancelled after ${i} calls.`); break; }

            const lead = validLeads[i];
            const phone = lead[columnMap.phone]?.trim();

            // Find original row index in the full leads array
            const originalIndex = leads.findIndex(l => l === lead || (
                columnMap.phone && l[columnMap.phone] === lead[columnMap.phone]
            ));

            // Build leadData with all non-mapped columns
            const leadData: Record<string, string> = {};
            columns.forEach(col => {
                if (col !== columnMap.phone && col !== columnMap.name && col !== columnMap.email) {
                    if (lead[col]) leadData[col] = lead[col];
                }
            });

            // Resolve {{lead.COLUMN}} placeholders in the prompt for this specific lead
            const leadValues: Record<string, string> = {
                name:  columnMap.name  ? (lead[columnMap.name]?.trim()  || '') : '',
                email: columnMap.email ? (lead[columnMap.email]?.trim() || '') : '',
                phone: phone,
                ...Object.fromEntries(Object.entries(leadData).map(([k, v]) => [k.toLowerCase(), v])),
            };
            const resolvedPrompt = prompt.replace(/\{\{lead\.(\w+)\}\}/gi, (_, key) => leadValues[key.toLowerCase()] ?? `{{lead.${key}}}`);
            const resolvedGreeting = greeting ? greeting.replace(/\{\{lead\.(\w+)\}\}/gi, (_, key) => leadValues[key.toLowerCase()] ?? `{{lead.${key}}}`) : greeting;

            let dispatchOk = false;
            try {
                const res = await fetch('/api/dispatch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phoneNumber:   phone,
                        prompt:        resolvedPrompt,
                        modelProvider: selectedProvider,
                        voice:         selectedVoice,
                        ttsProvider:   selectedTtsProvider,
                        ttsLanguage:   selectedLanguage,
                        // Campaign enrichment
                        leadName:      leadValues.name,
                        leadEmail:     leadValues.email,
                        leadData,
                        ragContent,
                        campaignId:    newCampaignId,
                        leadRowIndex:  i,
                        overrideSystemPrompt: true, // Bulk Dialer always overrides
                        greeting:      resolvedGreeting,
                        agentName:     agentName,
                        // ── Dynamic per-call config: always send live UI values ──────────
                        // The Python agent will use these directly, bypassing agent_config.json
                        systemPrompt:   resolvedPrompt,   // bulk dialer prompt IS the system prompt
                        llmModel:       selectedLlmModel || catalog.llm[selectedProvider]?.models?.[0]?.value || "",
                        initialGreeting: resolvedGreeting,
                        ttsSpeed:       speechSpeed,
                    }),
                });
                // Check if redirected to /login (session expired)
                if (res.redirected && res.url.includes('/login')) {
                    failCount++;
                    if (successCount === 0 && failCount === 1) {
                        setMessage('Session expired. Please refresh the page and log in again.');
                        setStatus('error');
                        return;
                    }
                } else if (res.ok) {
                    successCount++;
                    dispatchOk = true;
                } else {
                    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                    const errMsg = errBody.error || `HTTP ${res.status}`;
                    console.error(`[DISPATCH] Lead ${i + 1} (${phone}) failed:`, errMsg);
                    failCount++;
                    // Show first error to user so they know what's wrong
                    if (successCount === 0 && failCount === 1) {
                        setMessage(`Dispatch error: ${errMsg}`);
                        setStatus('error');
                        return;
                    }
                }
            } catch (err: any) {
                console.error(`[DISPATCH] Lead ${i + 1} (${phone}) exception:`, err);
                failCount++;
                if (successCount === 0 && failCount === 1) {
                    setMessage(`Dispatch failed: ${err.message || 'Network error'}`);
                    setStatus('error');
                    return;
                }
            }

            setProgress(prev => ({ ...prev, current: i + 1 }));

            // ── Wait for this call to complete before dispatching the next one ──
            // All calls share one SIP trunk, so dispatching concurrently causes
            // "486 Busy Here" errors. Poll campaign results until this lead has
            // a result (Called / No Answer / Failed) or timeout after 3 minutes.
            if (dispatchOk) {
                const CALL_TIMEOUT_MS = 180_000; // 3 minutes max per call
                const POLL_INTERVAL_MS = 3000;
                const startWait = Date.now();
                while (Date.now() - startWait < CALL_TIMEOUT_MS) {
                    if (cancelRef.current) break;
                    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                    try {
                        const pollRes = await fetch(`/api/campaign/results?campaignId=${newCampaignId}`);
                        if (pollRes.ok) {
                            const pollData = await pollRes.json();
                            setCampaignResults(pollData.results || []);
                            const myResult = (pollData.results || []).find(
                                (r: any) => r.row_index === i
                            );
                            if (myResult) {
                                // Call completed — move to the next lead
                                break;
                            }
                        }
                    } catch { /* non-fatal */ }
                }
            }
        }

        setStatus('completed');
        setMessage(`Campaign finished — Dispatched: ${successCount}, Failed: ${failCount}. Results update live as calls complete.`);

        // Final poll for results
        try {
            const res = await fetch(`/api/campaign/results?campaignId=${newCampaignId}`);
            if (res.ok) { const data = await res.json(); setCampaignResults(data.results || []); }
        } catch { /* non-fatal */ }
    };

    // ── Download report
    const handleDownload = async () => {
        if (!campaignId || leads.length === 0) return;
        try {
            const res = await fetch('/api/campaign/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId, leads, columns }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `campaign_${campaignId}_results.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setMessage(`Download failed: ${err.message}`);
        }
    };

    // ── Reset
    const handleReset = () => {
        cancelRef.current = true;
        setStatus('idle');
        setLeadsFile(null); setColumns([]); setLeads([]); setColumnMap({ phone: '', name: '', email: '' });
        setRagFiles([]);
        setCampaignId(''); setCampaignResults([]); setProgress({ total: 0, current: 0 }); setMessage('');
        setIsCancelled(false);
    };

    // ── Derived
    const ttsProviders = Object.keys(catalog.tts || {});
    // ── Sarvam bulbul:v3 only voices (filter out any incompatible ones from live catalog) ──
    const SARVAM_BULBUL_VOICES = new Set([
        'ishita','shreya','priya','neha','pooja','simran','kavya','ritu','roopa',
        'rahul','rohan','ratan','dev','manan','sumit','aditya','kabir','varun',
        'aayan','ashutosh','advait','amit','shubh',
    ]);
    const allVoices: VoiceOption[] = catalog.tts[selectedTtsProvider]?.voices ?? [];
    const voices: VoiceOption[] = selectedTtsProvider === 'sarvam'
        ? allVoices.filter(v => SARVAM_BULBUL_VOICES.has(v.value))
        : allVoices;
    const llmProviders = Object.keys(catalog.llm || {});
    const models: ModelOption[] = catalog.llm[selectedProvider]?.models ?? [];
    const isRunning = status === 'dialing';
    const isDone = status === 'completed' || status === 'error';

    const resultMap = new Map<number, CampaignResult>();
    campaignResults.forEach(r => resultMap.set(r.row_index, r));

    // ── Live Prompt Preview (row 1 substitution)
    const promptPreview = useMemo(() => {
        if (!prompt || leads.length === 0) return null;
        const firstLead = leads[0];
        return prompt.replace(/\{\{lead\.([^}]+)\}\}/gi, (match, colName) => {
            const realKey = Object.keys(firstLead).find(k => k.toLowerCase() === colName.trim().toLowerCase());
            return (realKey && firstLead[realKey]) ? firstLead[realKey] : match;
        });
    }, [prompt, leads]);

    // ── Live Greeting Preview (same substitution, row 1)
    const greetingPreview = useMemo(() => {
        if (!greeting || leads.length === 0) return null;
        const firstLead = leads[0];
        return greeting.replace(/\{\{lead\.([^}]+)\}\}/gi, (match, colName) => {
            const realKey = Object.keys(firstLead).find(k => k.toLowerCase() === colName.trim().toLowerCase());
            return (realKey && firstLead[realKey]) ? firstLead[realKey] : match;
        });
    }, [greeting, leads]);

    // ── Insert tag into whichever field was last focused (greeting or prompt)
    const handleInsertTag = (column: string) => {
        const tag = `{{lead.${column}}}`;
        if (lastFocusedField === 'greeting' && greetingInputRef.current) {
            const el = greetingInputRef.current;
            const start = el.selectionStart ?? greeting.length;
            const end   = el.selectionEnd   ?? greeting.length;
            setGreeting(greeting.substring(0, start) + tag + greeting.substring(end));
            setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
        } else if (promptTextareaRef.current) {
            const el = promptTextareaRef.current;
            const start = el.selectionStart ?? prompt.length;
            const end   = el.selectionEnd   ?? prompt.length;
            setPrompt(prompt.substring(0, start) + tag + prompt.substring(end));
            setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
        }
    };

    // ── Clear lead file (keep prompt/voice config intact)
    const handleClearLeads = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setLeadsFile(null); setColumns([]); setLeads([]);
        setColumnMap({ phone: '', name: '', email: '' }); setParseError('');
        setLeadsInputKey(Date.now());
    };

    // ── Clear RAG knowledge base
    const handleClearRag = (e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        setRagFiles([]);
        setRagInputKey(Date.now());
    };

    const handleRemoveRagFile = (index: number) => {
        setRagFiles(prev => prev.filter((_, i) => i !== index));
    };

    // ── Run Again — reuse same config, re-dial same leads
    const handleRunAgain = () => {
        cancelRef.current = false;
        setIsCancelled(false);
        setCampaignResults([]);
        setProgress({ total: 0, current: 0 });
        setMessage('');
        setStatus('idle');
        setRunAgainTrigger(t => t + 1);   // triggers auto-submit useEffect
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.2) transparent' }}>
            <div className="p-6 space-y-5 pb-4">

                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-[#30363d]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#a371f7]/10 text-[#a371f7] rounded-lg"><Users className="w-5 h-5" /></div>
                        <div>
                            <h2 className="text-lg font-semibold text-[#e6edf3]">Bulk Campaign</h2>
                            <p className="text-sm text-[#8b949e]">Upload a leads file, attach a knowledge base, and call everyone automatically</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={loadCatalog} disabled={catalogLoading} type="button"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] border border-[#30363d] hover:bg-[#21262d] transition-colors">
                            <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                            {catalogLoading ? 'Loading...' : 'Refresh'}
                        </button>
                        {(isRunning || isDone) && (
                            <button onClick={handleReset} type="button"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#f85149] border border-[#f85149]/30 hover:bg-[#f85149]/10 transition-colors">
                                <StopCircle className="w-3.5 h-3.5" />
                                {isRunning ? 'Cancel' : 'New Campaign'}
                            </button>
                        )}
                    </div>
                </div>

                <form ref={formRef} onSubmit={handleStartCampaign} className="space-y-5" id="bulk-campaign-form">

                    {/* ── Campaign Templates Panel */}
                    <div className="rounded-xl border border-[#a371f7]/30 bg-[#a371f7]/5 overflow-hidden">
                        <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BookMarked className="w-4 h-4 text-[#a371f7]" />
                                <span className="text-sm font-semibold text-[#e6edf3]">Campaign Templates</span>
                                <span className="ml-1 text-[10px] text-[#8b949e]">Save & reload campaign configs</span>
                            </div>
                            <button type="button" onClick={() => setShowSaveModal(true)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[#a371f7] border border-[#a371f7]/40 hover:bg-[#a371f7]/10 transition-colors">
                                <Save className="w-3 h-3" /> Save Current as Template
                            </button>
                        </div>
                        <div className="px-4 pb-3">
                            {templatesLoading ? (
                                <div className="flex items-center gap-2 text-xs text-[#8b949e]"><Loader2 className="w-3 h-3 animate-spin" /> Loading templates...</div>
                            ) : templates.length === 0 ? (
                                <p className="text-xs text-[#484f58] italic">No saved templates yet. Configure a campaign and click "Save Current as Template".</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {templates.map(t => (
                                        <div key={t.id} className="flex items-center gap-1 bg-[#161b22] border border-[#30363d] rounded-lg px-2.5 py-1.5 group">
                                            <button type="button" onClick={() => handleLoadTemplate(t)}
                                                className="text-xs font-medium text-[#c9d1d9] hover:text-[#a371f7] transition-colors">
                                                {t.name}
                                            </button>
                                            <button type="button" onClick={() => handleDeleteTemplate(t.id)}
                                                className="ml-1 opacity-0 group-hover:opacity-100 p-0.5 text-[#484f58] hover:text-[#f85149] transition-all">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Save Template Modal */}
                    {showSaveModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                                <h3 className="text-sm font-semibold text-[#e6edf3] mb-1">Save as Campaign Template</h3>
                                <p className="text-xs text-[#8b949e] mb-4">Give this template a name so you can reload it later.</p>
                                <input type="text" value={newTemplateName} onChange={e => setNewTemplateName(e.target.value)}
                                    placeholder="e.g. Real Estate - Project Sunset"
                                    className="w-full px-3 py-2 text-sm bg-[#0d1117] border border-[#30363d] rounded-lg text-[#e6edf3] placeholder-[#484f58] outline-none focus:ring-1 focus:ring-[#a371f7]/50 mb-3"
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveTemplate(); } }}
                                    autoFocus />
                                {templateSaveError && (
                                    <div className="mb-3 px-3 py-2 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-xs text-[#f85149]">
                                        ✗ {templateSaveError}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => { setShowSaveModal(false); setNewTemplateName(''); setTemplateSaveError(''); }}
                                        className="flex-1 py-2 text-xs font-semibold text-[#8b949e] border border-[#30363d] rounded-lg hover:bg-[#21262d] transition-colors">
                                        Cancel
                                    </button>
                                    <button type="button" onClick={handleSaveTemplate} disabled={!newTemplateName.trim() || savingTemplate}
                                        className="flex-1 py-2 text-xs font-semibold text-white bg-[#a371f7] hover:bg-[#9152f5] rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                                        {savingTemplate ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                        {savingTemplate ? 'Saving...' : 'Save Template'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Prompt Editor Modal */}
                    {showPromptModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                                {/* Modal Header */}
                                <div className="px-5 py-4 border-b border-[#30363d] flex items-center justify-between flex-shrink-0">
                                    <div>
                                        <h3 className="text-sm font-semibold text-[#e6edf3]">Edit System Prompt</h3>
                                        <p className="text-[10px] text-[#8b949e] mt-0.5">Define the agent's full persona and campaign goal</p>
                                    </div>
                                    <button type="button" onClick={() => setShowPromptModal(false)}
                                        className="p-1.5 rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] transition-colors">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                {/* Modal Body */}
                                <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ scrollbarWidth: 'thin' }}>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">System Prompt *</label>
                                        <textarea
                                            ref={promptTextareaRef}
                                            value={prompt} onChange={e => setPrompt(e.target.value)} rows={10}
                                            onFocus={() => setLastFocusedField('prompt')}
                                            placeholder="Define the agent's full persona and campaign goal. Use {{lead.name}}, {{lead.city}}, {{lead.budget}} etc. to personalise per lead."
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#3fb950]/50 resize-none font-mono" />
                                    </div>

                                    {/* Dynamic Entities Panel */}
                                    {columns.length > 0 && (
                                        <div className="p-3 rounded-lg bg-[#0d1117] border border-[#30363d]/60">
                                            <p className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                                Dynamic Entities
                                                <span className="normal-case font-normal text-[#484f58]">
                                                    — click to insert into <span className="text-[#3fb950]">{lastFocusedField === 'greeting' ? 'greeting ↑' : 'prompt ↓'}</span>
                                                </span>
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {columns.map(col => (
                                                    <div key={col}
                                                        draggable
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData('text/plain', `{{lead.${col}}}`);
                                                            e.dataTransfer.effectAllowed = 'copy';
                                                        }}
                                                        onClick={() => handleInsertTag(col)}
                                                        className="px-2 py-1 rounded bg-[#161b22] border border-[#30363d] hover:border-[#3fb950]/50 hover:bg-[#3fb950]/10 text-xs text-[#c9d1d9] font-mono cursor-pointer shadow-sm transition-colors flex items-center gap-1.5 group"
                                                    >
                                                        <span className="text-[#3fb950] opacity-60 group-hover:opacity-100">{"{{"}</span>
                                                        {col}
                                                        <span className="text-[#3fb950] opacity-60 group-hover:opacity-100">{"}}"}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Live Preview Panel */}
                                    {promptPreview && (
                                        <div className="rounded-lg border border-[#30363d] overflow-hidden">
                                            <div className="px-3 py-1.5 bg-[#161b22] border-b border-[#30363d] flex justify-between items-center">
                                                <span className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Live Preview</span>
                                                <span className="text-[10px] text-[#484f58]">Row 1 of {leads.length}</span>
                                            </div>
                                            <div className="p-3 bg-[#0d1117] text-sm text-[#c9d1d9] whitespace-pre-wrap font-mono leading-relaxed">
                                                {promptPreview.split(/(\{\{lead\.[^}]+\}\})/gi).map((part, i) => {
                                                    const isUnresolvedTag = part.startsWith('{{lead.') && part.endsWith('}}');
                                                    if (isUnresolvedTag) {
                                                        return <span key={i} className="text-[#f85149] bg-[#f85149]/10 px-1 rounded">{part} (not found)</span>;
                                                    }
                                                    return <span key={i}>{part}</span>;
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* Modal Footer */}
                                <div className="px-5 py-3 border-t border-[#30363d] flex justify-end flex-shrink-0">
                                    <button type="button" onClick={() => setShowPromptModal(false)}
                                        className="px-4 py-1.5 text-xs font-semibold text-[#e6edf3] bg-[#3fb950] hover:bg-[#2ea043] rounded-lg transition-colors">
                                        Done
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Steps 1 & 2 side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* ── STEP 1: Upload Leads File */}
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Table2 className="w-4 h-4 text-[#2f81f7]" />
                                <span className="text-sm font-semibold text-[#e6edf3]">Step 1 — Leads File</span>
                                <span className="ml-2 text-[10px] text-[#8b949e]">CSV or Excel (.xlsx)</span>
                            </div>
                            <a href="/sample_leads.csv" download className="text-xs text-[#2f81f7] hover:underline flex items-center gap-1">
                                <Download className="w-3 h-3" /> Download Template
                            </a>
                        </div>
                        <div className="p-4 space-y-4">
                            {/* Required Format Warning */}
                            <div className="bg-[#2f81f7]/10 border border-[#2f81f7]/30 rounded-lg p-3 text-xs text-[#c9d1d9]">
                                <span className="font-semibold text-[#2f81f7]">Strict Format Rule:</span> Your file MUST contain columns for <strong>Phone</strong>, <strong>Name</strong>, and <strong>Email</strong> to ensure the workflow engine and CRM actions function correctly. Extra columns (like City, Budget) are allowed and will be passed as lead context to the AI.
                            </div>

                            {/* Dropzone */}
                            <div className="relative">
                                <label className={`flex flex-col items-center justify-center w-full h-28 rounded-lg border-2 border-dashed cursor-pointer transition-colors
                                    ${leadsFile ? 'border-[#2f81f7]/50 bg-[#2f81f7]/5' : 'border-[#30363d] hover:border-[#8b949e] hover:bg-[#21262d]'}`}>
                                    <input key={leadsInputKey} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden"
                                        onChange={e => { if (e.target.files?.[0]) handleLeadsFile(e.target.files[0]); }} />
                                    {leadsFile ? (
                                        <div className="flex flex-col items-center gap-1">
                                            <CheckCircle2 className="w-6 h-6 text-[#2f81f7]" />
                                            <span className="text-sm font-medium text-[#e6edf3]">{leadsFile.name}</span>
                                            <span className="text-xs text-[#8b949e]">{leads.length} leads — click to replace</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-1">
                                            <Upload className="w-6 h-6 text-[#8b949e]" />
                                            <span className="text-sm text-[#8b949e]">Click or drag to upload leads file</span>
                                        </div>
                                    )}
                                </label>
                                {leadsFile && (
                                    <button type="button" onClick={handleClearLeads} title="Remove file"
                                        className="absolute top-2 right-2 p-1 rounded-full bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#f85149] hover:border-[#f85149]/40 transition-colors z-10">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {parseError && <p className="text-xs text-[#f85149] flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{parseError}</p>}

                            {/* Column mapping */}
                            {columns.length > 0 && (
                                <div className="grid grid-cols-3 gap-3">
                                    {(['phone', 'name', 'email'] as const).map(field => (
                                        <div key={field}>
                                            <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">
                                                {field === 'phone' ? '📞 Phone Column *' : field === 'name' ? '👤 Name Column *' : '📧 Email Column *'}
                                            </label>
                                            <select value={columnMap[field]}
                                                onChange={e => setColumnMap(prev => ({ ...prev, [field]: e.target.value }))}
                                                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50">
                                                <option value="">— not selected —</option>
                                                {columns.map(col => <option key={col} value={col}>{col}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Preview table */}
                            {leads.length > 0 && (
                                <div className="rounded-lg border border-[#30363d] overflow-auto max-h-36" style={{ scrollbarWidth: 'thin' }}>
                                    <table className="w-full text-[10px]">
                                        <thead className="bg-[#21262d] sticky top-0">
                                            <tr>{columns.map(col => <th key={col} className="px-3 py-1.5 text-left text-[#8b949e] font-semibold whitespace-nowrap">{col}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {leads.slice(0, 5).map((row, i) => (
                                                <tr key={i} className="border-t border-[#21262d] hover:bg-[#21262d]/50">
                                                    {columns.map(col => <td key={col} className="px-3 py-1.5 text-[#c9d1d9] whitespace-nowrap max-w-[150px] truncate">{row[col]}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {leads.length > 5 && <p className="text-center text-[10px] text-[#8b949e] py-1 border-t border-[#21262d]">… and {leads.length - 5} more rows</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── STEP 2: RAG Knowledge Base (Multi-file) */}
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Brain className="w-4 h-4 text-[#a371f7]" />
                                <span className="text-sm font-semibold text-[#e6edf3]">Step 2 — Knowledge Base</span>
                                <span className="ml-2 text-[10px] text-[#8b949e]">Optional — multiple files supported</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {ragFiles.length > 0 && (
                                    <span className="text-[10px] text-[#8b949e]">
                                        {ragFiles.length} file{ragFiles.length > 1 ? 's' : ''} · {ragContent.length.toLocaleString()} chars
                                    </span>
                                )}
                                <a href="/sample_knowledge_base.txt" download className="text-xs text-[#a371f7] hover:underline flex items-center gap-1">
                                    <Download className="w-3 h-3" /> Sample
                                </a>
                            </div>
                        </div>
                        <div className="p-4 space-y-3">
                            {/* Dropzone for adding files */}
                            <label className="flex flex-col items-center justify-center w-full h-16 rounded-lg border-2 border-dashed cursor-pointer transition-colors
                                border-[#30363d] hover:border-[#a371f7]/50 hover:bg-[#a371f7]/5">
                                <input key={ragInputKey} type="file" accept=".pdf,.docx,.doc,.txt,.csv,.md" className="hidden" multiple
                                    onChange={e => { if (e.target.files) { Array.from(e.target.files).forEach(f => handleRagFile(f)); } }} />
                                {ragLoading ? (
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 text-[#a371f7] animate-spin" />
                                        <span className="text-xs text-[#8b949e]">Processing file…</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <Brain className="w-4 h-4 text-[#8b949e]" />
                                        <span className="text-xs text-[#8b949e]">{ragFiles.length > 0 ? 'Add another file' : 'Click to attach knowledge base files'}</span>
                                    </div>
                                )}
                            </label>

                            {/* Uploaded files list */}
                            {ragFiles.length > 0 && (
                                <div className="space-y-1.5">
                                    {ragFiles.map((f, i) => (
                                        <div key={`${f.info.fileName}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d]">
                                            <CheckCircle2 className="w-4 h-4 text-[#a371f7] flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-medium text-[#e6edf3] truncate">{f.info.fileName}</div>
                                                <div className="text-[10px] text-[#8b949e]">
                                                    {f.info.charCount.toLocaleString()} chars{f.info.truncated && ' (truncated)'}
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => handleRemoveRagFile(i)} title="Remove this file"
                                                className="p-1 rounded text-[#8b949e] hover:text-[#f85149] transition-colors flex-shrink-0">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={handleClearRag}
                                        className="text-[10px] text-[#f85149] hover:underline mt-1">
                                        Clear all files
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    </div>{/* end Steps 1 & 2 grid */}

                    {/* Steps 3 & 4 side-by-side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* ── STEP 3: Agent Persona & Campaign Prompt */}
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bot className="w-4 h-4 text-[#3fb950]" />
                                <span className="text-sm font-semibold text-[#e6edf3]">Step 3 — Agent Persona & Campaign Prompt</span>
                            </div>
                            <button type="button" onClick={() => setPrompt("You are a real estate agent calling {{lead.name}} from {{lead.city}}. Their budget is around {{lead.budget}}. Introduce yourself and ask if they have a minute to discuss our new luxury project 'Project Sunset'. Use your knowledge base to answer questions.")} className="text-xs text-[#3fb950] hover:underline">
                                Insert Sample Prompt
                            </button>
                        </div>
                        <div className="p-4 space-y-3">
                            {/* Agent Name */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">Agent Name (optional)</label>
                                    <input type="text" value={agentName} onChange={e => setAgentName(e.target.value)}
                                        placeholder="e.g. Priya, Rahul, Alex"
                                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#3fb950]/50" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">Initial Greeting (optional) — supports {`{{lead.X}}`} tags</label>
                                    <input
                                        ref={greetingInputRef}
                                        type="text" value={greeting}
                                        onChange={e => setGreeting(e.target.value)}
                                        onFocus={() => setLastFocusedField('greeting')}
                                        placeholder="Namaste {{lead.name}} ji, main Priya bol rahi hoon…"
                                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:ring-1 focus:ring-[#3fb950]/50" />
                                    {greetingPreview && greetingPreview !== greeting && (
                                        <p className="mt-1 text-[10px] text-[#3fb950] truncate" title={greetingPreview}>
                                            ▶ {greetingPreview}
                                        </p>
                                    )}
                                </div>
                            </div>
                            {/* System Prompt — compact summary with edit button */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">System Prompt / Campaign Instructions *</label>
                                    <span className="text-[10px] text-[#484f58] font-mono">{prompt.length} chars</span>
                                </div>
                                {prompt ? (
                                    <button type="button" onClick={() => setShowPromptModal(true)}
                                        className="w-full text-left px-3 py-2 rounded-lg border border-[#30363d] bg-[#0d1117] hover:border-[#3fb950]/40 transition-colors group">
                                        <p className="text-xs text-[#c9d1d9] line-clamp-2 leading-relaxed">{prompt}</p>
                                        <p className="text-[10px] text-[#3fb950] mt-1 group-hover:underline">Click to edit full prompt &amp; preview →</p>
                                    </button>
                                ) : (
                                    <button type="button" onClick={() => setShowPromptModal(true)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-dashed border-[#30363d] hover:border-[#3fb950]/50 hover:bg-[#3fb950]/5 transition-colors text-left">
                                        <p className="text-xs text-[#484f58]">Click to define the agent's persona and campaign goal…</p>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── STEP 4: Voice & Model */}
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#30363d] flex items-center gap-2">
                            <Globe className="w-4 h-4 text-[#d29922]" />
                            <span className="text-sm font-semibold text-[#e6edf3]">Step 4 — Voice & Model</span>
                        </div>
                        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                            {/* LLM Provider */}
                            <div>
                                <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">LLM</label>
                                <select value={selectedProvider} onChange={e => {
                                    setSelectedProvider(e.target.value);
                                    const m = catalog.llm[e.target.value]?.models ?? [];
                                    if (m.length > 0) setSelectedLlmModel(m[0].value);
                                }}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50">
                                    {llmProviders.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            {/* LLM Model */}
                            <div>
                                <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">Model</label>
                                <select value={selectedLlmModel} onChange={e => setSelectedLlmModel(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50">
                                    {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            {/* TTS Provider */}
                            <div>
                                <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">TTS Provider</label>
                                <select value={selectedTtsProvider} onChange={e => handleTtsProviderChange(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50">
                                    {ttsProviders.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            {/* Voice */}
                            <div>
                                <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">Voice</label>
                                <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50">
                                    {voices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                                </select>
                            </div>
                            {/* Language */}
                            <div>
                                <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-1">Language</label>
                                <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-[#30363d] bg-[#0d1117] text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50">
                                    {STT_LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                                </select>
                            </div>
                            {/* Voice preview */}
                            <div className="col-span-2 md:col-span-4">
                                <button type="button" onClick={previewState === 'playing' ? stopPreview : playPreview}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#30363d] text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] transition-colors">
                                    {previewState === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                                     previewState === 'playing' ? <StopCircle className="w-3.5 h-3.5 text-[#f85149]" /> :
                                     <Play className="w-3.5 h-3.5" />}
                                    {previewState === 'loading' ? 'Loading preview…' : previewState === 'playing' ? 'Stop preview' : 'Preview voice'}
                                </button>
                            </div>
                            {/* Speech Speed Slider */}
                            <div className="col-span-2 md:col-span-4 mt-2">
                                <label className="block text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
                                    Speech Speed: {speechSpeed.toFixed(1)}x
                                </label>
                                <input 
                                    type="range" 
                                    min="0.5" max="2.0" step="0.1" 
                                    value={speechSpeed} 
                                    onChange={e => setSpeechSpeed(parseFloat(e.target.value))}
                                    className="w-full accent-[#3fb950]"
                                />
                                <div className="flex justify-between text-[10px] text-[#8b949e] mt-1 px-1">
                                    <span>0.5x</span>
                                    <span>1.0x</span>
                                    <span>2.0x</span>
                                </div>
                                <p className="text-[10px] text-[#484f58] mt-2 italic">
                                    Note: Some TTS providers (like Sarvam) may not natively support hot-swapping speech speed and will default to 1.0x.
                                </p>
                            </div>
                        </div>
                    </div>

                    </div>{/* end Steps 3 & 4 grid */}

                    {/* ── Error message */}
                    {status === 'error' && message && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {message}
                        </div>
                    )}

                    {/* ── Draft auto-save indicator */}
                    {draftSaved && (
                        <p className="text-center text-[10px] text-[#3fb950] animate-pulse">✓ Draft auto-saved</p>
                    )}
                </form>

                {/* ── Progress bar */}
                {(isRunning || isDone) && (
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-[#e6edf3]">
                                {isRunning ? `Dialing… ${progress.current} of ${progress.total}` : `Completed — ${progress.current} of ${progress.total} dispatched`}
                            </span>
                            <div className="flex items-center gap-2">
                                {isRunning && (
                                    <button onClick={() => { cancelRef.current = true; }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#f85149] hover:bg-[#f85149]/90 transition-colors animate-pulse">
                                        <StopCircle className="w-3.5 h-3.5" />
                                        Stop Campaign
                                    </button>
                                )}
                                {status === 'completed' && (
                                    <button onClick={handleDownload}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#3fb950] hover:bg-[#3fb950]/90 transition-colors">
                                        <Download className="w-3.5 h-3.5" />
                                        Download Report
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="w-full h-2 bg-[#21262d] rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-[#a371f7] to-[#2f81f7] rounded-full transition-all duration-500"
                                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
                        </div>
                        {message && <p className="text-xs text-[#8b949e]">{message}</p>}
                    </div>
                )}

                {/* ── Live Results Table */}
                {leads.length > 0 && (isRunning || isDone) && (
                    <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
                            <span className="text-sm font-semibold text-[#e6edf3]">Live Results</span>
                            <span className="text-[10px] text-[#8b949e]">Updates every 4s as calls complete</span>
                        </div>
                        <div className="overflow-auto max-h-80" style={{ scrollbarWidth: 'thin' }}>
                            <table className="w-full text-xs">
                                <thead className="bg-[#21262d] sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-[#8b949e] font-semibold">#</th>
                                        {columnMap.name && <th className="px-3 py-2 text-left text-[#8b949e] font-semibold">Name</th>}
                                        <th className="px-3 py-2 text-left text-[#8b949e] font-semibold">Phone</th>
                                        <th className="px-3 py-2 text-left text-[#8b949e] font-semibold">Status</th>
                                        <th className="px-3 py-2 text-left text-[#8b949e] font-semibold">Sentiment</th>
                                        <th className="px-3 py-2 text-left text-[#8b949e] font-semibold">Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.filter(l => l[columnMap.phone]?.trim().length >= 10).map((lead, i) => {
                                        const result = resultMap.get(i);
                                        const isCurrentlyDialing = isRunning && i === progress.current - 1 && !result;
                                        return (
                                            <tr key={i} className="border-t border-[#21262d] hover:bg-[#21262d]/40 transition-colors">
                                                <td className="px-3 py-2 text-[#8b949e]">{i + 1}</td>
                                                {columnMap.name && <td className="px-3 py-2 text-[#e6edf3] font-medium">{lead[columnMap.name] || '—'}</td>}
                                                <td className="px-3 py-2 text-[#c9d1d9] font-mono">{lead[columnMap.phone]}</td>
                                                <td className="px-3 py-2">
                                                    {isCurrentlyDialing && !result ? (
                                                        <span className="flex items-center gap-1 text-[#2f81f7] text-[10px] font-semibold">
                                                            <Loader2 className="w-3 h-3 animate-spin" /> Dialing…
                                                        </span>
                                                    ) : result?.status === 'Connected' ? (
                                                        <span className="flex items-center gap-1 text-[#f0883e] text-[10px] font-semibold">
                                                            <Loader2 className="w-3 h-3 animate-spin" /> In Call…
                                                        </span>
                                                    ) : result ? (
                                                        <StatusBadge status={result.status} />
                                                    ) : (
                                                        <span className="text-[10px] text-[#484f58]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {result?.sentiment ? <SentimentBadge sentiment={result.sentiment} /> : <span className="text-[10px] text-[#484f58]">—</span>}
                                                </td>
                                                <td className="px-3 py-2 text-[#8b949e] max-w-xs truncate">{result?.remarks || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

            </div>{/* end scrollable content */}
            </div>

            {/* ── Sticky Bottom Action Bar */}
            <div className="flex-shrink-0 border-t border-[#30363d] bg-[#0d1117]/95 backdrop-blur-md px-6 py-3">
                {/* Error message */}
                {status === 'error' && message && (
                    <div className="flex items-center gap-2 px-4 py-2 mb-2 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-xs">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {message}
                    </div>
                )}
                {/* Draft auto-save */}
                {draftSaved && (
                    <p className="text-center text-[10px] text-[#3fb950] animate-pulse mb-2">✓ Draft auto-saved</p>
                )}
                {/* Start button (idle / error state) */}
                {!isRunning && status !== 'completed' && (
                    <button type="submit" form="bulk-campaign-form" disabled={leads.length === 0 || !columnMap.phone || ragLoading}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white
                            bg-gradient-to-r from-[#a371f7] to-[#2f81f7]
                            hover:from-[#9461e7] hover:to-[#1f71e7]
                            disabled:opacity-40 disabled:cursor-not-allowed
                            shadow-lg shadow-[#a371f7]/20 transition-all active:scale-[0.99]">
                        <Play className="w-4 h-4" />
                        Start Campaign ({leads.filter(l => l[columnMap.phone]?.trim().length >= 10).length} leads)
                    </button>
                )}
                {/* Run Again / New Campaign buttons (completed state) */}
                {!isRunning && status === 'completed' && (
                    <div className="flex gap-3">
                        <button type="button" onClick={handleRunAgain}
                            disabled={leads.length === 0 || !columnMap.phone}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white
                                bg-gradient-to-r from-[#3fb950] to-[#2f81f7]
                                hover:from-[#2fa040] hover:to-[#1f71e7]
                                disabled:opacity-40 disabled:cursor-not-allowed
                                shadow-lg shadow-[#3fb950]/20 transition-all active:scale-[0.99]">
                            <RefreshCw className="w-4 h-4" />
                            Run Again ({leads.filter(l => l[columnMap.phone]?.trim().length >= 10).length} leads)
                        </button>
                        <button type="button" onClick={handleReset}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold
                                text-[#f85149] border border-[#f85149]/30 hover:bg-[#f85149]/10 transition-all">
                            <X className="w-4 h-4" />
                            New
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
