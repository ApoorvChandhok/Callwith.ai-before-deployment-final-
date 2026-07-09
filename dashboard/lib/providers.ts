/**
 * providers.ts — Central source of truth for all AI provider voice/model catalogs.
 *
 * Live data is fetched from each provider's API when an API key is available.
 * If a live fetch fails, the FALLBACK_CATALOG is used so the UI always works.
 */

export interface VoiceOption {
  value: string;
  label: string;
  gender?: "male" | "female" | "neutral";
  language?: string;
  preview_url?: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export interface ProviderCatalog {
  tts: {
    [provider: string]: {
      label: string;
      models: ModelOption[];
      voices: VoiceOption[];
      languages?: ModelOption[];
    };
  };
  stt: {
    [provider: string]: {
      label: string;
      models: ModelOption[];
    };
  };
  llm: {
    [provider: string]: {
      label: string;
      models: ModelOption[];
    };
  };
}

/** Static fallback — always present, used if live API fetch fails */
export const FALLBACK_CATALOG: ProviderCatalog = {
  tts: {
    sarvam: {
      label: "Sarvam AI (Indian Voices)",
      models: [
        { value: "bulbul:v3", label: "Bulbul v3 (Latest)" },
        { value: "bulbul:v2", label: "Bulbul v2" },
      ],
      voices: [
        // Valid bulbul:v3 speakers (as of June 2026)
        { value: "ishita", label: "Ishita", gender: "female", language: "Indian" },
        { value: "shreya", label: "Shreya", gender: "female", language: "Indian" },
        { value: "priya", label: "Priya", gender: "female", language: "Indian" },
        { value: "neha", label: "Neha", gender: "female", language: "Indian" },
        { value: "pooja", label: "Pooja", gender: "female", language: "Indian" },
        { value: "simran", label: "Simran", gender: "female", language: "Indian" },
        { value: "kavya", label: "Kavya", gender: "female", language: "Indian" },
        { value: "ritu", label: "Ritu", gender: "female", language: "Indian" },
        { value: "roopa", label: "Roopa", gender: "female", language: "Indian" },
        { value: "rahul", label: "Rahul", gender: "male", language: "Indian" },
        { value: "rohan", label: "Rohan", gender: "male", language: "Indian" },
        { value: "ratan", label: "Ratan", gender: "male", language: "Indian" },
        { value: "dev", label: "Dev", gender: "male", language: "Indian" },
        { value: "manan", label: "Manan", gender: "male", language: "Indian" },
        { value: "sumit", label: "Sumit", gender: "male", language: "Indian" },
        { value: "aditya", label: "Aditya", gender: "male", language: "Indian" },
        { value: "kabir", label: "Kabir", gender: "male", language: "Indian" },
        { value: "varun", label: "Varun", gender: "male", language: "Indian" },
        { value: "aayan", label: "Aayan", gender: "male", language: "Indian" },
        { value: "ashutosh", label: "Ashutosh", gender: "male", language: "Indian" },
        { value: "advait", label: "Advait", gender: "male", language: "Indian" },
        { value: "amit", label: "Amit", gender: "male", language: "Indian" },
        { value: "shubh", label: "Shubh", gender: "male", language: "Indian" },
      ],
      languages: [
        { value: "hi-IN", label: "Hindi (India)" },
        { value: "en-IN", label: "English (India)" },
        { value: "ta-IN", label: "Tamil (India)" },
        { value: "te-IN", label: "Telugu (India)" },
        { value: "kn-IN", label: "Kannada (India)" },
        { value: "ml-IN", label: "Malayalam (India)" },
        { value: "mr-IN", label: "Marathi (India)" },
        { value: "gu-IN", label: "Gujarati (India)" },
        { value: "bn-IN", label: "Bengali (India)" },
        { value: "od-IN", label: "Odia (India)" },
        { value: "pa-IN", label: "Punjabi (India)" },
      ],
    },
    openai: {
      label: "OpenAI TTS",
      models: [
        { value: "tts-1", label: "TTS-1 (Standard)" },
        { value: "tts-1-hd", label: "TTS-1 HD (High Quality)" },
        { value: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS" },
      ],
      voices: [
        { value: "alloy", label: "Alloy", gender: "neutral" },
        { value: "echo", label: "Echo", gender: "male" },
        { value: "fable", label: "Fable", gender: "neutral" },
        { value: "onyx", label: "Onyx", gender: "male" },
        { value: "nova", label: "Nova", gender: "female" },
        { value: "shimmer", label: "Shimmer", gender: "female" },
        { value: "ash", label: "Ash", gender: "neutral" },
        { value: "sage", label: "Sage", gender: "neutral" },
        { value: "coral", label: "Coral", gender: "female" },
      ],
    },
    cartesia: {
      label: "Cartesia (Sonic 2)",
      models: [
        { value: "sonic-2", label: "Sonic 2 (Latest)" },
        { value: "sonic-english", label: "Sonic English" },
        { value: "sonic-multilingual", label: "Sonic Multilingual" },
      ],
      voices: [
        { value: "f786b574-daa5-4673-aa0c-cbe3e8534c02", label: "Default Voice" },
        { value: "694f9389-aac1-45b6-b726-9d9369183238", label: "Barbershop Man" },
        { value: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Helpful Woman" },
        { value: "b7d50908-b17c-442d-ad8d-810c63997ed9", label: "Commercial Lady" },
        { value: "c2ac25f9-ecc4-4f56-9095-651354df60c0", label: "Friendly Reading Man" },
      ],
    },
    deepgram: {
      label: "Deepgram Aura",
      models: [
        { value: "aura-2", label: "Aura 2 (Latest)" },
        { value: "aura", label: "Aura (Standard)" },
      ],
      voices: [
        { value: "aura-asteria-en", label: "Asteria (English)", gender: "female" },
        { value: "aura-luna-en", label: "Luna (English)", gender: "female" },
        { value: "aura-stella-en", label: "Stella (English)", gender: "female" },
        { value: "aura-athena-en", label: "Athena (English)", gender: "female" },
        { value: "aura-hera-en", label: "Hera (English)", gender: "female" },
        { value: "aura-orion-en", label: "Orion (English)", gender: "male" },
        { value: "aura-arcas-en", label: "Arcas (English)", gender: "male" },
        { value: "aura-perseus-en", label: "Perseus (English)", gender: "male" },
        { value: "aura-angus-en", label: "Angus (English)", gender: "male" },
        { value: "aura-orpheus-en", label: "Orpheus (English)", gender: "male" },
        { value: "aura-helios-en", label: "Helios (English)", gender: "male" },
        { value: "aura-zeus-en", label: "Zeus (English)", gender: "male" },
      ],
    },
  },
  stt: {
    deepgram: {
      label: "Deepgram",
      models: [
        { value: "nova-3", label: "Nova 3 (Newest)" },
        { value: "nova-2", label: "Nova 2 (Balanced)" },
        { value: "nova-2-general", label: "Nova 2 General" },
        { value: "nova-2-phonecall", label: "Nova 2 Phonecall" },
        { value: "nova-2-finance", label: "Nova 2 Finance" },
        { value: "enhanced", label: "Enhanced" },
        { value: "base", label: "Base" },
      ],
    },
    whisper: {
      label: "OpenAI Whisper",
      models: [
        { value: "whisper-1", label: "Whisper 1" },
      ],
    },
  },
  llm: {
    groq: {
      label: "Groq (Fast Inference)",
      models: [
        { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile (Recommended)" },
        { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B Versatile" },
        { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (Fast)" },
        { value: "llama3-70b-8192", label: "Llama 3 70B" },
        { value: "llama3-8b-8192", label: "Llama 3 8B" },
        { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
        { value: "gemma2-9b-it", label: "Gemma 2 9B" },
        { value: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
      ],
    },
    openrouter: {
      label: "OpenRouter (Groq-pinned)",
      models: [
        { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B Instruct (Fast) ⭐" },
        { value: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct" },
        { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B Instruct" },
        { value: "mistralai/mistral-7b-instruct", label: "Mistral 7B Instruct (Fast)" },
        { value: "google/gemma-2-9b-it", label: "Gemma 2 9B" },
      ],
    },
    google: {
      label: "Google (Gemini)",
      models: [
        // ── Gemini 2.5 family — up to 2M context ──
        { value: "gemini-2.5-pro",           label: "Gemini 2.5 Pro (2M ctx) ⭐" },
        { value: "gemini-2.5-flash",         label: "Gemini 2.5 Flash (1M ctx) — Best for voice" },
        { value: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview" },
        // ── Gemini 2.0 family — 1M context ──
        { value: "gemini-2.0-flash",         label: "Gemini 2.0 Flash (1M ctx)" },
        { value: "gemini-2.0-flash-exp",     label: "Gemini 2.0 Flash Experimental" },
        // ── Gemini 1.5 family — stable / GA ──
        { value: "gemini-1.5-pro",           label: "Gemini 1.5 Pro (2M ctx)" },
        { value: "gemini-1.5-pro-latest",    label: "Gemini 1.5 Pro Latest (2M ctx)" },
        { value: "gemini-1.5-flash",         label: "Gemini 1.5 Flash (1M ctx)" },
        { value: "gemini-1.5-flash-latest",  label: "Gemini 1.5 Flash Latest (1M ctx)" },
        { value: "gemini-1.5-flash-8b",      label: "Gemini 1.5 Flash 8B (Fast / Low cost)" },
      ],
    },
  },
};

/** Common language options for STT */
export const STT_LANGUAGES: ModelOption[] = [
  { value: "auto", label: "Auto-detect (Multi-language)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-IN", label: "English (India)" },
  { value: "hi", label: "Hindi" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "bn", label: "Bengali" },
  { value: "pa", label: "Punjabi" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese (Mandarin)" },
  { value: "ja", label: "Japanese" },
];
