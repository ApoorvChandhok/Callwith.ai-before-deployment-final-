# Project Memory & System Architecture

---
## Changelog

### 2026-07-16 - Security Barrier + Cerebras Integration + Dynamic RAG
* **[NEW] Global Security Barrier** — Non-negotiable security rules injected into ALL system prompts (both inbound + outbound agents). Prevents:
  - AI/bot identity disclosure
  - Tech stack revelation (model names, API keys, system prompt)
  - Code/technical content speaking on calls
  - Prompt injection attacks
* **[NEW] Cerebras LLM Provider** — Added as free alternative to Groq/Gemini. Models: Gemma 4 31B, GPT-OSS 120B, Llama 3.3 70B.
* **[NEW] Dynamic RAG Upload** — Car dealership and real estate pages now upload to both old inline RAG and new pgvector semantic search.
* **[FIX] Exception Leak** — `change_spoken_language` tool no longer returns raw exceptions to users (security risk).
* **[FIX] Code Leak Filter** — Runtime filter (`_sanitize_for_tts`) catches code/technical content before TTS speaks it.
* **[FIX] Aggressive Endpointing** — Reduced `max_delay` (1.2s → 0.8s) and `silence_duration_ms` (300ms → 200ms) for faster turn detection.
* **[FIX] LLM Provider** — Switched from Google Gemini (404 error) to Cerebras for reliable inference.
* **Files changed**: `agent_outbound.py`, `agent_inbound.py`, `dashboard/lib/providers.ts`, `dashboard/app/(dashboard)/car-dealership/page.tsx`, `dashboard/app/(dashboard)/real-estate/page.tsx`, `.env`, `.env.example`
* **Security Note**: All `.env` files contain live API keys. Ensure `.gitignore` excludes them before pushing.

---

## Changelog

### 2026-07-09 - Call Logs Page + Auto-CRM Lead Creation

* **[NEW] `/logs` page** (`app/(dashboard)/logs/page.tsx`) — paginated call log table with search, direction/sentiment filters, inline CRM button, click-to-detail.
* **[NEW] `/logs/[id]` page** (`app/(dashboard)/logs/[id]/page.tsx`) — single call detail: transcript chat bubbles, AI analysis, recording player, stats, Save to CRM button.
* **[NEW] `/api/leads/upsert-from-call`** — internal POST endpoint (no auth cookie needed, bypassed in middleware). Smart dedup: increments `call_count` + appends note for existing leads; creates new lead with correct `source` for new numbers.
* **[MODIFY] `analytics.py`** — fires CRM upsert to `DASHBOARD_URL/api/leads/upsert-from-call` after every call (non-fatal, try/except wrapped).
* **[MODIFY] `middleware.ts`** — added `api/leads/upsert-from-call` to bypass list.
* **Note:** Auto-CRM requires `business_id` resolvable via existing lead lookup by phone. First call from a new number will only create a CRM entry if `business_id` can be resolved; the CRM button on the dashboard UI always works because the user's session provides `business_id`.

### 2026-07-09 - OpenRouter Integration (Groq-pinned LLM)

* **New provider `openrouter`:** Added `openrouter` branch to `_build_llm()` in both `agent_outbound.py` and `agent_inbound.py`.
* **Endpoint:** `https://openrouter.ai/api/v1` using `openai.LLM` with `default_headers` to pin routing to Groq (`X-OR-Provider-Order: groq`, `X-OR-Allow-Fallbacks: true`).
* **Model:** `meta-llama/llama-3.1-8b-instruct` (configurable via `OPENROUTER_MODEL` env var).
* **Fallback chain:** If Groq is unavailable, OpenRouter auto-routes to next fast provider. Last-resort agent fallback also uses OpenRouter before direct Groq.
* **Env vars added to `.env`:** `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `LLM_PROVIDER=openrouter`.
* **Direct Groq keys preserved** as backup — no removal of existing `GROQ_API_KEY`.

### 2026-07-03 - Fix loop_items iterating CSV rows

* **Root cause:** `ctx.$json` was rebuilt from merged `$nodes` outputs on every node visit in `workflow-executor.ts`. This overwrote `ctx.$json.item` that `loop_items` had just set, so expressions like `{{$json.item.phone}}` always resolved to `undefined` inside loop body nodes.
* **Fix 1 (restore item):** After rebuilding `ctx.$json`, re-inject the active loop item from `ctx.$loopState` so child nodes always see `$json.item` pointing to the current CSV row.
* **Fix 2 (operator precedence):** Fixed JS operator precedence bug in the string-based JSON array parse check.
* **Fix 3 (extra fallback):** Added `ctx.$json.rows` as additional fallback array source in the loop initializer.

### 2026-07-02 - BulkDialer 5 UX Enhancements

* **Greeting dynamic tags:** Initial Greeting field now supports `{{lead.X}}` placeholders with a live resolved preview (green text below the field).
* **Focus-aware tag insertion:** Clicking a Dynamic Entity chip inserts the tag into whichever field (greeting or prompt) was last focused. Chip label updates to show "insert into greeting ↑" vs "insert into prompt ↓".
* **Run Again:** After campaign completes, a green "Run Again" button re-dials the same lead list with the same config without full reset. "New Campaign" button still does full reset.
* **File remove buttons:** ✕ icon overlaid on the leads dropzone and RAG dropzone allows clearing the file to upload a different one.
* **File re-upload fix:** Added React `key` state to file inputs that increments on clear. This forces the DOM input to remount, solving the browser bug where selecting the exact same file after clearing wouldn't trigger `onChange`.
* **Offline draft persistence:** All form state (prompt, greeting, agentName, RAG content, lead rows, column mapping) is debounce-saved to `localStorage` key `bulkdialer_draft` every 800ms. Restored on page load. Shows "✓ Draft auto-saved" indicator.
* **Last-used voice/LLM memory:** `selectedProvider`, `selectedTtsProvider`, `selectedVoice`, `selectedLanguage` are persisted to `localStorage` key `bulkdialer_voice_prefs` on every change and restored instantly on mount (before API calls).
* **Inbound Greeting Fix:** Added missing `await` to `self.session.say()` inside `agent_inbound.py`'s `on_enter` method. This ensures the greeting actually plays and the conversational turn loop properly engages.
* **Outbound Greeting Fix:** Refactored outbound greeting to also fire from inside the `OutboundAssistant.on_enter()` lifecycle method. We pass an `asyncio.Event()` to sync the greeting so it waits until the SIP call actually connects, solving the "speech scheduling is paused" bug caused by firing `session.say()` out-of-band in the entrypoint.
* **Outbound Turn Detection Fix:** Changed `turn_detection="server_vad"` to `"vad"` and fixed endpointing timeouts to use seconds (`0.4`, `1.5`) instead of milliseconds (`400`, `1500`) which were causing the agent to wait 400 seconds before speaking.
* **Outbound Startup & Latency Fix:** Wrapped the SIP connection `wait()` inside `OutboundAssistant.on_enter()` in a background task so it doesn't block STT/VAD pipeline initialization while the phone rings. Also upgraded STT default to `nova-3` and removed hardcoded `base_url` to match inbound agent's low-latency config.
* **Outbound Transcript Logging:** Copied the `@session.on` transcript and state-change event handlers from the inbound agent to the outbound agent so that real-time transcription and agent states are logged to the console.
* **Dynamic Tags in Greeting:** Updated `BulkDialer.tsx` to apply `{{lead.X}}` substitutions to the `initialGreeting` string before sending it to the API, fixing the issue where dynamic names only worked in the system prompt.
* **Voice Provider UI Fix:** Added a `useEffect` to `BulkDialer.tsx` to force-reset `selectedVoice` to a valid option if the user swaps to a provider (like Sarvam) but `localStorage` held an invalid voice ID from a previous provider. This fixes the `Speaker 'anushka' is not compatible with model 'bulbul:v3'` crash.
* **Speech Speed UI:** Added a Speech Speed slider (0.5x to 2.0x) to the Bulk Dialer's Voice & Model settings. Sent via `ttsSpeed` metadata to the Python agents.
* **Inbound Gemini Crash Fix:** Modified `agent_inbound.py`'s `_build_llm` to bypass the unstable `google-genai` Python SDK plugin which was crashing with `no response generated, status_code=-1`. It now uses the hyper-stable OpenAI-compatible endpoint for Gemini (`generativelanguage.googleapis.com`), matching the exact setup used by the outbound agent.
* **Changed:** `dashboard/components/BulkDialer.tsx`, `dashboard/app/api/dispatch/route.ts`, `agent_outbound.py`, `agent_inbound.py`.

### 2026-07-02 - Dynamic Per-Call Agent Config (UI → Agent at Call Time)
* **Change:** Agent config (system prompt, LLM model, LLM temperature, initial greeting, fallback greeting) is now passed through dispatch metadata on every call — no more dependency on `data/agent_config.json` at call time.
* **Changed:** `dashboard/app/api/dispatch/route.ts` — accepts `systemPrompt`, `llmModel`, `llmTemperature`, `initialGreeting`, `fallbackGreeting` from request body and includes them in LiveKit room/job metadata.
* **Changed:** `agent_outbound.py` — after `load_workspace_config`, applies metadata overrides to `ws_config` fields (`system_prompt`, `llm_model`, `llm_temperature`, `initial_greeting`, `fallback_greeting`).
* **Changed:** `agent_inbound.py` — same metadata override pattern as outbound.
* **Changed:** `dashboard/components/BulkDialer.tsx` — passes `systemPrompt` (= resolved per-lead prompt), `llmModel`, `initialGreeting` to dispatch API on every campaign call.
* **Changed:** `dashboard/components/CallDispatcher.tsx` — passes `systemPrompt`, `llmModel`, `initialGreeting` to dispatch API on every single-dial call.
* **How it works:** UI sets config → clicks Dial/Start Campaign → dispatch API receives live values → metadata embedded in LiveKit room → Python agent reads metadata on job start → overrides ws_config → agent uses exact UI values. `data/agent_config.json` still saves for form persistence on page reload but is no longer the source of truth for live calls.

### 2026-07-02 - Fix 3 Outbound Bulk Dialer Errors
* **Bug:** `data/agent_config.json` was empty (0 bytes) causing `json.load()` to throw `Expecting value: line 1 column 1 (char 0)` on every agent start. The static fallback path couldn't load any config, leaving `outbound_trunk_id = None`.
* **Fix:** Populated `data/agent_config.json` with valid default config for both `outbound` and `inbound` modes using `ishita` voice.
* **Bug:** Dashboard API route defaults in `dashboard/app/api/agent-config/route.ts` still had `tts_voice: "anushka"` for both modes. Sarvam dropped `anushka` from `bulbul:v3`, causing `ValueError` crash on every call session.
* **Fix:** Updated both inbound and outbound defaults from `"anushka"` → `"ishita"` in `route.ts`.
* **Root cause chain:** Empty JSON → no trunk ID loaded → `TwirpError: missing sip trunk id` on dial. Fixed by restoring the JSON file.

### 2026-07-02 - Drag & Drop CSV Uploader
New: Added `api/workflow/upload/route.ts` API endpoint to handle generic CSV file uploads for workflows. 
New: Upgraded the `read_csv_leads` node configuration UI with a Drag & Drop zone allowing users to upload a CSV directly instead of manually typing file paths. Uploaded files are automatically saved with a timestamp prefix to `data/workflow_uploads`.
### 2026-07-02 - Workflow Loops & Leads Integration
New: `read_csv_leads` action node to easily load `data/leads.csv` directly into workflows without needing external API calls.
Changed: `loop_items` node now behaves like n8n — it features distinct `loop` (purple) and `done` (gray) output ports visually on the canvas.
Changed: `workflow-executor.ts` now supports true graph cycles by replacing the strict `visited` Set with a node visit counter map (preventing infinite loops by limiting max visits per node). `loop_items` automatically manages loop state and array iteration over the `loop` port.

### 2026-07-02 - Phase 2: Workflow Execution Engine
New: dashboard/lib/workflow-executor.ts — BFS node graph executor, all action handlers (Gmail, outbound call, HTTP, lead CRUD, tags, notes, notifications, WhatsApp), wait_delay file queue, run log writer (data/workflow_runs.json).
New: dashboard/lib/workflow-trigger-engine.ts — matches incoming events to active workflows, fires scheduled cron workflows.
New: /api/workflow/trigger (POST+GET), /api/workflow/runs (GET), /api/workflow/cron (GET) API routes.
Changed: analytics.py — after every call, fires call_completed event to /api/workflow/trigger (non-fatal, won't break calls if dashboard is down).
New: dashboard/components/workflows/WorkflowRunLog.tsx — run history panel with expandable step details, timing, output data, live polling every 5s.
Changed: workflows/page.tsx — added Run History panel, cron polling via setInterval, manual Run Now support.
Changed: WorkflowList.tsx — added History and Run Now buttons to each workflow card.
Integration: The full event flow is: call ends → analytics.py → POST /api/workflow/trigger → trigger engine finds matching workflows → executor walks node graph → writes to data/workflow_runs.json → Run Log UI polls and shows live results.

### 2026-07-02 - Outbound Dialer Restructure + Campaign Templates
Changed: AgentConfigForm.tsx — hides Agent Identity / System Prompt / Knowledge Base sections when mode=outbound (outbound uses per-call prompts, not global config). Added blue info banner.
Changed: CallDispatcher.tsx (Single Dispatch) — fully rewrote to include Agent Persona (system prompt, name, greeting), Knowledge Base (RAG upload), and Additional Call Context sections. Custom system prompt fully overrides base config via overrideSystemPrompt flag.
Changed: BulkDialer.tsx — added agentName + greeting fields to Step 3; added Campaign Templates panel (save/load/delete configs by name). Template picker at top of form.
Changed: agent_outbound.py — is_campaign_call now also triggers on override_system_prompt flag from Single Dispatch.
New: /api/campaign/templates/route.ts — GET/POST/DELETE routes for campaign template CRUD.
New: supabase/migrations/20260702_create_campaign_templates.sql — campaign_templates table (requires manual run in Supabase SQL editor).
Note: BulkDialer dispatch still sends agentName and greeting in leadData; backend uses them via user_prompt. Further backend integration for greeting field TBD.

### 2026-07-01 - Phase 1: Enhanced BulkDialer Campaign System
Changed: BulkDialer.tsx (rebuilt), dispatch/route.ts (lead fields), analytics.py (campaign tracking), agent_outbound.py (RAG injection), .env (DASHBOARD_URL)
New: campaign/upload-rag, campaign/results, campaign/download API routes
New packages: xlsx, pdf-parse, mammoth
Next: Phase 2 - Workflow Execution Engine

---


## 🏗️ Core Architecture & System Flow

### System Design
**Dual-Agent Microservice + Next.js Dashboard** — The system consists of two independent Python voice agents (inbound & outbound) that communicate via LiveKit's real-time infrastructure, orchestrated by a Next.js 16 dashboard. Configuration is bridged through a shared JSON file (`data/agent_config.json`).

### Tech Stack
| Layer | Technology |
|-------|-----------|
| **Voice Agents** | Python 3.x, LiveKit Agents SDK (≥0.8.0), LiveKit API (≥0.6.0) |
| **STT (Speech-to-Text)** | Deepgram Nova-2 |
| **TTS (Text-to-Speech)** | Sarvam AI (Bulbul v2 — Indian voices), Cartesia (Sonic-2), Deepgram Aura, OpenAI TTS-1 |
| **LLM** | Groq (Llama 3.3 70B Versatile) via OpenAI-compatible API |
| **VAD (Voice Activity Detection)** | Silero VAD (pre-loaded at startup) |
| **Telephony / SIP** | Vobiz SIP Trunking (outbound + inbound) |
| **Dashboard** | Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion |
| **UI Components** | React Aria, Lucide Icons, Recharts, react-globe.gl |
| **AI Copilot** | Groq SDK + Vercel AI SDK (in-dashboard chat) |
| **Auth** | Google OAuth (Gmail integration for contacts) |
| **Data Storage** | JSON files (`data/agent_config.json`, `data/call_logs.json`, `data/workflows.json`), CSV (`data/leads.csv`) |
| **Noise Cancellation** | LiveKit BVC Telephony plugin |

### Data Flow
```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SYSTEM DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Dashboard (Next.js)                                                    │
│    ├─ User configures agent → POST /api/agent-config                   │
│    │   └─ Writes to data/agent_config.json                             │
│    ├─ User initiates call → POST /api/dispatch                         │
│    │   └─ LiveKit API → creates room + dispatches agent                │
│    ├─ User views logs → GET /api/leads, /api/recordings                │
│    │   └─ Reads from data/call_logs.json, data/leads.csv               │
│    └─ Copilot chat → POST /api/copilot                                 │
│        └─ Groq LLM for in-app AI assistant                             │
│                                                                         │
│  Python Voice Agents                                                    │
│    ├─ On each call: reload data/agent_config.json                      │
│    ├─ LiveKit room ←→ SIP trunk (Vobiz) ←→ PSTN phone                │
│    ├─ STT (Deepgram) → LLM (Groq) → TTS (Sarvam/Cartesia)           │
│    └─ On disconnect: analytics.py → data/call_logs.json + leads.csv   │
│                                                                         │
│  Config Bridge                                                          │
│    data/agent_config.json is the shared state between                   │
│    dashboard (writes) and Python agents (reads on each call)           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Modules

| File / Directory | Description |
|-----------------|-------------|
| `run.py` | Entry point — spawns both `agent_outbound.py` and `agent_inbound.py` as subprocesses with auto-restart |
| `agent_outbound.py` | Outbound voice agent (Priya @ Spinny) — dials out via SIP, handles sales conversations |
| `agent_inbound.py` | Inbound voice agent (Doctor's Receptionist) — answers calls, captures leads, qualifies intent |
| `config_outbound.py` | Outbound agent configuration — system prompt, TTS/STT/LLM settings, loads dashboard overrides |
| `config_inbound.py` | Inbound agent configuration — same pattern as outbound, different persona |
| `analytics.py` | Post-call analytics — saves leads to CSV, analyzes transcripts via Groq, writes to `call_logs.json` |
| `sync_configs.py` | Syncs configuration between dashboard and agent config files |
| `dashboard/` | Next.js 16 dashboard with Sidebar, CRM, Dialer, Workflow Builder, Wallet, and AI Copilot |
| `dashboard/app/api/` | API routes: agent-config, auth, copilot, dispatch, generate-workflow, leads, queue, recordings, send-email |
| `dashboard/components/` | React components: Sidebar, LeadsCRM, AgentConfigForm, BulkDialer, CallDispatcher, WalletDashboard, etc. |
| `dashboard/lib/` | Server utilities: actions.ts, workflow engine, expression engine, Groq analyzer |
| `data/` | Runtime data store — agent_config.json, call_logs.json, leads.csv, workflows.json |
| `logs/` | Runtime log files — timestamped backend/frontend logs with auto-generated error summaries |
| `tester_agent.py` | Self-testing agent — verifies backend imports, env vars, frontend build, and scans logs for errors |
| `log_runner.py` | Log-capturing wrapper — runs backend/frontend with full stdout/stderr logging and summary generation |

---

## 🔧 Environment Configuration

| File | Scope | Contains |
|------|-------|----------|
| `.env` (root) | **Backend Python only** | LiveKit, Deepgram, Groq, Sarvam, Vobiz/SIP credentials |
# Project Memory & System Architecture

---
## Changelog

### 2026-07-01 - Phase 1: Enhanced BulkDialer Campaign System
Changed: BulkDialer.tsx (rebuilt), dispatch/route.ts (lead fields), analytics.py (campaign tracking), agent_outbound.py (RAG injection), .env (DASHBOARD_URL)
New: campaign/upload-rag, campaign/results, campaign/download API routes
New packages: xlsx, pdf-parse, mammoth
Next: Phase 2 - Workflow Execution Engine

---


## 🏗️ Core Architecture & System Flow

### System Design
**Dual-Agent Microservice + Next.js Dashboard** — The system consists of two independent Python voice agents (inbound & outbound) that communicate via LiveKit's real-time infrastructure, orchestrated by a Next.js 16 dashboard. Configuration is bridged through a shared JSON file (`data/agent_config.json`).

### Tech Stack
| Layer | Technology |
|-------|-----------|
| **Voice Agents** | Python 3.x, LiveKit Agents SDK (≥0.8.0), LiveKit API (≥0.6.0) |
| **STT (Speech-to-Text)** | Deepgram Nova-2 |
| **TTS (Text-to-Speech)** | Sarvam AI (Bulbul v2 — Indian voices), Cartesia (Sonic-2), Deepgram Aura, OpenAI TTS-1 |
| **LLM** | Groq (Llama 3.3 70B Versatile) via OpenAI-compatible API |
| **VAD (Voice Activity Detection)** | Silero VAD (pre-loaded at startup) |
| **Telephony / SIP** | Vobiz SIP Trunking (outbound + inbound) |
| **Dashboard** | Next.js 16, React 19, TypeScript, TailwindCSS 4, Framer Motion |
| **UI Components** | React Aria, Lucide Icons, Recharts, react-globe.gl |
| **AI Copilot** | Groq SDK + Vercel AI SDK (in-dashboard chat) |
| **Auth** | Google OAuth (Gmail integration for contacts) |
| **Data Storage** | JSON files (`data/agent_config.json`, `data/call_logs.json`, `data/workflows.json`), CSV (`data/leads.csv`) |
| **Noise Cancellation** | LiveKit BVC Telephony plugin |

### Data Flow
```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SYSTEM DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Dashboard (Next.js)                                                    │
│    ├─ User configures agent → POST /api/agent-config                   │
│    │   └─ Writes to data/agent_config.json                             │
│    ├─ User initiates call → POST /api/dispatch                         │
│    │   └─ LiveKit API → creates room + dispatches agent                │
│    ├─ User views logs → GET /api/leads, /api/recordings                │
│    │   └─ Reads from data/call_logs.json, data/leads.csv               │
│    └─ Copilot chat → POST /api/copilot                                 │
│        └─ Groq LLM for in-app AI assistant                             │
│                                                                         │
│  Python Voice Agents                                                    │
│    ├─ On each call: reload data/agent_config.json                      │
│    ├─ LiveKit room ←→ SIP trunk (Vobiz) ←→ PSTN phone                │
│    ├─ STT (Deepgram) → LLM (Groq) → TTS (Sarvam/Cartesia)           │
│    └─ On disconnect: analytics.py → data/call_logs.json + leads.csv   │
│                                                                         │
│  Config Bridge                                                          │
│    data/agent_config.json is the shared state between                   │
│    dashboard (writes) and Python agents (reads on each call)           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Modules

| File / Directory | Description |
|-----------------|-------------|
| `run.py` | Entry point — spawns both `agent_outbound.py` and `agent_inbound.py` as subprocesses with auto-restart |
| `agent_outbound.py` | Outbound voice agent (Priya @ Spinny) — dials out via SIP, handles sales conversations |
| `agent_inbound.py` | Inbound voice agent (Doctor's Receptionist) — answers calls, captures leads, qualifies intent |
| `config_outbound.py` | Outbound agent configuration — system prompt, TTS/STT/LLM settings, loads dashboard overrides |
| `config_inbound.py` | Inbound agent configuration — same pattern as outbound, different persona |
| `analytics.py` | Post-call analytics — saves leads to CSV, analyzes transcripts via Groq, writes to `call_logs.json` |
| `sync_configs.py` | Syncs configuration between dashboard and agent config files |
| `dashboard/` | Next.js 16 dashboard with Sidebar, CRM, Dialer, Workflow Builder, Wallet, and AI Copilot |
| `dashboard/app/api/` | API routes: agent-config, auth, copilot, dispatch, generate-workflow, leads, queue, recordings, send-email |
| `dashboard/components/` | React components: Sidebar, LeadsCRM, AgentConfigForm, BulkDialer, CallDispatcher, WalletDashboard, etc. |
| `dashboard/lib/` | Server utilities: actions.ts, workflow engine, expression engine, Groq analyzer |
| `data/` | Runtime data store — agent_config.json, call_logs.json, leads.csv, workflows.json |
| `logs/` | Runtime log files — timestamped backend/frontend logs with auto-generated error summaries |
| `tester_agent.py` | Self-testing agent — verifies backend imports, env vars, frontend build, and scans logs for errors |
| `log_runner.py` | Log-capturing wrapper — runs backend/frontend with full stdout/stderr logging and summary generation |

---

## 🔧 Environment Configuration

| File | Scope | Contains |
|------|-------|----------|
| `.env` (root) | **Backend Python only** | LiveKit, Deepgram, Groq, Sarvam, Vobiz/SIP credentials |
| `dashboard/.env.local` | **Frontend Next.js only** | NEXT_PUBLIC_* vars, LiveKit (for API routes), Groq (for copilot), Google OAuth |

> **Rule:** Never put `NEXT_PUBLIC_*` vars in root `.env`. Never put Vobiz/SIP credentials in `dashboard/.env.local`.

---

## 🪵 Immutable Change Log

### [2026-07-01] - Fix CRM Lead Loading and Enhance Call Analytics
* **Context:** CRM Leads page was failing to load for users without a business ID, and user info was not being extracted into call logs.
* **Scope:**
  - `dashboard/lib/supabase/leads-actions.ts` [MODIFIED] — Updated `getEffectiveBusinessId` to handle missing auth/profiles gracefully instead of throwing errors. Added safety checks across all CRUD actions.
  - `analytics.py` [MODIFIED] — Updated the Groq analysis prompt to extract structured `user_info` (name, phone, purpose, appointment details) and included this object in the saved call log entries.
* **Impact:** Fixed the UI crash preventing leads from appearing. Call logs now capture structured user information for potential downstream workflow integrations.
* **Verification:** Code review to ensure null returns are handled safely without crashing.

### [2026-06-30] - Implement Scenario 1 Dental Center with Google Calendar Booking
* **Context:** User requested implementing Scenario 1 (Shri Krishna Dental Clinic, Delhi) into the live inbound agent config with real-time Google Calendar appointment booking and a 100% extensible tool gateway architecture.
* **Scope:**
  - `data/agent_config.json` [MODIFIED] — Replaced inbound config with full Scenario 1 dental center agent. Includes enterprise Hinglish system prompt with 4-state conversation machine, embedded RAG knowledge base (25 treatments/pricing, 3 doctor profiles, clinic hours, insurance, payments), and `query_workspace_integration` custom function registration.
  - `agent_inbound.py` [MODIFIED] — Added generic `query_workspace_integration` Python tool that makes an internal HTTP POST to the Next.js tool gateway at `TOOL_GATEWAY_URL`. Single tool handles all real-time integrations — adding new actions requires zero Python changes. Includes 6s timeout with graceful fallback strings so call never crashes.
  - `dashboard/app/api/tools/execute/route.ts` [NEW] — Extensible Next.js tool gateway. Switch-case handlers for `book_appointment` (Google Calendar event creation with IST timezone, Hinglish/English time parsing, clinic hours enforcement, reminders) and `check_availability` (Google freeBusy API). Reads OAuth tokens from Supabase, auto-refreshes expired tokens. Always returns 200 with a speakable string — never crashes the agent.
  - `dashboard/app/api/auth/google/callback/route.ts` [NEW] — Unified Google OAuth callback. Handles token exchange, fetches user profile, upserts tokens to Supabase `integrations` table (server-side accessible to the tool gateway), and redirects with display data for the UI.
  - `dashboard/app/api/auth/gmail/start/route.ts` [MODIFIED] — Added `calendar.events` scope to the OAuth request. Now redirects to `/api/auth/google/callback` (unified). Accepts `workspace_id` query param via `state` for multi-tenant token storage.
  - `dashboard/app/(dashboard)/integrations/page.tsx` [MODIFIED] — Added Google Calendar integration card with CalendarDays icon, "Connect Google Calendar" button. Handles `gcal_success` URL param. Updated Gmail/Calendar card display to show connected account profile. Combined success toast for both Gmail and Calendar connect events.
  - `supabase/migrations/20260630_create_integrations_table.sql` [NEW] — SQL migration to create the `integrations` table with UNIQUE(workspace_id, service), RLS enabled, updated_at trigger, and lookup indexes.
  - `.env` [MODIFIED] — Added `TOOL_GATEWAY_URL=http://localhost:3000/api/tools/execute` for easy production override.
* **Impact:** Inbound agent now acts as a full-featured Delhi dental clinic receptionist (Aayushi). Can book Google Calendar appointments in real-time during calls, speak confirmation in Hinglish, and gracefully degrade if Calendar is not connected. Adding any future live integration (WhatsApp, patient DB, insurance check) requires only adding a handler in the Next.js gateway switch — zero Python restarts.
* **One-time Setup Required:** Run `supabase/migrations/20260630_create_integrations_table.sql` in Supabase dashboard. Add `http://localhost:3000/api/auth/google/callback` to Google Cloud Console Authorized Redirect URIs.

### [2026-06-30] - Create Pitch Deck, SaaS Deep-Dive, & Demo Scenario Blueprints

* **Context:** User requested a pitch deck outline, feature list, detailed explanation of how the SaaS voice calling platform works under the hood, 3 demo scenarios, enterprise-grade prompts/RAG files, a Google Calendar integration guide, and extensibility options using the Visual Workflow Builder.
* **Scope:**
  - `pitch_deck_guidelines.md` [NEW] — Structured pitch deck framework detailing cover, problem, solution, product walkthrough, latency breakthrough, multi-tenancy, GTM, pricing, and competitive matrix.
  - `saas_application_deepdive.md` [NEW] — In-depth architectural breakdown detailing dual-agent Python microservices, Next.js page modules, Supabase RLS security, LiveKit SIP integrations, low-latency audio pipelines, and dynamic configuration workflows.
  - `demo_scenarios.md` [NEW] — 3 production-ready demo blueprints (Inbound Dental Receptionist, Outbound Used Car Sales, Delhi Delivery Support) showcasing RAG document injection, SIP call transfer tools, Hinglish code-mixing, and automatic sentiment-based handoffs.
  - `scenario_1_deep_prompt.md` [NEW] — Enterprise-grade system prompt for the inbound dental receptionist with structured state tracking, safety barriers, and failsafes.
  - `scenario_1_rag_knowledge.md` [NEW] — Detailed operations, pricing, and guidelines knowledge base for the RAG engine.
  - `scenario_2_deep_prompt.md` [NEW] — Enterprise-grade outbound sales prompt with negotiation deflection, state tracking, and call transfer safeguards.
  - `scenario_2_rag_knowledge.md` [NEW] — Complete specifications, warranties, EMI loan sheets, and showroom logistics knowledge base for the Maruti Swift VXI sales engine.
  - `google_calendar_integration_guide.md` [NEW] — Deep technical guide outlining direct Python agent tool integration and Next.js workflow engine webhooks with OAuth tokens.
  - `google_calendar_recommended_approach.md` [NEW] — Architecture analysis recommending a Next.js proxy route for Python agent tool execution.
  - `workflow_engine_orchestration.md` [NEW] — Architectural blueprint on leveraging the dashboard's visual workflow builder to dynamically execute post-call workflows (such as creating Word files and sending emails).
  - `realtime_tool_extensibility.md` [NEW] — Architectural blueprint outlining how to hook the visual workflow engine as a middleware gateway to resolve custom tool calls dynamically during active calls.
* **Impact:** Provides investors, clients, and developers with professional blueprints of the system's architecture, commercial strategy, and operational scripts.

### [2026-06-29] - Fix Next.js Supabase Environment Variable Isolation
* **Context:** The Next.js dashboard failed to start due to missing Supabase credentials (URL/Key) because they were placed in the root `.env` file instead of the isolated `dashboard/.env.local` file.
* **Scope:**
  - `dashboard/.env.local` [NEW] — Created frontend-specific environment file containing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and other Next.js-relevant credentials.
  - `.env` (root) — Cleaned up by removing the Next.js frontend environment variables section.
* **Impact:** Fixed the Supabase client initialization crash in Next.js middleware, allowing `npm run dev` to start successfully.

### [2026-06-28] - Pipeline & Network Latency Optimizations
* **Context:** Voice agent had perceptible latency in the pipeline (User → Vobiz → LiveKit → Deepgram → Gemini → Sarvam → User). Batch-style processing, long silence thresholds, verbose LLM outputs, and an older STT model all contributed to sluggish response times.
* **Scope:**
  - `agent_outbound.py` + `agent_inbound.py` — **STT Model Upgrade:** Auto-upgrade from Deepgram `nova-2` → `nova-3` (faster real-time streaming WebSocket transcription). **Turn Handling:** Added `TurnHandlingOptions` with `min_delay=400ms` endpointing (telephony sweet spot), `max_delay=1500ms` safety cap, and `adaptive` interruption mode that clears the TTS audio buffer immediately on user barge-in. **VAD Tuning:** Added `activation_threshold=0.3` to Silero VAD for more sensitive speech onset detection. **Sarvam TTS:** Changed hardcoded fallback from `bulbul:v1` → `bulbul:v3` for lower latency and better voice quality. **Prompt Engineering:** Injected mandatory telephony voice rules into both agent system prompts — forces 1-2 sentence brevity, natural conversational fillers ("Got it", "Sure"), TTS-safe number/date/currency spelling, and short-clause pacing.
  - `workspace_config_loader.py` — Updated default `stt_model` from `nova-2` → `nova-3` in both the `WorkspaceAgentConfig` dataclass defaults and the DB row unpacking fallbacks.
* **Impact:** Expected ~200-400ms reduction in end-to-end response latency. Agent now sounds more human (short, punchy replies with fillers) instead of essay-like. Interruption handling is instant — user can barge in mid-speech and the bot stops immediately. STT streaming is word-by-word, not batch.
* **Verification:** Code-level review of LiveKit SDK docs confirming `TurnHandlingOptions`, `endpointing`, and `interruption` parameter compatibility with `livekit-agents>=0.8.0`.

### [2026-06-20] - Multi-Tenant Vobiz Isolation & Credential Storage (Phase 6)
* **Context:** The system previously relied on global Vobiz SIP credentials loaded from environment variables, which prevented per-tenant SIP trunk provisioning required for a multi-tenant SaaS architecture.
* **Scope:**
  - `supabase/migrations/20260620000001_vobiz_credentials.sql` — Added `sip_domain`, `vobiz_username`, and `vobiz_password` columns to the `workspace_config` table.
  - `dashboard/components/super-admin/CreateWorkspaceModal.tsx` — Added a new "Telephony Config" step to collect Vobiz SIP credentials during workspace creation.
  - `dashboard/app/api/super-admin/workspaces/create/route.ts` — Updated the API route to parse credentials from the request body, use them for LiveKit outbound trunk provisioning, and store them in the database.
* **Impact:** Super admins can now provision isolated SIP trunks for each workspace using client-specific Vobiz credentials, enabling true multi-tenancy.
* **Verification:** Code was updated to pass credentials properly into `createSipOutboundTrunk` and store them in Supabase.

### [2026-06-20] - Fix SIP Provisioning & Super Admin Queries
* **Context:** Workspace creation was crashing due to outdated LiveKit SDK method signatures (v2.15.0) and missing role fields in the Supabase query.
* **Scope:**
  - `dashboard/app/api/super-admin/workspaces/create/route.ts` — Updated SIP provisioning arguments to match the new positional requirements, forced `SIP_TRANSPORT_AUTO`, and used `new RoomConfiguration()` for dispatch rules.
  - `dashboard/app/api/super-admin/workspaces/route.ts` — Added `role` to the Supabase select query to prevent TypeScript property access errors when mapping admin profiles.
* **Impact:** Super admins can now successfully create workspaces and auto-provision SIP trunks without server crashes or 500 errors.
* **Verification:** Tested API route execution manually, resolving previous provisioning crashes.

### [2026-06-18] - Workflow Canvas Infinite Panning Fix
* **Context:** Dragging nodes toward the left or top of the canvas triggered an invisible bounding box, causing nodes to snap back to 0 or -500. This restricted the user's ability to build complex, sprawling workflows.
* **Scope:**
  - `dashboard/components/workflows/WorkflowCanvas.tsx` — Removed `Math.max` constraints on node movement, allowing true infinite canvas freedom in all directions. Added `onDragEnter={(e) => e.preventDefault()}` to the canvas element to ensure reliable drop-target activation for nodes originating from the palette.
* **Impact:** Users can now drag nodes anywhere on the infinite canvas without encountering invisible walls. The drag-and-drop experience from the palette is more reliable.

### [2026-06-17] - Complete Next.js App Router Restructuring & Supabase Auth Implementation
* **Context:** The application needed a robust authentication system and secure routing to protect dashboard features while exposing public login paths. We also needed a scalable database solution (Supabase) to replace the local JSON/CSV file data structures.
* **Scope:**
  - **Routing Restructuring:** Moved all protected dashboard pages (`config/inbound`, `config/outbound`, `dialer`, `integrations`, `leads`, `logs`, `wallet`, `workflows`) inside a new `dashboard/app/(dashboard)/` route group.
  - **Authentication:** Created new `dashboard/app/auth/` and `dashboard/app/login/` routes for Supabase authentication. Added `dashboard/middleware.ts` to protect all `(dashboard)` routes and redirect unauthenticated users to `/login`.
  - **Database & Architecture:** Initialized Supabase schema with migrations (`supabase/`) and Role-Level Security (RLS) policies. Implemented server actions in `dashboard/lib/supabase/`.
  - **UI Integration:** Updated `Sidebar.tsx`, `TopHeader.tsx`, `LeadsCRM.tsx`, and `ProfileMenu.tsx` to integrate with the new Supabase Auth context and user profiles.
* **Impact:** The application now has a secure, production-ready authentication flow and database infrastructure. All dashboard routes are protected, and the groundwork is laid for multi-tenant, role-based access control.

### [2026-06-15] - Dashboard Animation and Layout Thrashing Optimizations
* **Context:** User requested optimizations to make all animations in the project feel smoother, faster, and lag-free without stuttering.
* **Scope:**
  - `dashboard/components/PageTransition.tsx` — Removed expensive CPU/GPU blur filters on page-load mount transitions. Replaced the spring transition with a snappier custom cubic-bezier (`easeOutExpo`) and added `will-change: transform, opacity` for hardware acceleration.
  - `dashboard/components/MouseEffect.tsx` — Refactored the interactive mouse spotlight glow to bypass React's state/re-render loop. Uses a DOM ref directly updated inside a `requestAnimationFrame` handler. Removed `window.getComputedStyle()` forced layout calculations and the unused `isHovering` state.
  - `dashboard/components/TiltCard.tsx` — Cached the bounding client rect on mouse entry (`onMouseEnter`) instead of recalculating `getBoundingClientRect()` on every `mousemove` tick, completely eliminating forced layout reflows during card interactions.
* **Impact:** Reduced dashboard paint overhead and eliminated layout thrashing, resulting in stable 60 FPS cursor interactions and instantaneous page transitions.

### [2026-06-14] - Automatic Call Handoff Feature
* **Context:** User requested the ability to setup "automatic call handoff" to automatically transfer calls to a human agent based on dynamic conditions without asking for permission.
* **Scope:**
  - `data/agent_config.json` — Added `automatic_handoff` and `handoff_conditions` fields to default schema.
  - `dashboard/app/api/agent-config/route.ts` — Exposed new config fields.
  - `dashboard/components/AgentConfigForm.tsx` — Added UI toggle and text area to configure the handoff conditions.
  - `config_inbound.py` / `config_outbound.py` — Parsed the new config variables into globals.
  - `agent_inbound.py` / `agent_outbound.py` — Modified the LLM instructions to explicitly prepend strict instructions for calling the transfer tools when the `AUTOMATIC_HANDOFF` rule evaluates as true.
* **Impact:** Agents can now automatically escalate calls to humans when frustrated users or unsupported requests are detected (or any condition provided by the user).

### [2026-06-14] - Voice Preview Button + Language Support Chips in Dashboard
* **Context:** User requested ability to audition each TTS voice before saving, and to see which languages a voice supports.
* **Scope:**
  - `dashboard/app/api/voice-preview/route.ts` [NEW] — GET endpoint that calls Sarvam/Deepgram/Cartesia/OpenAI TTS APIs with a short sample sentence and returns the audio bytes. Supports per-language sample texts (hi-IN, ta-IN, te-IN, kn-IN, ml-IN, mr-IN, gu-IN, bn-IN, pa-IN, en-IN, en-US). 12s timeout with proper error responses.
  - `dashboard/components/AgentConfigForm.tsx` — Voice column now has: (1) `▶ Preview` button that fetches live TTS audio and plays it in-browser, transitions to `⏹ Stop` while playing; (2) language chips row showing which languages the selected voice/provider supports, auto-computed per provider.
* **Impact:** Users can instantly hear any voice without making a call. Language chips show "Hindi, Tamil, Telugu, …" for Sarvam or "English (US)" for Deepgram etc.

### [2026-06-14] - Add Google Gemini LLM Support + Fix OpenAI Fallback Crash
* **Context:** Agent crashed with `OpenAIError: OPENAI_API_KEY not set` because `_build_llm()` blindly fell back to `openai.LLM()` when the provider wasn't "groq". User has Gemini key but no OpenAI key.
* **Scope:**
  - `agent_outbound.py` + `agent_inbound.py` — Rewrote `_build_llm()`: added Google/Gemini support via `livekit-plugins-google`, added guarded OpenAI path (only used if `OPENAI_API_KEY` is set), changed final fallback from bare `openai.LLM()` to safe Groq fallback. Added `try/except ImportError` for Google plugin to avoid hard failure.
  - `agent_inbound.py` — Also fixed `_build_tts()` stale Sarvam voice list (same fix as outbound).
  - `requirements.txt` — Added `livekit-plugins-google>=0.6.0`.
  - `.env` — Added `GEMINI_MODEL=gemini-2.0-flash`, reorganized Gemini section with comment.
* **Impact:** Agents no longer crash when OpenAI key is absent. Google Gemini is now a selectable LLM provider from the dashboard. Groq is always the safe last-resort fallback.

### [2026-06-14] - Fix Sarvam bulbul:v3 Incompatible Speaker Crash
* **Context:** Outbound agent crashed on every call with `ValueError: Speaker 'aravind' is not compatible with model 'bulbul:v3'`. Sarvam updated `bulbul:v3` to a new speaker list that dropped `anushka`, `aravind`, `amartya`, `dhruv`, `meera`, `pavithra`, `maitreyi`, `arvind`, `arjun`, `abhilash`.
* **Valid bulbul:v3 speakers:** shubh, ritu, rahul, pooja, simran, kavya, amit, ratan, rohan, dev, ishita, shreya, manan, sumit, priya, aditya, kabir, neha, varun, roopa, aayan, ashutosh, advait.
* **Scope:**
  - `config_outbound.py` — Updated `DEFAULT_TTS_VOICE` from `"aravind"` → `"rahul"`. Updated `fetch_sarvam_voices()` fallback list to only valid bulbul:v3 speakers.
  - `config_inbound.py` — Updated `DEFAULT_TTS_VOICE` from `"anushka"` → `"ishita"`.
  - `agent_outbound.py` — Replaced hardcoded old-voice list in `_build_tts()` with the full valid bulbul:v3 speaker set.
  - `dashboard/lib/providers.ts` — Replaced Sarvam FALLBACK_CATALOG voices with all 25 valid bulbul:v3 speakers.
  - `data/agent_config.json` — Patched saved dashboard config: outbound `aravind` → `rahul`, inbound `anushka` → `ishita`.
* **Impact:** Outbound and inbound agents will no longer crash on startup due to invalid speaker selection. Dashboard voice dropdowns now only show valid voices.

### [2026-06-14] - Fix React Duplicate Key Error in Select Component
* **Context:** Next.js console threw errors stating "Encountered two children with the same key, '2-finance'" (and '2-meeting') when rendering AgentConfigForm. This occurred because live provider API results returned duplicate entries in the model list.
* **Scope:**
  - Added value deduplication to the `Select` component in `dashboard/components/AgentConfigForm.tsx` to filter out duplicate option values before rendering.
* **Impact:** Resolved React rendering warnings/errors, ensuring dropdown selections remain clean and unique.

### [2026-06-13] - Fix Sarvam TTS Model Version Compatibility Crash
* **Context:** The outbound agent crashed during call setup when `aravind` was selected as the speaker because the root `.env` hardcoded `SARVAM_TTS_MODEL=bulbul:v2`, which is incompatible with `aravind`.
* **Scope:**
  - Updated the root `.env` file to set `SARVAM_TTS_MODEL=bulbul:v3`.
* **Impact:** Resolved speaker compatibility crashes for Sarvam TTS, allowing calls to go through using the selected voice.

### [2026-06-13] - Fix Outbound Agent TTS Pre-Warming TypeError
* **Context:** The outbound voice agent crashed when starting a new session due to a `TypeError` in `asyncio.create_task` because `session.say(...)` returns a `SpeechHandle` (an awaitable) instead of a coroutine object.
* **Scope:**
  - Wrapped `session.say(" ", allow_interruptions=True)` in an helper `async def warm_up()` function inside `agent_outbound.py`.
* **Impact:** Fixed the outbound agent crash on start, enabling outbound calls to successfully connect and initiate speech.

### [2026-06-13] - Implement Dynamic Currency Conversion and Formatting Across Dashboard
* **Context:** Changing the currency settings (INR, USD, EUR, GBP) did not update the currency formatting/symbols in the overview cards and Wallet dashboard.
* **Scope:**
  - Added and exported a dynamic `CurrencySymbol` component from `dashboard/components/FormattedCurrency.tsx`.
  - Updated the "Total Spend" overview card in `dashboard/app/page.tsx` to render using the dynamic `FormattedCurrency` and `CurrencySymbol` components.
  - Refactored `dashboard/components/WalletDashboard.tsx` to pull the active currency and exchange rates from `useAppContext()`, dynamically converting all wallet balance, spending breakdowns, and recent transaction values.
* **Impact:** The selected currency now correctly translates and formats all cost and balance values dynamically across the entire project.

### [2026-06-13] - Fix Frontend dev Server Loop & Enable Log Runner Capturing
* **Context:** Running `npm run dev` in dashboard failed to start the local host server and instead exited immediately. The user wanted both the log runner to capture logs and the server to run.
* **Scope:**
  - Re-routed `dashboard/package.json`'s `"dev"` script back to `"python ../log_runner.py frontend"`.
  - Modified `log_runner.py`'s frontend runner to call `["npx", "next", "dev"]` directly instead of recursively calling `["npm", "run", "dev"]`.
* **Impact:** `npm run dev` now runs via `log_runner.py` without recursion, launching Next.js on `http://localhost:3000` and successfully capturing all logs to the `logs/` directory.

### [2026-06-12] - Voice Calling Agent Conversational Experience & Latency Optimizations
* **Context:** Optimized inbound and outbound voice agents for lower latency, higher quality TTS, and dynamic multilingual capabilities.
* **Scope:**
  - Upgraded Sarvam TTS model to `"bulbul:v3"` in `config_inbound.py` and `config_outbound.py` for more natural speech.
  - Implemented dynamic STT language detection (`detect_language=True` when `STT_LANGUAGE = "auto"`) in `agent_inbound.py` and `agent_outbound.py`.
  - Added TTS pre-warming via silent pings (`session.say(" ")`) on session startup to eliminate WebSocket connection latency during first greetings.
  - Optimized dashboard config load times by checking file modification time (`mtime`) before reloading.
* **Impact:** Reduced initial greeting response latency and significantly improved agent conversational understanding and speech naturalness.
* **Verification:** Verified config structure loading and parameter defaults.

### [2026-06-12] - Automatic Logging, Summary Generation, and Log Cleanup
* **Context:** Automated backend/frontend logs capture, summary reports, and auto-cleanup for logs older than 1 month.
* **Scope:**
  - Configured `dashboard/package.json` to route dev servers through `log_runner.py`.
  - Re-architected `run.py` to act as a log wrapper for agents, auto-saving stdout/stderr to timestamped files with summaries on exit.
  - Added a monthly (30-day) log cleanup function to `log_runner.py` and `run.py`.
* **Impact:** Seamless background log generation with summary reports on manual runs, keeping the log directory clean.

### [2026-06-11] - Premium UI Standardization & Dashboard Overhaul
* **Context:** Overhauled the global design system to use a high-end "Premium Solid" aesthetic (clean typography, crisp borders, dark solid backgrounds) based on user design specs.
* **Scope:**
  - Upgraded global `glass-card` CSS classes in `dashboard/styles/globals.css` from blurry/transparent to premium solid (`#1A1A1A`) with border radius and subtle glowing borders.
  - Rebuilt Dashboard layout (`app/page.tsx`) to implement the premium typography and layout grid while restoring the original `getOverviewStats` data components.
  - Implemented responsive React AreaCharts (`CostGraph.tsx`) with stunning `linearGradient` fills instead of flat transparent colors.
  - Redesigned `Sidebar.tsx` and `TopHeader.tsx` to match the solid dark theme, adding Framer Motion sliding pill indicators.
  - Fixed Recharts `<Brush>` console errors (NaN `x`/`width`) on first render.
* **Impact:** Global design language unified across all pages (Dialer, Workflows, Leads). All functional AI components retained.

### [2026-06-11] - Project Infrastructure Upgrade
* **Context:** Added project documentation, env segregation, automated testing, and logging infrastructure to improve developer experience and debugging.
* **Scope:**
  - Created `memory.md` (this file) — project architecture documentation
  - Segregated `.env` (backend) and `dashboard/.env.local` (frontend) with `.env.example` templates
  - Created `tester_agent.py` — automated health checks for UI and backend
  - Created `log_runner.py` + `logs/` — timestamped log capture with error summaries
  - Updated `GEMINI.md` global rules to reference log summaries for error fixing
  - Updated `.gitignore` to exclude `logs/` directory
* **Impact:** No breaking changes. All existing functionality preserved. New tooling is additive.
* **Verification:** Manual testing of `tester_agent.py` and `log_runner.py` on both backend and frontend.

### [2026-06-13] - Fix Outbound SIP Trunk ID Mismatch
* **Context:** Outbound and inbound calls were failing with `TwirpError: object cannot be found`. Root cause was a stale `VOBIZ_SIP_TRUNK_ID` in `.env` pointing to a trunk that no longer exists in LiveKit.
* **Scope:**
  - Updated `VOBIZ_SIP_TRUNK_ID` in `.env` from `ST_FN8TAbxQaYnn` → `ST_GpnrjlpsVC2K` (matching the active LiveKit outbound trunk)
  - `INBOUND_TRUNK_ID=ST_6EDBHqmcr7rs` was already correct (matches LiveKit inbound trunk)
* **Root Cause:** The outbound SIP trunk had been recreated in LiveKit (new ID assigned) but the `.env` was never updated to reflect the new trunk ID.
* **Impact:** Outbound calls should now connect successfully. Requires backend agent restart to pick up the new env value.

### [2026-06-13] - Dynamic Provider Voices & Models (Zero Hardcoding)
* **Context:** All voice/model dropdowns in the UI were hardcoded. User wanted fully dynamic pulling from provider APIs.
* **Scope:**
  - NEW `dashboard/lib/providers.ts` — central TypeScript types, fallback catalog for all providers (Sarvam, OpenAI, Groq, Cartesia, Deepgram)
  - NEW `dashboard/app/api/providers/route.ts` — live API endpoint that fetches voices/models from each provider in parallel with 10-min in-memory caching. Falls back to static catalog on failure. Supports `DELETE` to bust cache.
  - UPDATED `dashboard/components/AgentConfigForm.tsx` — all TTS/STT/LLM selects now fetch from `/api/providers`. Green live-indicator dot when data is live. Refresh button to re-fetch. Provider switching auto-selects first valid voice/model.
  - UPDATED `dashboard/components/CallDispatcher.tsx` — same live catalog. Voice list dynamically updates when TTS provider changes.
  - UPDATED `config_outbound.py` — `fetch_sarvam_voices()`, `fetch_groq_models()`, `get_valid_sarvam_voice()`, `get_valid_groq_model()` helpers added. In-memory cached. Graceful fallback if API unreachable.
  - UPDATED `config_inbound.py` — imports helpers from `config_outbound` (single source of truth).
* **Impact:** No hardcoded voice/model lists anywhere. Live data from provider APIs at startup and on page load.

### [2026-06-14] - Interactive TTS Language Chips & Override Fix
* **Context:** The UI language chips were static, and when a user did initiate a call with a non-English language (like Hindi), the outbound agent ignored the language and spoke English, causing the terminal to crash due to a Unicode encoding issue when printing Hindi characters.
* **Scope:**
  - Upgraded language chips in `AgentConfigForm.tsx`, `CallDispatcher.tsx`, and `BulkDialer.tsx` to be fully interactive (clickable), reactive, and self-sorting based on the selected active language.
  - Fixed `/api/dispatch` to correctly pack `tts_provider` and `tts_language` into the LiveKit dispatch metadata.
  - Upgraded `agent_outbound.py`'s `_build_tts()` function to accept dynamic language overrides from the job metadata instead of falling back to default.
  - Modified `OutboundAssistant` (LLM Agent) to dynamically inject a critical system prompt forcing it to speak the specified target language instead of English.
  - Upgraded `run.py` to enforce `utf-8` on `sys.stdout` and `PYTHONIOENCODING` to prevent `UnicodeEncodeError: 'charmap' codec can't encode characters` crashes when the backend logs Hindi/non-English text.
* **Impact:** Users can seamlessly initiate outbound calls in any supported language with a single click, and the AI will reliably converse in that language without crashing the backend process.

### [2026-06-20] - Phase 1: Super Admin Multi-Tenant Layer (DB Schema)
* **Context:** Architecting a multi-tenant SaaS platform where a single shared backend serves multiple client workspaces with strict data isolation. Phase 1 establishes all database infrastructure required before any frontend or backend code is written.
* **Scope:**
  - NEW `supabase/migrations/20260620000000_super_admin_layer.sql` — Additive migration (safe on existing schema):
    - **`workspace_config`** table — stores per-workspace LiveKit trunk IDs (`livekit_trunk_id`, `inbound_trunk_id`, `dispatch_rule_id`), Vobiz DID number, and agent worker names. RLS: super_admin + service_role only (never exposed to clients).
    - **`workspace_billing_rates`** table — stores per-workspace markup rates (charged to client) and actual provider cost baselines (Deepgram STT: $0.0043/min, Sarvam TTS: $0.004/min, Groq LLM: $0.0000006/token, LiveKit: $0.001/min). Editable per-client by super_admin.
    - **`admin_audit_log`** table — immutable log of all super_admin platform actions (kill_room, create_workspace, delete_workspace, impersonate). Separate from business-scoped `audit_logs`.
    - **`businesses` table extended** — added `slug`, `logo_url`, `phone_number`, `is_active`, `rate_out_per_min`, `rate_in_per_min` columns.
    - **`call_logs` table extended** — added `duration_seconds`, `llm_tokens_used`, `room_name`, `cost_usd` columns needed for accurate billing computation.
    - **`weekly_workspace_spend` VIEW** — real-time billing view aggregating 7-day call costs per workspace using the actual billing formula.
    - **Helper functions** — `get_business_id_by_slug()`, `is_business_admin()`.
    - **Workspace 1 migration** — RapidX seeded as the first workspace (fixed UUID `11111111-0000-0000-0000-000000000001`) with existing SIP trunk IDs pre-populated.
    - **NULL-safety backfill** — any orphaned rows in leads/call_logs/workflows/agent_configs with NULL business_id are stamped with Workspace 1's UUID.
* **Impact:** Database layer is now fully multi-tenant. All new workspaces will get isolated rows scoped by `business_id`. RLS prevents any cross-workspace data leakage. Python agents will read `workspace_config` per call instead of local JSON files (Phase 5).

### [2026-06-20] - Phase 2: Super Admin Control Plane — Frontend + API
* **Context:** After Phase 1 DB schema was applied, the super-admin frontend control plane is now built. This gives super_admin users a dedicated, visually distinct portal to manage all client workspaces from a single interface.
* **Scope:**
  - **`dashboard/middleware.ts`** — Super-admin route guard: any request to `/super-admin/**` does a DB role lookup. Non-super_admin users are redirected to `/dashboard?unauthorized=1`.
  - **`dashboard/lib/types/super-admin.ts`** — TypeScript interfaces: `WorkspaceRow`, `WorkspaceConfig`, `BillingRates`.
  - **`dashboard/app/(super-admin)/layout.tsx`** — Isolated layout with a custom minimal dark top nav (no Sidebar/AppProvider dependency), "Control Plane" breadcrumb, and super_admin user pill.
  - **`dashboard/app/(super-admin)/super-admin/page.tsx`** — Main workspace listing page: 4 platform-wide stat cards, search/filter, full workspace table (status, trunk IDs, DID, 7-day spend bar + call breakdown), "New Workspace" button.
  - **`dashboard/app/api/super-admin/workspaces/route.ts`** — `GET` endpoint: joins `businesses`, `workspace_config`, `workspace_billing_rates`, and `weekly_workspace_spend` view to return aggregated workspace data.
  - **`dashboard/app/api/super-admin/workspaces/create/route.ts`** — `POST` endpoint: creates business record, billing rates, workspace_config placeholder, invited admin profile row, sends Supabase magic-link invite email, and writes an `admin_audit_log` entry. Non-fatal if invite fails.
  - **`dashboard/components/super-admin/CreateWorkspaceModal.tsx`** — 4-step wizard modal: (1) Workspace details + auto-slug derivation, (2) Admin account (magic link invite), (3) Animated provisioning log (sequential log lines), (4) Done screen. Calls `/api/super-admin/workspaces/create`.
  - **`dashboard/components/Sidebar.tsx`** — Added `ShieldCheck` icon + "Control Plane" nav section (violet-themed, separator divider) that only renders when `role === 'super_admin'`. Clicking navigates to `/super-admin`.
* **Impact:** Super admins can now create and inspect all client workspaces from a single portal. All routes are server-side role-gated. The portal is visually distinct from client dashboards and will be extended in subsequent phases (live room monitor, workspace detail/edit, billing drilldown).
* **Verification:** Manual — modal opens, wizard steps transition correctly, API route returns workspace rows from DB.

### [2026-06-20] - Phase 3: Super Admin Impersonation Flow
* **Context:** Super admins need to view the platform as a specific tenant to debug issues and support clients without requesting credentials.
* **Scope:**
  - **`leads-actions.ts`** — `getEffectiveBusinessId()` helper checks `active_workspace_id` cookie before defaulting to the authenticated user's `business_id`. Applied to all DB read/write actions.
  - **`(dashboard)/layout.tsx`** — Reads `active_workspace_id` cookie; injects `ImpersonationBanner` when active.
  - **`CreateWorkspaceModal.tsx`** — Fixed stale `apiError` across step navigation; safe JSON parsing prevents "Unexpected end of JSON input" on server crashes; error sends user back to Step 2 (not Step 1).
* **Impact:** Super admins can impersonate any workspace and all data is correctly scoped. Persistent banner prevents confusion.
* **Verification:** Manual — toggle impersonation, verify leads page scopes correctly.

### [2026-06-20] - Phase 4: LiveKit SIP Auto-Provisioning
* **Context:** Previously workspaces had no LiveKit SIP trunks after creation — calls required manual setup in the LiveKit dashboard. Phase 4 automates this in the create-workspace API.
* **Scope:**
  - **`/api/super-admin/workspaces/create/route.ts`** — Added `SipClient` (livekit-server-sdk) calls:
    1. `createSipOutboundTrunk()` — `{slug}-outbound`, wired to shared Vobiz domain/credentials + workspace DID.
    2. `createSipInboundTrunk()` — `{slug}-inbound`, accepts calls to the workspace DID.
    3. `createSipDispatchRule()` — routes inbound calls to `inbound-caller` agent with `workspace_id` in room metadata (needed for Phase 5 multi-tenancy).
    4. Trunk IDs saved to `workspace_config.livekit_trunk_id` and `inbound_trunk_id`.
  - Provisioning is **non-fatal**: if LiveKit call fails or no DID is provided, workspace is still created and `provision_warning` is returned.
  - **`CreateWorkspaceModal.tsx`** — Done step shows amber warning banner when `provision_warning` is set.
* **Impact:** Full workspace provisioning (DB + invite + SIP trunks) happens in one wizard flow (~3s). Workspaces created without a DID can have trunks added manually later.
* **Verification:** Manual — create workspace with DID, verify trunk IDs appear in `workspace_config` and LiveKit dashboard.

### [2026-06-20] - Phase 5: Python Agent Multi-Tenant Config Decoupling
* **Context:** The Python voice agents previously relied on local JSON files (`agent_config.json`) and specific `config_*.py` files to load parameters. In a multi-tenant cloud environment, this is unsustainable and insecure.
* **Scope:**
  - `workspace_config_loader.py` — Added a new Supabase REST client utility to fetch dynamic configuration per-workspace directly from the database without requiring heavy Supabase SDKs. Includes a fallback chain: DB -> legacy JSON -> hardcoded defaults.
  - `agent_inbound.py` / `agent_outbound.py` — Updated the agents to extract `workspace_id` from the LiveKit room metadata upon startup, and dynamically load persona instructions, STT/TTS settings, and API keys.
  - Removed `config_inbound.py`, `config_outbound.py`, and `sync_configs.py` — Technical debt removed as the agents now dynamically fetch configurations based on workspace context.
  - `tester_agent.py` — Removed old syntax-checking tests tied to the obsolete config files.
* **Impact:** The backend agents are now fully decoupled from local state for their configurations. They function as true multi-tenant microservices that adapt behavior based purely on the `workspace_id` passed via LiveKit metadata.
* **Verification:** Validated that agents successfully spin up, parse the config loader, and use database values.
