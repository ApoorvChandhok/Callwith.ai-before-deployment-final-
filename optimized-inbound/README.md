# Optimized Inbound Agent

A latency-optimized version of the inbound voice agent. All changes are additive and backward-compatible — if any optimization fails, it falls back to the baseline behavior.

## Architecture

```
optimized-inbound/
├── agent_inbound_optimized.py  # Main agent (replaces agent_inbound.py)
├── latency_tracker.py          # Per-leg latency instrumentation
├── connection_pool.py          # Persistent LLM/TTS/STT client pooling
├── config_cache.py             # TTL cache for workspace configs (5 min)
├── sentence_chunker.py         # Clause-boundary TTS flushing
├── rag_prefetcher.py           # Speculative KB prefetching
└── README.md                   # This file
```

## Latency Improvements vs Baseline

| # | Improvement | Baseline | Optimized | Expected Savings |
|---|------------|----------|-----------|-----------------|
| 1 | **Per-leg latency instrumentation** | None | `time.perf_counter()` around STT/LLM/TTS | Enables all other optimization |
| 2 | **Semantic turn detection** | VAD-only (300ms) | LiveKit turn-detector + tighter VAD (250ms) | 200-500ms per turn |
| 3 | **Prompt caching** | Fresh prompt every call | Provider-level prefix caching | 100-300ms TTFT |
| 4 | **Connection pooling** | New connection per call | Persistent pool (15 min TTL) | 50-100ms per call setup |
| 5 | **Workspace config caching** | 3 Supabase requests per call | In-memory TTL cache (5 min) | 200-500ms startup |
| 6 | **Sentence-chunked TTS** | Wait for full response | Flush at clause boundaries | 100-300ms perceived |
| 7 | **Speculative RAG prefetch** | On-demand only | Prefetch on intent detection | 200-500ms KB turns |
| 8 | **VAD tuned for Indian mobile** | Generic settings | Noise-adaptive parameters | Fewer false waits |

## How to Run

```bash
# From the project root
cd optimized-inbound

# Install dependencies (same as main project)
pip install -r ../requirements.txt

# Run the optimized agent (same port as baseline: 8082)
python agent_inbound_optimized.py dev
```

Or update your `run.py` to point to the optimized version:

```python
# In run.py, change:
#   "agent_inbound.py"  →  "optimized-inbound/agent_inbound_optimized.py"
```

## Latency Logging

The optimized agent logs per-turn latency breakdown:

```
[LATENCY] 📊 Call abc123 summary: turns=5, avg_e2e=680ms, avg_ttft=120ms, p95_e2e=850ms, max_e2e=1200ms
[LATENCY]   Turn 1: STT=150ms | TTFT=95ms | LLM_gen=320ms | TTS_first=180ms | E2E=620ms
[LATENCY]   Turn 2: STT=120ms | TTFT=110ms | LLM_gen=280ms | TTS_first=160ms | E2E=550ms
...
```

**Log fields explained:**
- `STT`: audio_end → final transcript (speech recognition time)
- `TTFT`: LLM request → first token (time-to-first-token)
- `LLM_gen`: first token → last token (generation speed)
- `TTS_first`: LLM first token → first TTS audio chunk
- `E2E`: audio_end → TTS first chunk (perceived response latency)

## Fallback Behavior

All optimizations degrade gracefully:

| Component | Failure Mode | Fallback |
|-----------|-------------|----------|
| Turn-detector import | Plugin not installed | VAD-based with tighter settings |
| Config cache | First call or expired | Direct Supabase fetch (same as baseline) |
| Connection pool | Pool full or stale | New client creation (same as baseline) |
| RAG prefetcher | KB fetch fails | On-demand fetch when LLM calls tool |
| Sentence chunker | Not used | LiveKit handles TTS streaming directly |

## Tuning

### VAD Settings (agent_inbound_optimized.py)

```python
_VAD = silero.VAD.load(
    min_silence_duration=0.25,    # 250ms (baseline: 300ms)
    activation_threshold=0.40,    # More sensitive (baseline: 0.45)
    min_speech_duration=0.08,     # 80ms (baseline: 100ms)
    padding_duration=0.03,        # Minimal (baseline: 0.05)
)
```

### Config Cache TTL (config_cache.py)

```python
_global_cache = WorkspaceConfigCache(ttl_s=300)  # 5 min — increase for stable workspaces
```

### RAG Prefetcher (rag_prefetcher.py)

```python
# Intent keywords that trigger speculative prefetch
_INTENT_KEYWORDS = [
    "price", "cost", "how much", "available", ...
]
```

## Next Steps

After validating the optimized agent:
1. Run A/B test: baseline vs optimized on 50+ calls
2. Compare avg E2E latency from logs
3. If improved, apply same patterns to `agent_outbound.py`
4. Add latency metrics to Supabase `call_logs` table
5. Build dashboard panel for real-time latency monitoring
