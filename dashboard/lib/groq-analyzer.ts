import Groq from "groq-sdk";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

let _groq: Groq | null = null;

function getGroq(): Groq {
  if (!_groq) {
    _groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }
  return _groq;
}

export async function analyzeTranscript(transcript: string) {
  if (!transcript || transcript.trim().length < 20) return null;

  try {
    const chatCompletion = await getGroq().chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an AI call analyzer. Given a call transcript, extract the following as a strict JSON object:
{
  "sentiment": "Positive" | "Negative" | "Neutral",
  "short_summary": "A 1-2 sentence summary of the call",
  "lead_info": {
    "name": "Caller's Name if mentioned, or null",
    "city": "Caller's City if mentioned, or null",
    "intent": "What the caller wanted"
  }
}`
        },
        {
          role: "user",
          content: transcript
        }
      ],
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(chatCompletion.choices[0]?.message?.content || "{}");
    return result;
  } catch (err) {
    console.error("Groq Analysis Failed:", err);
    return null;
  }
}
