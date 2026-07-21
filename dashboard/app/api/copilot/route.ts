import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

// Lazy-initialized Groq provider using the OpenAI SDK wrapper
let _groq: ReturnType<typeof createOpenAI> | null = null;

function getGroq() {
  if (!_groq) {
    _groq = createOpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY || "",
    });
  }
  return _groq;
}

const BASE_SYSTEM_PROMPT = `You are the CallWith.ai AI Assistant, a helpful and deeply technical copilot embedded inside the CallWith.ai Voice AI dashboard.
Your goal is to help users navigate the dashboard, explain complex settings, debug SIP/telephony errors, and build workflows.

The system you are helping them use is a dual-agent Voice AI platform:
- Backend: Python workers connecting to LiveKit Cloud. Uses Groq for LLM and Deepgram/Sarvam for STT/TTS.
- Frontend: This Next.js Dashboard which controls the agents dynamically via JSON.
- Telephony: Connects to SIP trunks (like Vobiz).

You must be concise, accurate, and format your responses clearly using Markdown.
If you suggest navigating somewhere, use markdown links. Example: [Go to Settings](/settings).
Available pages:
- /workflows : Workflow Builder
- /outbound : Outbound Dialer
- /inbound : Inbound Agent Config
- /integrations : API Keys and SIP Settings
- /logs : Call Logs
`;

export async function POST(req: Request) {
  try {
    const { messages, context } = await req.json();

    const dynamicContext = `
[SYSTEM NOTIFICATION - CURRENT USER CONTEXT]
The user is currently viewing the page: "${context?.pageName || "Dashboard"}".
Here is the relevant data for their current view:
${JSON.stringify(context?.metadata || {}, null, 2)}
Use this context to inform your answers if they ask questions about what they are currently looking at.
`;

    const result = streamText({
      model: getGroq()("llama-3.3-70b-versatile"),
      messages: [
        { role: "system", content: BASE_SYSTEM_PROMPT + "\n" + dynamicContext },
        ...messages,
      ],
    });

    // TODO: [REMOVE BEFORE GO-LIVE] Token usage tracking for dev/testing only
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = result.textStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
        // Append token usage — race with timeout so stream always closes
        try {
          const usage = await Promise.race([
            result.usage,
            new Promise<null>((res) => setTimeout(() => res(null), 3000)),
          ]);
          if (usage) {
            controller.enqueue(
              encoder.encode(`\n__TOKENS__${JSON.stringify(usage)}`)
            );
          }
        } catch (_) {}
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Copilot API Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
