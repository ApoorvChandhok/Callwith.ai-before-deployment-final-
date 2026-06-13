/**
 * GET /api/providers
 *
 * Returns the full AI provider catalog: voices, TTS models, STT models, LLM models.
 * Attempts to fetch live data from each provider's API.
 * Falls back gracefully to the static FALLBACK_CATALOG if any fetch fails.
 * Results are cached in-memory for 10 minutes to avoid API rate limits.
 */
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { FALLBACK_CATALOG, STT_LANGUAGES, type ProviderCatalog } from "@/lib/providers";

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Env loader (reads root .env for API keys not exposed to Next.js) ──────────
function loadRootEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), "..", ".env");
  const result: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return result;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim().replace(/\r$/, "");
    result[key] = val;
  }
  return result;
}

// ── Sarvam voice fetcher ─────────────────────────────────────────────────────
async function fetchSarvamVoices(apiKey: string) {
  try {
    const res = await fetch("https://api.sarvam.ai/text-to-speech/voices", {
      headers: { "API-Subscription-Key": apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Sarvam HTTP ${res.status}`);
    const json = await res.json();
    // Sarvam returns { voices: [...] } or a plain array
    const voiceArr: any[] = Array.isArray(json) ? json : (json.voices ?? []);
    if (voiceArr.length === 0) throw new Error("Empty voice list");
    return voiceArr.map((v: any) => ({
      value: v.name ?? v.speaker_id ?? v.id ?? v,
      label: toTitleCase(v.name ?? v.speaker_id ?? v.id ?? String(v)),
      gender: v.gender?.toLowerCase(),
      language: v.language ?? "Indian",
    }));
  } catch (e) {
    console.warn("[providers] Sarvam voice fetch failed, using fallback:", e);
    return null; // triggers fallback
  }
}

// ── Groq model fetcher ────────────────────────────────────────────────────────
async function fetchGroqModels(apiKey: string) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const json = await res.json();
    const models: any[] = json.data ?? [];
    // Filter to chat models only (exclude whisper/tts/vision)
    const chatModels = models
      .filter((m: any) => !m.id.includes("whisper") && !m.id.includes("vision"))
      .sort((a: any, b: any) => b.created - a.created)
      .map((m: any) => ({
        value: m.id,
        label: formatModelLabel(m.id),
      }));
    return chatModels.length > 0 ? chatModels : null;
  } catch (e) {
    console.warn("[providers] Groq model fetch failed, using fallback:", e);
    return null;
  }
}

// ── OpenAI model fetcher ──────────────────────────────────────────────────────
async function fetchOpenAIModels(apiKey: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const json = await res.json();
    const models: any[] = json.data ?? [];
    const llmModels = models
      .filter((m: any) => m.id.startsWith("gpt-"))
      .sort((a: any, b: any) => b.created - a.created)
      .map((m: any) => ({ value: m.id, label: m.id.toUpperCase().replace(/-/g, " ") }));
    return llmModels.length > 0 ? llmModels : null;
  } catch (e) {
    console.warn("[providers] OpenAI model fetch failed, using fallback:", e);
    return null;
  }
}

// ── Cartesia voice fetcher ────────────────────────────────────────────────────
async function fetchCartesiaVoices(apiKey: string) {
  try {
    const res = await fetch("https://api.cartesia.ai/voices", {
      headers: {
        "X-API-Key": apiKey,
        "Cartesia-Version": "2024-06-10",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Cartesia HTTP ${res.status}`);
    const voices: any[] = await res.json();
    return voices.map((v: any) => ({
      value: v.id,
      label: v.name ?? v.id,
      gender: v.gender?.toLowerCase(),
      language: v.language ?? "en",
    }));
  } catch (e) {
    console.warn("[providers] Cartesia voice fetch failed, using fallback:", e);
    return null;
  }
}

// ── Deepgram model fetcher ────────────────────────────────────────────────────
async function fetchDeepgramModels(apiKey: string) {
  try {
    const res = await fetch("https://api.deepgram.com/v1/models", {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Deepgram HTTP ${res.status}`);
    const json = await res.json();
    // Deepgram returns { stt: [...], tts: [...] }
    const sttModels = (json.stt ?? []).map((m: any) => ({
      value: m.name ?? m.model_id,
      label: toTitleCase((m.name ?? m.model_id).replace(/-/g, " ")),
    }));
    const ttsVoices = (json.tts ?? []).map((m: any) => ({
      value: m.name ?? m.model_id,
      label: toTitleCase((m.name ?? m.model_id).replace(/aura-|-en/g, " ").trim()),
      gender: m.metadata?.accent?.toLowerCase() === "american" ? undefined : undefined,
    }));
    return { sttModels: sttModels.length > 0 ? sttModels : null, ttsVoices: ttsVoices.length > 0 ? ttsVoices : null };
  } catch (e) {
    console.warn("[providers] Deepgram model fetch failed, using fallback:", e);
    return { sttModels: null, ttsVoices: null };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toTitleCase(str: string) {
  return str.replace(/(^|\s|-|_)(\w)/g, (_, sep, ch) => (sep === "-" || sep === "_" ? " " : sep) + ch.toUpperCase());
}

function formatModelLabel(id: string): string {
  const knownLabels: Record<string, string> = {
    "llama-3.3-70b-versatile": "Llama 3.3 70B Versatile (Recommended)",
    "llama-3.1-70b-versatile": "Llama 3.1 70B Versatile",
    "llama-3.1-8b-instant": "Llama 3.1 8B Instant (Fast)",
    "llama3-70b-8192": "Llama 3 70B",
    "llama3-8b-8192": "Llama 3 8B",
    "mixtral-8x7b-32768": "Mixtral 8x7B",
    "gemma2-9b-it": "Gemma 2 9B",
    "deepseek-r1-distill-llama-70b": "DeepSeek R1 Distill 70B",
  };
  return knownLabels[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function GET() {
  // Return cache if fresh
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(_cache.data);
  }

  const env = loadRootEnv();
  const sarvamKey = env.SARVAM_API_KEY ?? process.env.SARVAM_API_KEY ?? "";
  const groqKey = env.GROQ_API_KEY ?? process.env.GROQ_API_KEY ?? "";
  const openaiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const cartesiaKey = env.CARTESIA_API_KEY ?? process.env.CARTESIA_API_KEY ?? "";
  const deepgramKey = env.DEEPGRAM_API_KEY ?? process.env.DEEPGRAM_API_KEY ?? "";

  // Fetch all providers in parallel
  const [sarvamVoices, groqModels, openaiModels, cartesiaVoices, deepgramData] = await Promise.all([
    sarvamKey ? fetchSarvamVoices(sarvamKey) : Promise.resolve(null),
    groqKey ? fetchGroqModels(groqKey) : Promise.resolve(null),
    openaiKey ? fetchOpenAIModels(openaiKey) : Promise.resolve(null),
    cartesiaKey ? fetchCartesiaVoices(cartesiaKey) : Promise.resolve(null),
    deepgramKey ? fetchDeepgramModels(deepgramKey) : Promise.resolve({ sttModels: null, ttsVoices: null }),
  ]);

  // Merge live data with fallbacks
  const catalog = structuredClone(FALLBACK_CATALOG) as ProviderCatalog;

  if (sarvamVoices) catalog.tts.sarvam.voices = sarvamVoices;
  if (groqModels) catalog.llm.groq.models = groqModels;
  if (openaiModels) catalog.llm.openai.models = openaiModels;
  if (cartesiaVoices && cartesiaVoices.length > 0) catalog.tts.cartesia.voices = cartesiaVoices;
  if (deepgramData?.sttModels) catalog.stt.deepgram.models = deepgramData.sttModels;
  if (deepgramData?.ttsVoices && deepgramData.ttsVoices.length > 0) catalog.tts.deepgram.voices = deepgramData.ttsVoices;

  const response = {
    catalog,
    stt_languages: STT_LANGUAGES,
    live_fetched: {
      sarvam_voices: !!sarvamVoices,
      groq_models: !!groqModels,
      openai_models: !!openaiModels,
      cartesia_voices: !!cartesiaVoices,
      deepgram_models: !!(deepgramData?.sttModels || deepgramData?.ttsVoices),
    },
    cached_until: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
  };

  _cache = { data: response, ts: Date.now() };
  return NextResponse.json(response);
}

/** Force-clear the provider cache (call after saving new API keys) */
export async function DELETE() {
  _cache = null;
  return NextResponse.json({ cleared: true });
}
