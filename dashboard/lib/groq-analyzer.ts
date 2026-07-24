import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable");
    }
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

const SYSTEM_PROMPT = `You are an expert AI call center analyst. Analyze the following call transcript and extract a strict JSON object.

## Sentiment Rules (IMPORTANT — be generous with Positive):
- **Positive**: The caller shows ANY buying intent, interest, enthusiasm, asks about pricing/features/availability, schedules a visit, provides their contact info willingly, agrees to follow-up, expresses need for the product/service, or has a generally cooperative tone. A person inquiring about buying a car, asking about test drives, discussing budget, or showing interest = Positive.
- **Negative**: The caller is angry, frustrated, hostile, explicitly refuses, hangs up aggressively, complains, or expresses strong dissatisfaction.
- **Neutral**: Only if the call is purely informational with zero intent signals — e.g., a wrong number, purely factual question with no interest shown.

When in doubt, lean toward Positive — a caller who engages in conversation and shows any interest is Positive, not Neutral.

## Summary Rules:
- Write 1-2 concise sentences about what the call was about and its outcome.
- Mention the product/service discussed and any next steps.

## Lead Info Rules:
- Extract the caller's name if mentioned anywhere in the conversation.
- Extract the caller's city/location if mentioned.
- Describe the caller's intent specifically: what product/service they wanted, what action they wanted to take (buy, schedule, inquire, etc.)

Return ONLY a strict JSON object with this exact structure:
{
  "sentiment": "Positive" | "Negative" | "Neutral",
  "short_summary": "1-2 sentence summary",
  "lead_info": {
    "name": "string or null",
    "city": "string or null",
    "intent": "specific description of what the caller wanted"
  }
}`;

export async function analyzeTranscript(transcript: string) {
  if (!transcript || transcript.trim().length < 20) return null;

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent(transcript);
    const response = result.response;
    const text = response.text();

    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    console.error("Gemini Analysis Failed:", err);
    return null;
  }
}
