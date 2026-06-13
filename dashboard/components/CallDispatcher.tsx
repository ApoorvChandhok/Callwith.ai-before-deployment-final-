"use client";

import { useState, useEffect } from 'react';
import { Phone, Loader2, RefreshCw, ChevronDown } from 'lucide-react';
import type { ProviderCatalog } from '@/lib/providers';
import { FALLBACK_CATALOG } from '@/lib/providers';

export default function CallDispatcher() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [prompt, setPrompt] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    // Selected provider/voice/model — default from agent config
    const [selectedProvider, setSelectedProvider] = useState('groq');
    const [selectedVoice, setSelectedVoice] = useState('aravind');
    const [selectedTtsProvider, setSelectedTtsProvider] = useState('sarvam');

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

    // Fetch defaults from outbound agent config + provider catalog
    useEffect(() => {
        Promise.all([
            fetch('/api/agent-config?mode=outbound').then(r => r.json()).catch(() => null),
            loadCatalog(),
        ]).then(([configData]) => {
            if (configData?.config) {
                if (configData.config.llm_provider) setSelectedProvider(configData.config.llm_provider);
                if (configData.config.tts_provider) setSelectedTtsProvider(configData.config.tts_provider);
                if (configData.config.tts_voice) setSelectedVoice(configData.config.tts_voice);
            }
        });
    }, []);

    // When TTS provider changes, auto-select first voice
    const handleTtsProviderChange = (provider: string) => {
        setSelectedTtsProvider(provider);
        const voices = catalog.tts[provider]?.voices ?? [];
        if (voices.length > 0) setSelectedVoice(voices[0].value);
    };

    const handleDispatch = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMessage('');
        try {
            const res = await fetch('/api/dispatch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber,
                    prompt,
                    modelProvider: selectedProvider,
                    voice: selectedVoice,
                    ttsProvider: selectedTtsProvider,
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

    return (
        <div className="w-full">
            <div className="p-8">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200 dark:border-[#30363d]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                            <Phone className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-[#e6edf3]">Manual Dial</h2>
                            <p className="text-sm text-gray-500 dark:text-[#8b949e]">Deploy an agent to a specific number</p>
                        </div>
                    </div>
                    <button
                        onClick={loadCatalog}
                        disabled={catalogLoading}
                        title="Refresh voices & models from provider APIs"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-[#8b949e] border border-gray-200 dark:border-[#30363d] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} />
                        {catalogLoading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>

                {/* Live indicator */}
                {!catalogLoading && (
                    <div className="mb-5 flex items-center gap-2 text-xs text-gray-500 dark:text-[#8b949e]">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                        Voices & models fetched live from provider APIs
                        {liveStatus.sarvam_voices && <span className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 font-medium">Sarvam ✓</span>}
                        {liveStatus.groq_models && <span className="px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium">Groq ✓</span>}
                    </div>
                )}

                <form onSubmit={handleDispatch} className="space-y-5">
                    {/* Phone number */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-[#e6edf3]">Phone Number</label>
                        <input
                            type="tel"
                            placeholder="+919876543210"
                            required
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    {/* Context prompt */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-[#e6edf3]">Context / Prompt (optional)</label>
                        <textarea
                            placeholder="e.g. Call is regarding the customer's recent test drive of Hyundai Creta..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className={`${inputClass} h-20 resize-none`}
                        />
                    </div>

                    {/* LLM Provider + TTS Provider */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 dark:text-[#e6edf3] flex items-center gap-1.5">
                                LLM Provider
                                {liveStatus.groq_models && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="Live data" />}
                            </label>
                            <div className="relative">
                                <select
                                    className={`${inputClass} appearance-none pr-8`}
                                    value={selectedProvider}
                                    onChange={(e) => setSelectedProvider(e.target.value)}
                                    disabled={catalogLoading}
                                >
                                    {catalogLoading
                                        ? <option>Loading...</option>
                                        : llmProviders.map(p => <option key={p.value} value={p.value}>{p.label}</option>)
                                    }
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700 dark:text-[#e6edf3]">TTS Provider</label>
                            <div className="relative">
                                <select
                                    className={`${inputClass} appearance-none pr-8`}
                                    value={selectedTtsProvider}
                                    onChange={(e) => handleTtsProviderChange(e.target.value)}
                                    disabled={catalogLoading}
                                >
                                    {catalogLoading
                                        ? <option>Loading...</option>
                                        : ttsProviders.map(p => <option key={p.value} value={p.value}>{p.label}</option>)
                                    }
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            </div>
                        </div>
                    </div>

                    {/* Voice selector — dynamic based on TTS provider */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-[#e6edf3] flex items-center gap-1.5">
                            Voice
                            {(liveStatus.sarvam_voices && selectedTtsProvider === 'sarvam') && (
                                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" title="Live from Sarvam API" />
                            )}
                            {catalogLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                        </label>
                        <div className="relative">
                            <select
                                className={`${inputClass} appearance-none pr-8`}
                                value={selectedVoice}
                                onChange={(e) => setSelectedVoice(e.target.value)}
                                disabled={catalogLoading}
                            >
                                {catalogLoading
                                    ? <option>Loading voices...</option>
                                    : voices.map(v => <option key={v.value} value={v.value}>{v.label}</option>)
                                }
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <p className="text-xs text-gray-400 dark:text-[#8b949e]">
                            {voices.length} voice{voices.length !== 1 ? 's' : ''} available for {catalog.tts[selectedTtsProvider]?.label ?? selectedTtsProvider}
                        </p>
                    </div>

                    {/* Dispatch button */}
                    <button
                        type="submit"
                        disabled={status === 'loading' || catalogLoading}
                        className="w-full py-2.5 px-4 bg-indigo-500 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-sm shadow-indigo-500/20"
                    >
                        {status === 'loading' ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</>
                        ) : (
                            <><Phone className="w-4 h-4" /> Initiate Call</>
                        )}
                    </button>

                    {message && (
                        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 border ${
                            status === 'success'
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
