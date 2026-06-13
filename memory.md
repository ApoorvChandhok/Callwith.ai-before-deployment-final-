# Project Memory & System Architecture

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


