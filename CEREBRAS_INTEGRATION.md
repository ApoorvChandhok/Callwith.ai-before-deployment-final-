# Cerebras Integration — Change Log

**Date**: 2026-07-14  
**Purpose**: Add Cerebras as a free LLM provider alternative to Groq/Gemini

---

## Files Changed

### 1. `dashboard/lib/providers.ts`
**What**: Added Cerebras to the LLM provider catalog (FALLBACK_CATALOG)  
**Lines**: Added new `cerebras` entry in the `llm` section  
**Models added**:
- `gemma-4-31b` — Gemma 4 31B (Free, 128K context)
- `gpt-oss-120b` — GPT-OSS 120B (Free, 65K context)
- `llama-3.3-70b` — Llama 3.3 70B (Free, 128K context)
- `llama-3.1-8b` — Llama 3.1 8B (Free, Fast)

---

### 2. `agent_outbound.py`
**What**: Added Cerebras provider branch in `_build_llm()` function  
**Location**: After the `openrouter` block, before the `groq` block  
**Behavior**: 
- Reads `CEREBRAS_API_KEY` from environment
- Uses `ws_config.llm_model` or defaults to `gemma-4-31b`
- Routes to `https://api.cerebras.ai/v1` (OpenAI-compatible endpoint)
- Falls back to next provider if API key not set

---

### 3. `agent_inbound.py`
**What**: Added Cerebras provider branch in `_build_llm()` function  
**Location**: After the `openrouter` block, before the `groq` block  
**Behavior**: Same as outbound — reads `CEREBRAS_API_KEY`, routes to Cerebras API

---

### 4. `dashboard/app/(dashboard)/car-dealership/page.tsx`
**What**: Added Cerebras to LLM provider dropdown and model options  
**Changes**:
- Added `<option value="cerebras">Cerebras (Free Tier)</option>` to provider select
- Added `cerebras` entry to `LLM_OPTIONS` constant with 4 models

---

### 5. `dashboard/app/(dashboard)/real-estate/page.tsx`
**What**: Added Cerebras to LLM provider dropdown and model options  
**Changes**:
- Added `<option value="cerebras">Cerebras (Free Tier)</option>` to provider select
- Added Cerebras model options in the conditional render block (`llmProvider === "cerebras"`)

---

### 6. `.env.example`
**What**: Added Cerebras environment variable documentation  
**Added**:
```
# Cerebras (LLM — Free Tier, Fast Inference)
# Get your key from: https://cloud.cerebras.ai
CEREBRAS_API_KEY=your_cerebras_api_key
CEREBRAS_MODEL=gemma-4-31b
```

---

## How to Use

### Step 1: Get Cerebras API Key
1. Go to https://cloud.cerebras.ai
2. Sign up (free, no credit card)
3. Create an API key

### Step 2: Add to .env
```bash
CEREBRAS_API_KEY=your_key_here
CEREBRAS_MODEL=gemma-4-31b
```

### Step 3: Select in Dashboard
1. Go to Car Dealership or Real Estate page
2. In Step 3 (Campaign), select **Cerebras (Free Tier)** as LLM Provider
3. Pick a model (Gemma 4 31B recommended)
4. Run campaign

---

## Free Tier Limits

| Metric | Limit |
|--------|-------|
| RPM (Requests/Min) | 5 |
| TPM (Tokens/Min) | 30K |
| TPH (Tokens/Hour) | 1M |
| TPD (Tokens/Day) | 1M |

**Estimated calls per day**: ~200-300 short calls (2-3 min each)

---

## Rollback

To remove Cerebras:
1. Delete the Cerebras blocks from `agent_outbound.py` and `agent_inbound.py`
2. Remove Cerebras from `providers.ts`, `car-dealership/page.tsx`, `real-estate/page.tsx`
3. Remove `CEREBRAS_API_KEY` from `.env`

Or simply don't set `CEREBRAS_API_KEY` — the agents will automatically fall back to Groq/Gemini.
