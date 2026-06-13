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
        { value: "anushka", label: "Anushka", gender: "female", language: "Indian" },
        { value: "aravind", label: "Aravind", gender: "male", language: "Indian" },
        { value: "amartya", label: "Amartya", gender: "male", language: "Indian" },
        { value: "dhruv", label: "Dhruv", gender: "male", language: "Indian" },
        { value: "ishita", label: "Ishita", gender: "female", language: "Indian" },
        { value: "meera", label: "Meera", gender: "female", language: "Indian" },
        { value: "pavithra", label: "Pavithra", gender: "female", language: "Indian" },
        { value: "maitreyi", label: "Maitreyi", gender: "female", language: "Indian" },
        { value: "arvind", label: "Arvind", gender: "male", language: "Indian" },
        { value: "arjun", label: "Arjun", gender: "male", language: "Indian" },
        { value: "abhilash", label: "Abhilash", gender: "male", language: "Indian" },
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
    openai: {
      label: "OpenAI",
      models: [
        { value: "gpt-4o", label: "GPT-4o (Recommended)" },
        { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast)" },
        { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
        { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
      ],
    },
    google: {
      label: "Google (Gemini)",
      models: [
        { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
        { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
        { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
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
