"""
workspace_config_loader.py
──────────────────────────
Phase 5: Multi-tenancy config loader for the Python AI agents.

Replaces the static `data/agent_config.json` / `config_outbound.py` approach
with a live Supabase lookup keyed on `workspace_id` (= `business_id`).

Usage in agent entrypoint:
    from workspace_config_loader import load_workspace_config
    ws = await load_workspace_config(workspace_id, mode="outbound")
    # ws is a WorkspaceAgentConfig dataclass (never None — falls back to defaults)

The loader uses the Supabase REST API directly (no supabase-py dependency).
It requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
"""

import os
import json
import logging
import asyncio
from dataclasses import dataclass, field
from typing import Optional
import urllib.request
import urllib.error
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("workspace-config-loader")

# ---------------------------------------------------------------------------
# Dataclass — all fields an agent needs, with safe defaults
# ---------------------------------------------------------------------------

@dataclass
class WorkspaceAgentConfig:
    """Fully resolved agent config for one workspace + call direction."""

    # Identity
    workspace_id: Optional[str]        = None
    business_name: str                 = "Unknown Workspace"
    mode: str                          = "outbound"   # "inbound" | "outbound"

    # Agent persona
    system_prompt: str                 = ""
    initial_greeting: str              = ""
    fallback_greeting: str             = ""

    # STT
    stt_provider: str                  = "deepgram"
    stt_model: str                     = "nova-3"
    stt_language: str                  = "auto"

    # TTS
    tts_provider: str                  = "sarvam"
    tts_voice: str                     = "ishita"
    tts_language: str                  = "en-IN"

    # LLM
    llm_provider: str                  = "groq"
    llm_model: str                     = "llama-3.3-70b-versatile"
    llm_temperature: float             = 0.70

    # Telephony
    outbound_trunk_id: Optional[str]   = None   # workspace_config.livekit_trunk_id
    inbound_trunk_id: Optional[str]    = None   # workspace_config.inbound_trunk_id
    transfer_number: Optional[str]     = None
    sip_domain: Optional[str]          = None

    # Resources injected into system prompt
    resources: list                    = field(default_factory=list)

    # Pre-formatted workspace resources text (can be re-appended when system_prompt is overridden)
    workspace_resources_text: str      = ""

    # Dynamic RAG — whether the workspace has embedded knowledge base chunks
    has_dynamic_kb: bool               = False

    # Custom functions (transfer_call, etc.) with enabled/disabled state
    custom_functions: list             = field(default_factory=list)

    # Source flag for debugging
    source: str                        = "static_fallback"   # "database" | "static_fallback"

    def is_function_enabled(self, function_name: str) -> bool:
        """Check if a custom function is enabled. Defaults to True if not found."""
        for fn in self.custom_functions:
            if fn.get("name") == function_name:
                return fn.get("enabled", True)
        return True  # default: enabled if not configured


# ---------------------------------------------------------------------------
# Supabase REST helper (no SDK dependency)
# ---------------------------------------------------------------------------

def _supabase_get(path: str, params: dict = None) -> Optional[dict]:
    """
    Synchronous Supabase REST GET.
    Returns parsed JSON response body (list or dict) or None on error.
    Called from a thread-pool executor so it doesn't block the event loop.
    """
    url  = os.getenv("SUPABASE_URL", "").rstrip("/")
    key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not url or not key:
        logger.warning("[WorkspaceLoader] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — using static fallback")
        return None

    full_url = f"{url}/rest/v1/{path}"
    if params:
        query_string = "&".join(f"{k}={v}" for k, v in params.items())
        full_url = f"{full_url}?{query_string}"

    req = urllib.request.Request(
        full_url,
        headers={
            "apikey":        key,
            "Authorization": f"Bearer {key}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
            "Prefer":        "return=representation",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        logger.error(f"[WorkspaceLoader] HTTP {e.code} querying {full_url}: {e.read().decode()}")
    except Exception as e:
        logger.error(f"[WorkspaceLoader] Request failed for {full_url}: {e}")
    return None


def _supabase_rpc(function_name: str, params: dict) -> Optional[dict]:
    """
    Synchronous Supabase RPC call (POST to /rest/v1/rpc/<function_name>).
    Used to call security-definer Postgres functions that enforce RLS safely.
    Returns parsed JSON or None on error.
    """
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not url or not key:
        return None

    import urllib.parse
    body = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/{function_name}",
        data=body,
        method="POST",
        headers={
            "apikey":        key,
            "Authorization": f"Bearer {key}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            body_resp = resp.read().decode("utf-8")
            return json.loads(body_resp)
    except urllib.error.HTTPError as e:
        logger.error(f"[WorkspaceLoader] RPC {function_name} HTTP {e.code}: {e.read().decode()}")
    except Exception as e:
        logger.error(f"[WorkspaceLoader] RPC {function_name} failed: {e}")
    return None


def _build_resources_text(resources: list) -> str:
    """Build the formatted knowledge base text from a resources list.
    Returns a string ready to append to the system prompt, or empty string if no resources."""
    if not resources:
        return ""
    text = "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nADDITIONAL KNOWLEDGE BASE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    for res in resources:
        if res.get("type") == "url":
            text += f"\nReference URL — {res.get('name', '')}: {res.get('value', '')}"
        else:
            text += f"\n## {res.get('name', 'Resource')}\n{res.get('value', '')}\n"
    return text


# ---------------------------------------------------------------------------
# Static fallback — reads existing data/agent_config.json just like before
# ---------------------------------------------------------------------------

def _load_static_fallback(mode: str) -> WorkspaceAgentConfig:
    """
    Reads data/agent_config.json (the dashboard-written file).
    This is the pre-Phase-5 path and acts as a safety net for local dev
    when no workspace_id is provided or Supabase is unreachable.
    """
    cfg_path = os.path.join(os.path.dirname(__file__), "data", "agent_config.json")
    result   = WorkspaceAgentConfig(mode=mode, source="static_fallback")

    if not os.path.exists(cfg_path):
        logger.warning("[WorkspaceLoader] data/agent_config.json not found — using hardcoded defaults")
        return result

    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg = data.get(mode) or data.get("outbound") or {}

        # Build system prompt with resources appended
        prompt = cfg.get("system_prompt", result.system_prompt)
        resources = cfg.get("resources", [])
        resources_text = _build_resources_text(resources)
        if resources_text:
            prompt += resources_text

        result.system_prompt     = prompt
        result.workspace_resources_text = resources_text
        result.initial_greeting  = cfg.get("initial_greeting",  result.initial_greeting)
        result.fallback_greeting = cfg.get("fallback_greeting", result.fallback_greeting)
        result.stt_provider      = cfg.get("stt_provider",      result.stt_provider)
        result.stt_model         = cfg.get("stt_model",         result.stt_model)
        result.stt_language      = cfg.get("stt_language",      result.stt_language)
        result.tts_provider      = cfg.get("tts_provider",      result.tts_provider)
        result.tts_voice         = cfg.get("tts_voice",         result.tts_voice)
        result.tts_language      = cfg.get("tts_language",      result.tts_language)
        result.llm_provider      = cfg.get("llm_provider",      result.llm_provider)
        result.llm_model         = cfg.get("llm_model",         result.llm_model)
        result.llm_temperature   = float(cfg.get("llm_temperature", result.llm_temperature))
        result.transfer_number   = cfg.get("transfer_number",   result.transfer_number)
        result.resources         = resources
        result.custom_functions  = cfg.get("custom_functions",  [])

        # SIP trunk IDs from .env for the static fallback path
        result.outbound_trunk_id = os.getenv("VOBIZ_SIP_TRUNK_ID")
        result.inbound_trunk_id  = os.getenv("INBOUND_TRUNK_ID")
        result.sip_domain        = os.getenv("VOBIZ_SIP_DOMAIN")
        result.transfer_number   = result.transfer_number or os.getenv("DEFAULT_TRANSFER_NUMBER")

        logger.info(f"[WorkspaceLoader] Static fallback loaded ({mode})")
    except Exception as e:
        logger.error(f"[WorkspaceLoader] Failed to parse agent_config.json: {e}")

    return result


# ---------------------------------------------------------------------------
# Main public interface
# ---------------------------------------------------------------------------

async def load_workspace_config(
    workspace_id: Optional[str],
    mode: str = "outbound",
) -> WorkspaceAgentConfig:
    """
    Load per-workspace agent configuration from Supabase.

    Queries:
      1. agent_configs WHERE business_id=workspace_id AND mode=mode
      2. workspace_config WHERE business_id=workspace_id  (for SIP trunk IDs)

    Falls back to data/agent_config.json → hardcoded defaults if:
      - workspace_id is None
      - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing
      - No DB record found for this workspace

    Args:
        workspace_id: The business UUID embedded in LiveKit room metadata.
        mode:         "outbound" or "inbound"

    Returns:
        WorkspaceAgentConfig — always populated, never raises.
    """
    if not workspace_id:
        logger.info("[WorkspaceLoader] No workspace_id in metadata — using static fallback")
        return _load_static_fallback(mode)

    loop = asyncio.get_event_loop()

    # ── 1. Fetch agent_configs row ──────────────────────────────────────────
    agent_cfg_rows = await loop.run_in_executor(
        None,
        lambda: _supabase_get(
            "agent_configs",
            {
                "select":      "system_prompt,initial_greeting,fallback_greeting,stt_provider,stt_model,stt_language,tts_provider,tts_voice,tts_language,llm_provider,llm_model,llm_temperature,transfer_number,resources",
                "business_id": f"eq.{workspace_id}",
                "mode":        f"eq.{mode}",
                "limit":       "1",
            },
        )
    )

    # ── 2. Fetch workspace SIP config via the secure RPC (get_workspace_config)
    #    This calls a SECURITY DEFINER function defined in the migration:
    #    20260621000000_vobiz_tenant_isolation.sql
    #
    #    The function DELIBERATELY omits vobiz_password from its return set.
    #    Agents only need trunk_id + sip_domain — they never see raw credentials.
    ws_cfg_result = await loop.run_in_executor(
        None,
        lambda: _supabase_rpc(
            "get_workspace_config",
            {"p_business_id": workspace_id},
        )
    )

    # ── 3. Fetch business name for logging ─────────────────────────────────
    biz_rows = await loop.run_in_executor(
        None,
        lambda: _supabase_get(
            "businesses",
            {
                "select":      "name",
                "id":          f"eq.{workspace_id}",
                "limit":       "1",
            },
        )
    )

    # ── 4. Unpack rows ──────────────────────────────────────────────────────
    agent_row = agent_cfg_rows[0] if isinstance(agent_cfg_rows, list) and agent_cfg_rows else None
    # RPC returns a single dict (not a list), or None on failure
    ws_row    = ws_cfg_result if isinstance(ws_cfg_result, dict) else None
    biz_row   = biz_rows[0]   if isinstance(biz_rows,      list) and biz_rows       else None

    if not agent_row:
        logger.warning(
            f"[WorkspaceLoader] No agent_configs row for workspace_id={workspace_id} mode={mode} — "
            "falling back to static config"
        )
        result = _load_static_fallback(mode)
        result.workspace_id = workspace_id
        # Still apply SIP trunk IDs from workspace_config if available
        if ws_row:
            result.outbound_trunk_id = ws_row.get("livekit_trunk_id") or result.outbound_trunk_id
            result.inbound_trunk_id  = ws_row.get("inbound_trunk_id") or result.inbound_trunk_id
            result.sip_domain        = ws_row.get("sip_domain")       or result.sip_domain
            result.transfer_number   = ws_row.get("transfer_number")  or result.transfer_number
        return result

    # ── 5. Build config from DB data ────────────────────────────────────────
    result = WorkspaceAgentConfig(
        workspace_id     = workspace_id,
        business_name    = biz_row.get("name", "Unknown") if biz_row else "Unknown",
        mode             = mode,
        source           = "database",
        system_prompt    = agent_row.get("system_prompt",    ""),
        initial_greeting = agent_row.get("initial_greeting", ""),
        fallback_greeting= agent_row.get("fallback_greeting",""),
        stt_provider     = agent_row.get("stt_provider",     "deepgram"),
        stt_model        = agent_row.get("stt_model",        "nova-3"),
        stt_language     = agent_row.get("stt_language",     "auto"),
        tts_provider     = agent_row.get("tts_provider",     "sarvam"),
        tts_voice        = agent_row.get("tts_voice",        "ishita"),
        tts_language     = agent_row.get("tts_language",     "en-IN"),
        llm_provider     = agent_row.get("llm_provider",     "groq"),
        llm_model        = agent_row.get("llm_model",        "llama-3.3-70b-versatile"),
        llm_temperature  = float(agent_row.get("llm_temperature", 0.70) or 0.70),
        transfer_number  = agent_row.get("transfer_number"),
        resources        = agent_row.get("resources",        []) or [],
        custom_functions = agent_row.get("custom_functions", []) or [],
    )

    # Append resources to system_prompt (same logic as static path)
    result.workspace_resources_text = _build_resources_text(result.resources)
    if result.workspace_resources_text:
        result.system_prompt += result.workspace_resources_text

    # Check if workspace has embedded knowledge base (for dynamic RAG)
    kb_check = await loop.run_in_executor(
        None,
        lambda: _supabase_get(
            "knowledge_base_documents",
            {
                "select": "id",
                "business_id": f"eq.{workspace_id}",
                "mode": f"eq.{mode}",
                "status": "eq.ready",
                "limit": "1",
            },
        )
    )
    if isinstance(kb_check, list) and len(kb_check) > 0:
        result.has_dynamic_kb = True
        logger.info(f"[WorkspaceLoader] Dynamic KB detected for workspace={workspace_id!r} mode={mode}")

    # SIP trunk IDs from the workspace_config table (via get_workspace_config RPC).
    # We do NOT fall back to .env vars here — if a workspace has been provisioned
    # with its own trunks, using a global fallback trunk would route calls through
    # the wrong Vobiz account and mix tenant billing.
    if ws_row:
        result.outbound_trunk_id = ws_row.get("livekit_trunk_id")  # None if not provisioned yet
        result.inbound_trunk_id  = ws_row.get("inbound_trunk_id")  # None if not provisioned yet
        result.sip_domain        = ws_row.get("sip_domain")
        result.transfer_number   = result.transfer_number or ws_row.get("transfer_number")
        if not result.outbound_trunk_id:
            logger.warning(
                f"[WorkspaceLoader] workspace={workspace_id!r} has no outbound trunk yet — "
                "telephony not provisioned. Calls will fail until trunks are set up."
            )
    else:
        # No workspace_config row at all — workspace may not have completed setup.
        # Log a warning but do NOT inject global .env trunks.
        logger.warning(
            f"[WorkspaceLoader] No workspace_config row found for workspace_id={workspace_id!r}. "
            "Telephony disabled for this session."
        )

    logger.info(
        f"[WorkspaceLoader] ✅ Loaded from DB — workspace={result.business_name!r} "
        f"mode={mode} trunk={result.outbound_trunk_id!r} tts={result.tts_provider}/{result.tts_voice}"
    )
    return result
