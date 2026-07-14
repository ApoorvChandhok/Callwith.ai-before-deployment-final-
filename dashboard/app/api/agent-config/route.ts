import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "..", "data", "agent_config.json");
const DATA_DIR = path.join(process.cwd(), "..", "data");

// Default configs mirroring the Python files
const DEFAULTS: Record<string, any> = {
  inbound: {
    agent_name: "Škoda Octavia Advisor",
    gender: "female",
    call_description: "Inbound call handler for Škoda Octavia sales inquiries. Collects leads and answers product questions.",
    system_prompt: "",
    initial_greeting: "A customer has just called in. Greet them warmly as a Škoda Octavia Advisor and immediately ask for their name to begin the conversation.",
    fallback_greeting: "Warmly greet the customer as a Škoda Octavia Sales Advisor and ask for their name.",
    stt_provider: "deepgram",
    stt_model: "nova-2",
    stt_language: "en",
    tts_provider: "sarvam",
    tts_voice: "ishita",
    tts_language: "en-IN",
    llm_provider: "groq",
    llm_model: "llama-3.3-70b-versatile",
    llm_temperature: 0.7,
    transfer_number: "",
    automatic_handoff: false,
    handoff_conditions: "",
    resources: [],
    custom_functions: [
      { name: "save_lead_info", description: "Save the caller's contact information (name, phone, city) after collection.", enabled: true },
      { name: "transfer_to_sales", description: "Transfer the caller to a live human sales representative.", enabled: true },
      { name: "book_appointment", description: "Book a Google Calendar appointment for the caller (date, time, treatment). Requires Google Calendar integration.", enabled: true },
      { name: "check_availability", description: "Check next available appointment slots on Google Calendar.", enabled: true }
    ]
  },
  outbound: {
    agent_name: "",
    gender: "female",
    call_description: "",
    system_prompt: "",
    initial_greeting: "",
    fallback_greeting: "",
    stt_provider: "deepgram",
    stt_model: "nova-2",
    stt_language: "en",
    tts_provider: "sarvam",
    tts_voice: "ishita",
    tts_language: "hi-IN",
    llm_provider: "groq",
    llm_model: "llama-3.3-70b-versatile",
    llm_temperature: 0.7,
    transfer_number: "",
    automatic_handoff: false,
    handoff_conditions: "",
    resources: [],
    custom_functions: [
      { name: "lookup_user", description: "Look up user details by phone number.", enabled: true },
      { name: "transfer_call", description: "Transfer the call to a human support agent or another number.", enabled: true }
    ]
  }
};

function loadSystemPromptFromPython(mode: string): string {
  try {
    const pyFile = path.join(process.cwd(), "..", `config_${mode}.py`);
    if (fs.existsSync(pyFile)) {
      const content = fs.readFileSync(pyFile, "utf-8");
      // Extract SYSTEM_PROMPT = """..."""
      const match = content.match(/SYSTEM_PROMPT\s*=\s*"""([\s\S]*?)"""/);
      if (match) return match[1].trim();
    }
  } catch (e) {
    console.error(`Failed to load Python ${mode} system prompt:`, e);
  }
  return "";
}

function readConfig(): Record<string, any> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to read agent config:", e);
  }
  return {};
}

function writeConfig(config: Record<string, any>) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (!mode || !["inbound", "outbound"].includes(mode)) {
    return NextResponse.json({ error: "mode must be 'inbound' or 'outbound'" }, { status: 400 });
  }

  const stored = readConfig();
  const defaults = { ...DEFAULTS[mode] };

  // Load system prompt from Python if not in JSON
  if (!stored[mode]?.system_prompt) {
    defaults.system_prompt = loadSystemPromptFromPython(mode);
  }

  const config = { ...defaults, ...stored[mode] };
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, config } = body;

    if (!mode || !["inbound", "outbound"].includes(mode)) {
      return NextResponse.json({ error: "mode must be 'inbound' or 'outbound'" }, { status: 400 });
    }

    if (!config) {
      return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    const stored = readConfig();
    stored[mode] = config;
    writeConfig(stored);

    // Sync Python code via the master sync script
    try {
      const { execSync } = require("child_process");
      execSync("python sync_configs.py", { cwd: path.join(process.cwd(), "..") });
      console.log(`[SYNC] Python config synced for ${mode}`);
    } catch (err) {
      console.error("Failed to sync Python file:", err);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
