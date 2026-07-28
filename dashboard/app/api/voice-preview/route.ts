/**
 * GET /api/voice-preview
 *
 * Generates a short TTS audio sample for the given voice/provider.
 * Used by AgentConfigForm so users can audition voices before saving.
 *
 * Query params:
 *   provider  - tts provider (sarvam | deepgram | cartesia | openai)
 *   voice     - voice id / speaker name
 *   model     - tts model (optional)
 *   language  - language code (optional, defaults to en-IN for Sarvam)
 */
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

// Reuse the same root .env loader pattern as the providers route
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

// Short, natural-sounding sample text per language
const SAMPLE_TEXTS_FEMALE: Record<string, string> = {
  "hi-IN": "नमस्ते! मैं कॉल विथ एआई से बात कर रही हूँ। बताइए, आज मैं आपकी क्या मदद कर सकती हूँ?",
  "ta-IN": "வணக்கம்! நான் உங்கள் AI குரல் உதவியாளர். இன்று நான் உங்களுக்கு எப்படி உதவலாம்?",
  "te-IN": "హలో! నేను మీ AI వాయిస్ అసిస్టెంట్ ని. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?",
  "kn-IN": "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ವಾಯ್ಸ್ ಅಸಿಸ್ಟೆಂಟ್. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
  "ml-IN": "ഹലോ! ഞാൻ നിങ്ങളുടെ AI വോയ്സ് അസിസ്റ്റന്റ് ആണ്. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?",
  "mr-IN": "नमस्ते! मी तुमची AI व्हॉइस असिस्टंट आहे. आज मी तुम्हाला कशी मदत करू शकते?",
  "gu-IN": "નમસ્તે! હું તમારી AI વૉઇસ આસિસ્ટન્ટ છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
  "bn-IN": "হ্যালো! আমি আপনার AI ভয়েস অ্যাসিস্ট্যান্ট। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ AI ਵੌਇਸ ਅਸਿਸਟੈਂਟ ਹਾਂ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦੀ ਹਾਂ?",
  "en-IN": "Hi there! Main Call with AI se baat kar rahi hoon. How can I help you today?",
  "en-US": "Hi there! Main Call with AI se baat kar rahi hoon. How can I help you today?",
  default: "Hi there! Main Call with AI se baat kar rahi hoon. How can I help you today?",
};

const SAMPLE_TEXTS_MALE: Record<string, string> = {
  "hi-IN": "नमस्ते! मैं कॉल विथ एआई से बात कर रहा हूँ। बताइए, आज मैं आपकी क्या मदद कर सकता हूँ?",
  "ta-IN": "வணக்கம்! நான் உங்கள் AI குரல் உதவியாளர். இன்று நான் உங்களுக்கு எப்படி உதவலாம்?",
  "te-IN": "హలో! నేను మీ AI వాయిస్ అసిస్టెంట్ ని. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?",
  "kn-IN": "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ AI ವಾಯ್ಸ್ ಅಸಿಸ್ಟೆಂಟ್. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
  "ml-IN": "ഹലോ! ഞാൻ നിങ്ങളുടെ AI വോയ്സ് അസിസ്റ്റന്റ് ആണ്. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?",
  "mr-IN": "नमस्ते! मी तुमचा AI व्हॉइस असिस्टंट आहे. आज मी तुम्हाला कशी मदत करू शकतो?",
  "gu-IN": "નમસ્તે! હું તમારો AI વૉઇસ આસિસ્ટન્ટ છું. આજે હું તમને કેવી રીતે મદદ કરી શકું?",
  "bn-IN": "হ্যালো! আমি আপনার AI ভয়েস অ্যাসিস্ট্যান্ট। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?",
  "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡਾ AI ਵੌਇਸ ਅਸਿਸਟੈਂਟ ਹਾਂ। ਅੱਜ ਮੈਂ ਤੁਹਾਡੀ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?",
  "en-IN": "Hi there! Main Call with AI se baat kar raha hoon. How can I help you today?",
  "en-US": "Hi there! Main Call with AI se baat kar raha hoon. How can I help you today?",
  default: "Hi there! Main Call with AI se baat kar raha hoon. How can I help you today?",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provider = (searchParams.get("provider") || "sarvam").toLowerCase();
  const voice    = searchParams.get("voice") || "";
  const model    = searchParams.get("model") || "";
  const language = searchParams.get("language") || "en-IN";

  const MALE_SARVAM_VOICES = new Set([
    "aditya", "ashutosh", "rahul", "rohan", "amit", "dev", "ratan", "varun", "manan", "sumit", "kabir", "aayan", "shubh", "advait", "anand", "tarun", "sunny", "mani", "gokul", "vijay", "mohit", "rehan", "soham"
  ]);

  const isMale = provider === "sarvam" ? MALE_SARVAM_VOICES.has(voice.toLowerCase()) : false;
  const sampleText = isMale 
    ? (SAMPLE_TEXTS_MALE[language] ?? SAMPLE_TEXTS_MALE.default)
    : (SAMPLE_TEXTS_FEMALE[language] ?? SAMPLE_TEXTS_FEMALE.default);
  const env = loadRootEnv();

  // ── Valid Sarvam bulbul:v3 speakers (server-side guard) ─────────────────────
  const VALID_SARVAM_VOICES = new Set([
    "aditya","ritu","ashutosh","priya","neha","rahul","pooja","rohan","simran",
    "kavya","amit","dev","ishita","shreya","ratan","varun","manan","sumit",
    "roopa","kabir","aayan","shubh","advait","anand","tanya","tarun","sunny",
    "mani","gokul","vijay","shruti","suhani","mohit","kavitha","rehan","soham",
    "rupali","niharika",
  ]);

  try {
    // ── Sarvam ────────────────────────────────────────────────────────────────
    if (provider === "sarvam") {
      const apiKey = env.SARVAM_API_KEY || process.env.SARVAM_API_KEY || "";
      if (!apiKey) return NextResponse.json({ error: "SARVAM_API_KEY not configured" }, { status: 400 });

      // Guard: fall back to 'ishita' if stored voice is stale/invalid
      const safeVoice = voice && VALID_SARVAM_VOICES.has(voice.toLowerCase()) ? voice.toLowerCase() : "ishita";
      if (safeVoice !== voice) {
        console.warn(`[voice-preview] Invalid Sarvam speaker '${voice}', using '${safeVoice}'`);
      }

      const res = await fetch("https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: {
          "API-Subscription-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: [sampleText],
          target_language_code: language || "en-IN",
          speaker: safeVoice,
          model: model || "bulbul:v3",
          // Note: pitch, loudness, pace are NOT supported by bulbul:v3
          enable_preprocessing: false,
        }),
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error("[voice-preview] Sarvam error:", err);
        return NextResponse.json({ error: `Sarvam TTS error ${res.status}: ${err}` }, { status: 502 });
      }

      const data = await res.json();
      const audioBase64: string = data.audios?.[0];
      if (!audioBase64) return NextResponse.json({ error: "No audio returned by Sarvam" }, { status: 502 });

      const audioBuffer = Buffer.from(audioBase64, "base64");
      return new NextResponse(audioBuffer, {
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // ── Deepgram ──────────────────────────────────────────────────────────────
    if (provider === "deepgram") {
      const apiKey = env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY || "";
      if (!apiKey) return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 400 });

      const voiceModel = voice || "aura-asteria-en";
      const res = await fetch(`https://api.deepgram.com/v1/speak?model=${voiceModel}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: sampleText }),
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Deepgram TTS error ${res.status}: ${err}` }, { status: 502 });
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      return new NextResponse(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600" },
      });
    }

    // ── Cartesia ──────────────────────────────────────────────────────────────
    if (provider === "cartesia") {
      const apiKey = env.CARTESIA_API_KEY || process.env.CARTESIA_API_KEY || "";
      if (!apiKey) return NextResponse.json({ error: "CARTESIA_API_KEY not configured" }, { status: 400 });

      const res = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Cartesia-Version": "2024-06-10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: sampleText,
          model_id: model || "sonic-2",
          voice: { mode: "id", id: voice },
          output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
          language: "en",
        }),
        signal: AbortSignal.timeout(12_000),
      });

      if (!res.ok) {
        const err = await res.text();
        return NextResponse.json({ error: `Cartesia TTS error ${res.status}: ${err}` }, { status: 502 });
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      return new NextResponse(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600" },
      });
    }

    // ── OpenAI ────────────────────────────────────────────────────────────────
    if (provider === "openai") {
      const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
      if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 400 });

      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "tts-1",
          input: sampleText,
          voice: voice || "alloy",
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return NextResponse.json({ error: `OpenAI TTS error ${res.status}` }, { status: 502 });
      }

      const audioBuffer = Buffer.from(await res.arrayBuffer());
      return new NextResponse(audioBuffer, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=3600" },
      });
    }

    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });

  } catch (e: any) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return NextResponse.json({ error: "TTS API timed out (>12s). Try again." }, { status: 504 });
    }
    console.error("[voice-preview] Unexpected error:", e);
    return NextResponse.json({ error: e.message || "Preview generation failed" }, { status: 500 });
  }
}
