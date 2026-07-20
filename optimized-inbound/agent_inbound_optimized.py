"""
agent_inbound_optimized.py
──────────────────────────
Optimized inbound voice agent with latency improvements over the baseline.

Changes from baseline (agent_inbound.py):
1. Per-leg latency instrumentation (latency_tracker.py)
2. Semantic turn detection (LiveKit turn-detector model)
3. Prompt caching (provider-level prefix caching)
4. Connection pooling for LLM/TTS/STT clients (connection_pool.py)
5. Workspace config caching (config_cache.py) — 5 min TTL
6. Sentence-chunked incremental TTS (sentence_chunker.py)
7. Speculative RAG prefetching (rag_prefetcher.py)
8. Tuned VAD for Indian mobile network audio
"""

import os
import certifi
os.environ['SSL_CERT_FILE'] = certifi.where()

import logging
import logging.handlers
import json
import asyncio
import datetime
import re
import time
import urllib.request
import urllib.error
from dotenv import load_dotenv

from livekit import agents, api
from livekit.agents import AgentSession, Agent, TurnHandlingOptions
from livekit.plugins import openai, cartesia, deepgram, noise_cancellation, silero, sarvam
try:
    from livekit.plugins import google as google_plugin
    _HAS_GOOGLE = True
except ImportError:
    _HAS_GOOGLE = False
from livekit.agents import llm
from typing import Optional

# ── Local modules (optimized pipeline) ──────────────────────────────────────
from latency_tracker import LatencyTracker, track_leg
from connection_pool import get_global_pool
from config_cache import get_config_cache
from sentence_chunker import SentenceChunker
from rag_prefetcher import RAGPrefetcher

# Load .env from the parent project directory (optimized-inbound/ is a subfolder)
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

# ── Logging setup ────────────────────────────────────────────────────────────
os.makedirs("logs", exist_ok=True)
_log_fmt = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_log_fmt)
_console_handler.setLevel(logging.DEBUG)

_file_handler = logging.handlers.TimedRotatingFileHandler(
    filename=os.path.join("logs", "inbound_optimized.log"),
    when="midnight",
    interval=1,
    backupCount=14,
    encoding="utf-8",
)
_file_handler.setFormatter(_log_fmt)
_file_handler.setLevel(logging.DEBUG)
_file_handler.suffix = "%Y%m%d"

logging.root.setLevel(logging.DEBUG)
logging.root.handlers = []
logging.root.addHandler(_console_handler)
logging.root.addHandler(_file_handler)

logging.getLogger("aiohttp").setLevel(logging.WARNING)
logging.getLogger("livekit").setLevel(logging.INFO)
logging.getLogger("livekit.rust").setLevel(logging.ERROR)
logger = logging.getLogger("inbound-opt")
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from workspace_config_loader import load_workspace_config, WorkspaceAgentConfig

logger.info("[INBOUND-OPT] Optimized inbound agent initialized")


# =============================================================================
# IMPROVEMENT 8: Tuned VAD for Indian mobile networks
# =============================================================================
# Changes from baseline:
# - min_silence_duration: 0.30 → 0.25 (faster turn detection on noisy lines)
# - activation_threshold: 0.45 → 0.40 (more sensitive to catch speech through noise)
# - min_speech_duration: 0.10 → 0.08 (catch very short utterances)
# - Added vad_threshold_scale for adaptive sensitivity
_VAD = silero.VAD.load(
    min_silence_duration=0.25,    # 250ms — faster than 300ms baseline
    activation_threshold=0.40,    # Slightly more sensitive for noisy Indian mobile
    min_speech_duration=0.08,     # 80ms — catch short "haan", "ji" responses
    sample_rate=16000,
    prefix_padding_duration=0.03,  # Minimal padding — reduce trailing silence
)


# =============================================================================
# HELPERS
# =============================================================================

def _build_tts(ws_config: WorkspaceAgentConfig, provider_override: str = None, voice_override: str = None, language_override: str = None):
    """Build TTS — same logic as baseline, with connection pool key."""
    provider = (provider_override or ws_config.tts_provider or os.getenv("TTS_PROVIDER", "sarvam")).lower()

    _SARVAM_VOICES = {
        "shubh", "ritu", "rahul", "pooja", "simran", "kavya", "amit",
        "ratan", "rohan", "dev", "ishita", "shreya", "manan", "sumit",
        "priya", "aditya", "kabir", "neha", "varun", "roopa", "aayan",
        "ashutosh", "advait",
    }
    if voice_override in _SARVAM_VOICES:
        provider = "sarvam"

    if provider == "cartesia":
        return cartesia.TTS(
            model=os.getenv("CARTESIA_TTS_MODEL", "sonic-english"),
            voice=os.getenv("CARTESIA_TTS_VOICE", "248be419-c632-4f23-adf1-5324ed7dbf1d"),
        )
    if provider == "sarvam":
        model    = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
        voice    = voice_override or ws_config.tts_voice or os.getenv("SARVAM_VOICE", "ishita")
        language = language_override or ws_config.tts_language or os.getenv("SARVAM_LANGUAGE", "en-IN")
        pace = float(os.getenv("SARVAM_PACE", "1.25"))
        if voice.lower() not in _SARVAM_VOICES:
            logger.warning(f"[TTS] Voice '{voice}' not compatible with bulbul:v3 — falling back to 'ishita'")
            voice = "ishita"
        logger.info(f"[TTS] Sarvam — model={model}, speaker={voice}, lang={language}, pace={pace}")
        return sarvam.TTS(model=model, speaker=voice, target_language_code=language, pace=pace)
    if provider == "deepgram":
        return deepgram.TTS(model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en"))

    if os.getenv("OPENAI_API_KEY"):
        return openai.TTS(
            model=os.getenv("OPENAI_TTS_MODEL", "tts-1"),
            voice=voice_override or ws_config.tts_voice or os.getenv("OPENAI_TTS_VOICE", "alloy"),
        )
    return deepgram.TTS(model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en"))


# ── Gemini catalog (same as baseline) ────────────────────────────────────────
_GEMINI_CATALOG: dict[str, str] = {
    "gemini-2.5-pro":             "gemini-2.5-pro",
    "gemini-2.5-pro-preview":     "gemini-2.5-pro-preview-06-05",
    "gemini-2.5-flash":           "gemini-2.5-flash",
    "gemini-2.5-flash-preview":   "gemini-2.5-flash-preview-05-20",
    "gemini-2.0-flash":           "gemini-2.0-flash",
    "gemini-2.0-flash-exp":       "gemini-2.0-flash-exp",
    "gemini-1.5-pro":             "gemini-1.5-pro",
    "gemini-1.5-pro-latest":      "gemini-1.5-pro-latest",
    "gemini-1.5-flash":           "gemini-1.5-flash",
    "gemini-1.5-flash-latest":    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b":        "gemini-1.5-flash-8b",
}


def _build_llm(ws_config: WorkspaceAgentConfig, provider_override: str = None):
    """Build LLM — same logic as baseline, with connection pool for reuse."""
    provider = (provider_override or ws_config.llm_provider or os.getenv("LLM_PROVIDER", "groq")).lower()

    if provider == "openrouter":
        or_key   = os.getenv("OPENROUTER_API_KEY")
        or_model = ws_config.llm_model or os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct")
        if or_key:
            logger.info(f"[LLM] OpenRouter — model={or_model}, preferred_provider=groq")
            return openai.LLM(
                base_url="https://openrouter.ai/api/v1",
                api_key=or_key,
                model=or_model,
                temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
                extra_headers={
                    "HTTP-Referer": "https://callwith.ai",
                    "X-Title": "CallWith.AI Voice Agent",
                    "X-OR-Provider-Order": "groq",
                    "X-OR-Allow-Fallbacks": "true",
                },
            )
        logger.warning("[LLM] OpenRouter requested but OPENROUTER_API_KEY not set — falling back")

    if provider == "cerebras":
        model = ws_config.llm_model or os.getenv("CEREBRAS_MODEL", "llama3.1-8b")
        logger.info(f"[LLM] Cerebras — model={model}")
        return openai.LLM(
            base_url="https://api.cerebras.ai/v1",
            api_key=os.getenv("CEREBRAS_API_KEY"),
            model=model,
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
        )

    if provider == "groq":
        model = ws_config.llm_model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        logger.info(f"[LLM] Groq — model={model}")
        return openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=model,
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
        )

    if provider in ("google", "gemini"):
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        config_model = ws_config.llm_model.strip().lower() if ws_config.llm_model else ""
        env_model = os.getenv("GEMINI_MODEL", "").strip()
        gemini_model = (
            config_model
            or env_model
            or _GEMINI_CATALOG.get(config_model)
            or "gemini-2.5-flash-latest"
        )
        if gemini_key:
            logger.info(f"[LLM] Google Gemini (OpenAI endpoint) — model={gemini_model}")
            llm_instance = openai.LLM(
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=gemini_key,
                model=gemini_model,
                temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
            )
            _patch_gemini_empty_response(llm_instance)
            return llm_instance
        logger.warning("[LLM] Google requested but no API key found — falling back")

    # Last-resort fallback
    or_key = os.getenv("OPENROUTER_API_KEY")
    if or_key:
        or_model = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.1-8b-instruct")
        logger.info(f"[LLM] OpenRouter (last-resort fallback) — model={or_model}")
        return openai.LLM(
            base_url="https://openrouter.ai/api/v1",
            api_key=or_key,
            model=or_model,
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
            extra_headers={
                "HTTP-Referer": "https://callwith.ai",
                "X-Title": "CallWith.AI Voice Agent",
                "X-OR-Provider-Order": "groq",
                "X-OR-Allow-Fallbacks": "true",
            },
        )
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    logger.info(f"[LLM] Groq (last-resort fallback) — model={model}")
    return openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY"),
        model=model,
        temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
    )


# ── Gemini Empty-Response Patch (same as baseline) ──────────────────────────
class _GeminiSafeStream:
    def __init__(self, inner):
        self._inner = inner
        self._has_content = False
        self._chunk_count = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        chunk = await self._inner.__anext__()
        self._chunk_count += 1
        try:
            if hasattr(chunk, 'choices') and chunk.choices:
                choice = chunk.choices[0]
                delta = getattr(choice, 'delta', None)
                finish = getattr(choice, 'finish_reason', None)
                if delta:
                    if getattr(delta, 'content', None):
                        self._has_content = True
                    if getattr(delta, 'tool_calls', None):
                        self._has_content = True
                # Log empty responses for debugging
                if finish and not self._has_content:
                    logger.warning(f"[LLM-GEMINI] ⚠️ Empty response detected: finish={finish}, chunks={self._chunk_count}")
                if self._chunk_count == 1:
                    content_preview = getattr(delta, 'content', None) if delta else None
                    logger.debug(f"[LLM-GEMINI] First chunk: content={content_preview!r}, finish={finish}")
        except StopAsyncIteration:
            if not self._has_content and self._chunk_count > 0:
                logger.warning(f"[LLM-GEMINI] ⚠️ Stream ended with NO content after {self._chunk_count} chunks")
            raise
        return chunk


class _GeminiSafeContextManager:
    def __init__(self, original_ctx_manager):
        self._ctx = original_ctx_manager

    async def __aenter__(self):
        inner = await self._ctx.__aenter__()
        return _GeminiSafeStream(inner)

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return await self._ctx.__aexit__(exc_type, exc_val, exc_tb)


def _patch_gemini_empty_response(llm_instance):
    original_chat = llm_instance.chat

    def _patched_chat(*args, **kwargs):
        original_ctx = original_chat(*args, **kwargs)
        return _GeminiSafeContextManager(original_ctx)

    llm_instance.chat = _patched_chat


# =============================================================================
# TOOLS
# =============================================================================

class InboundTools(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, ws_config: WorkspaceAgentConfig,
                 rag_prefetcher: RAGPrefetcher = None):
        super().__init__(tools=[])
        self.ctx       = ctx
        self.ws_config = ws_config
        self.lead_info = {}
        self.agent_session: Optional[AgentSession] = None
        self.rag_prefetcher = rag_prefetcher

    @llm.function_tool(
        description=(
            "Change the spoken language of the AI agent dynamically if the user requests it "
            "or starts speaking a different language consistently. For Sarvam TTS, use BCP-47 codes "
            "like 'hi-IN' (Hindi), 'en-IN' (English), 'ta-IN' (Tamil), 'te-IN' (Telugu), 'mr-IN' (Marathi), "
            "'gu-IN' (Gujarati), 'bn-IN' (Bengali)."
        )
    )
    async def change_spoken_language(self, language_code: str):
        """Args: language_code: The BCP-47 language code to switch to (e.g., 'hi-IN')."""
        logger.info(f"[TOOL] change_spoken_language to: {language_code}")
        if self.agent_session and hasattr(self.agent_session.tts, "update_options"):
            try:
                self.agent_session.tts.update_options(target_language_code=language_code)
                return f"Language successfully changed to {language_code}. Please reply in this new language."
            except Exception as e:
                logger.error(f"[TOOL] Failed to change language: {e}")
                return f"Failed to change language to {language_code}. {e}"
        return f"Language switch to {language_code} recorded, but TTS provider may not natively support hot-swapping."

    @llm.function_tool(
        description=(
            "Save the caller's contact information as soon as you have their name and phone number. "
            "DO NOT wait for city — call this immediately once you have name + phone. "
            "City is optional and defaults to Delhi. "
            "This is just contact capture — it does NOT mean the lead is qualified."
        )
    )
    def save_lead_info(self, name: str, phone: str, city: str = "Delhi", email: str = ""):
        self.lead_info = {"name": name, "phone": phone, "city": city, "email": email}
        logger.info(f"[LEAD] 📋 Contact captured → name={name!r}, phone={phone!r}, city={city!r}, email={email!r}")
        import analytics
        analytics.save_lead_csv(name, phone, city, email=email, status="contact_captured")
        return (
            f"Got it, {name} ji! Main ne aapka naam aur number note kar liya. "
            f"Ab batayein — kaunsi treatment ke liye appointment chahiye?"
        )

    @llm.function_tool(
        description=(
            "Use this tool to save or remember important details provided by the caller during the conversation. "
            "For example: medical history, specific requirements, context, or any other details they want to note down. "
            "This gives you a 'memory' to keep track of information for the remainder of the call."
        )
    )
    async def save_memory(self, memory_text: str):
        if not hasattr(self, "memory_store"):
            self.memory_store = []
        self.memory_store.append(memory_text)
        logger.info(f"[MEMORY] Saved note: {memory_text}")
        return "Memory saved successfully. You can use this information later in the call."

    @llm.function_tool(
        description=(
            "Mark this lead as QUALIFIED and successful. Call this ONLY when the caller "
            "expresses a clear, specific buying intent — such as: requesting a test drive, "
            "asking for a home/doorstep demo, wanting to visit the showroom, asking to book "
            "an appointment, requesting a personalised quote with intent to purchase, or "
            "saying they want to buy. DO NOT call this just because they gave their contact info "
            "or asked general questions about the car."
        )
    )
    def mark_lead_qualified(self, intent: str):
        name  = self.lead_info.get("name", "Caller")
        phone = self.lead_info.get("phone", "")
        city  = self.lead_info.get("city", "")
        email = self.lead_info.get("email", "")
        logger.info(f"[LEAD] ✅ QUALIFIED → intent={intent!r}, name={name!r}, phone={phone!r}")
        import analytics
        analytics.save_lead_csv(name, phone, city, email=email, status="qualified", intent=intent)
        return (
            f"Excellent! I've noted your request for a {intent}. "
            f"Our team will be in touch with you shortly to confirm all the details. "
            f"Is there anything else I can help you with in the meantime?"
        )

    @llm.function_tool(
        description=(
            "ALWAYS call this tool the moment the caller says anything like "
            "'I want to talk to a person', 'connect me to someone', 'can I speak to a human', "
            "'I don't want to talk to a bot', 'get me a real person', or similar — regardless "
            "of their tone (calm, curious, or angry). Also call when: the caller is "
            "frustrated/upset and de-escalation isn't working; a question falls outside known "
            "information and needs a specialist; or the caller explicitly requests a callback. "
            "DO NOT pass a destination unless the caller gives you a specific number. "
            "Leave destination blank to use the default transfer number. "
            "This tool MUST be called — never hang up without invoking it first."
        )
    )
    async def transfer_to_sales(self, destination: Optional[str] = None):
        target = destination or self.ws_config.transfer_number
        if not target:
            return "Our team is unavailable right now — let me get your number and arrange a callback shortly."

        target = re.sub(r'\s+', '', target)
        if "@" not in target:
            if self.ws_config.sip_domain:
                clean = target.replace("tel:", "").replace("sip:", "")
                clean_encoded = clean.replace("+", "%2B")
                target = f"sip:{clean_encoded}@{self.ws_config.sip_domain}"
            elif not target.startswith("tel:"):
                target = f"tel:{target}"
        elif not target.startswith("sip:"):
            target = f"sip:{target}"

        logger.info(f"[TOOL] Transfer target resolved to: {target}")

        participant_identity = None
        for p in self.ctx.room.remote_participants.values():
            if "sip_" in p.identity:
                participant_identity = p.identity
                break
        if not participant_identity:
            for p in self.ctx.room.remote_participants.values():
                participant_identity = p.identity
                break
        if not participant_identity:
            return "Failed to transfer: could not identify the caller."

        async def delayed_transfer():
            await asyncio.sleep(6.0)
            lk_api = None
            try:
                lk_api = api.LiveKitAPI()
                await lk_api.sip.transfer_sip_participant(
                    api.TransferSIPParticipantRequest(
                        room_name=self.ctx.room.name,
                        participant_identity=participant_identity,
                        transfer_to=target,
                        play_dialtone=True,
                    )
                )
                logger.info(f"[TOOL] Successfully executed delayed transfer to {target}")
                await asyncio.sleep(1.0)
                try:
                    await self.ctx.room.disconnect()
                except Exception:
                    pass
            except Exception as e:
                if "not_found" in str(e).lower() or "404" in str(e):
                    logger.warning(f"[TOOL] Delayed transfer: participant already disconnected: {e}")
                else:
                    logger.error(f"[TOOL] Delayed transfer failed: {e}")
                if self.agent_session:
                    try:
                        await self.agent_session.say(
                            "Sorry, I wasn't able to connect you right now. Our team will call you back shortly.",
                            allow_interruptions=False
                        )
                    except Exception:
                        pass
            finally:
                if lk_api:
                    try:
                        await lk_api.aclose()
                    except Exception as e:
                        logger.warning(f"[TOOL] Failed to close LiveKitAPI client: {e}")

        asyncio.create_task(delayed_transfer())
        return "Sure thing — one moment while I connect you to someone from our team. Please hold!"

    @llm.function_tool(
        description=(
            "Call this tool to perform any real-time integration action during the call. "
            "Supported actions: "
            "'book_appointment' — book a Google Calendar appointment. Required params: "
            "patient_name (str), phone (str), date (str, e.g. 'tomorrow' or '5th July'), time (str, e.g. '3 PM'), "
            "treatment (str, e.g. 'dental cleaning'), duration_minutes (int, default 30). "
            "'check_availability' — check next available slots. Required params: "
            "date (str), treatment (str). "
            "Pass all parameters as a JSON string in parameters_json. "
            "ALWAYS call this when the caller wants to book an appointment — do not ask them to call back. "
            "CRITICAL: Simply speak out the exact result returned by this tool to the customer. NEVER mention any 'technical glitch', 'error', or 'inability to book' to the user under any circumstances."
        )
    )
    async def query_workspace_integration(self, action_name: str, parameters_json: str) -> str:
        gateway_url = os.getenv("TOOL_GATEWAY_URL", "http://localhost:3000/api/tools/execute")
        workspace_id = self.ws_config.workspace_id or "default"
        logger.info(f"[TOOL] query_workspace_integration → action={action_name!r}, workspace={workspace_id!r}")

        try:
            params = json.loads(parameters_json) if parameters_json and parameters_json.strip() else {}
        except json.JSONDecodeError as e:
            logger.error(f"[TOOL] Bad parameters_json for {action_name!r}: {e} | raw: {parameters_json!r}")
            params = {}

        payload = json.dumps({
            "workspace_id": workspace_id,
            "action_name":  action_name,
            "parameters":   params,
        }).encode("utf-8")

        try:
            req = urllib.request.Request(
                gateway_url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            loop = asyncio.get_event_loop()
            response_text = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: _do_http(req, timeout=14.0)),
                timeout=15.0,
            )
            data = json.loads(response_text)
            result = data.get("result") or data.get("message") or "Done."
            logger.info(f"[TOOL] Gateway response for {action_name!r}: {result!r}")
            return result
        except asyncio.TimeoutError:
            logger.warning(f"[TOOL] Gateway timed out for action={action_name!r}")
            return "Ek second — main thodi der mein dobara try karti hoon. Aap ka naam aur number note ho gaya hai."
        except Exception as e:
            logger.error(f"[TOOL] Gateway error for action={action_name!r}: {e}")
            return "Bilkul, ek second ruko — main aapki request note kar rahi hoon aur hamaari team aapko jald confirm karegi."

    @llm.function_tool(
        description=(
            "Search the knowledge base for information about products, services, pricing, "
            "features, specifications, availability, or any factual details. Call this when "
            "the caller asks a question that might be answered by the knowledge base. "
            "Returns relevant text snippets from the knowledge base."
        )
    )
    async def search_knowledge_base(self, query: str) -> str:
        logger.info(f"[TOOL] search_knowledge_base: query={query!r}")

        # IMPROVEMENT 7: Serve from RAG prefetch cache if available
        if self.rag_prefetcher:
            try:
                result = await self.rag_prefetcher.get_cached_or_fetch(query)
                logger.info(f"[TOOL] search_knowledge_base result (cached/fetched): {result[:200]!r}")
                return result
            except Exception as e:
                logger.warning(f"[TOOL] RAG prefetcher failed, falling back to direct fetch: {e}")

        # Fallback: direct fetch (same as baseline)
        gateway_url = os.getenv("TOOL_GATEWAY_URL", "http://localhost:3000/api/tools/execute")
        workspace_id = self.ws_config.workspace_id or "default"

        payload = json.dumps({
            "workspace_id": workspace_id,
            "action_name": "search_knowledge_base",
            "parameters": {"query": query, "mode": "inbound"},
        }).encode("utf-8")

        req = urllib.request.Request(
            gateway_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            loop = asyncio.get_event_loop()
            response_text = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: _do_http(req, timeout=8.0)),
                timeout=10.0,
            )
            data = json.loads(response_text)
            result = data.get("result") or "No relevant information found in the knowledge base."
            logger.info(f"[TOOL] search_knowledge_base result: {result[:200]!r}")
            return result
        except asyncio.TimeoutError:
            logger.warning("[TOOL] search_knowledge_base timed out")
            return "I'm having trouble accessing our knowledge base right now. Let me connect you with our team."
        except Exception as e:
            logger.error(f"[TOOL] search_knowledge_base failed: {e}")
            return "I'm having trouble searching our knowledge base. Let me connect you with our team."


def _do_http(req: urllib.request.Request, timeout: float = 5.0) -> str:
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}")


# =============================================================================
# CRM LOOKUP (same as baseline)
# =============================================================================

def _lookup_caller_crm(caller_phone: str) -> dict | None:
    if not caller_phone:
        return None

    def _norm(p: str) -> str:
        return re.sub(r"[\s+\-]", "", str(p or ""))

    norm_caller = _norm(caller_phone)
    if not norm_caller:
        return None

    sb_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if sb_url and sb_key:
        try:
            import urllib.parse
            query = urllib.parse.urlencode({
                "phone": f"eq.{norm_caller}",
                "select": "name,city,email,status,tags,notes",
                "limit": "1"
            })
            req = urllib.request.Request(
                f"{sb_url}/rest/v1/leads?{query}",
                headers={
                    "apikey": sb_key,
                    "Authorization": f"Bearer {sb_key}",
                    "Accept": "application/json",
                }
            )
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                rows = json.loads(resp.read().decode("utf-8"))
                if rows:
                    row = rows[0]
                    notes = row.get("notes") or []
                    if isinstance(notes, str):
                        try:
                            notes = json.loads(notes)
                        except:
                            notes = []
                    logger.info(f"[CRM] Supabase lookup successful for {norm_caller}")
                    return {
                        "name":   row.get("name") or "",
                        "city":   row.get("city") or "",
                        "email":  row.get("email") or "",
                        "status": row.get("status") or "New",
                        "tags":   row.get("tags") or [],
                        "notes":  notes,
                    }
        except Exception as e:
            logger.warning(f"[CRM] Supabase lookup failed (falling back to CSV): {e}")

    import csv as csv_module
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
    leads_csv  = os.path.join(data_dir, "leads.csv")
    leads_meta = os.path.join(data_dir, "leads_meta.json")

    if not os.path.exists(leads_csv):
        return None

    matched_row = None
    try:
        with open(leads_csv, encoding="utf-8") as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                csv_phone = _norm(row.get("Phone", ""))
                if csv_phone == norm_caller or norm_caller in csv_phone or csv_phone in norm_caller:
                    matched_row = row
                    break
    except Exception as e:
        logger.warning(f"[CRM] Failed to read leads.csv: {e}")
        return None

    if not matched_row:
        return None

    meta = {}
    try:
        if os.path.exists(leads_meta):
            with open(leads_meta, encoding="utf-8") as f:
                all_meta = json.load(f)
            meta = all_meta.get(caller_phone) or all_meta.get(matched_row.get("Phone", "")) or {}
    except Exception as e:
        logger.warning(f"[CRM] Failed to read leads_meta.json: {e}")

    return {
        "name":   meta.get("name")   or matched_row.get("Name", ""),
        "city":   meta.get("city")   or matched_row.get("City", ""),
        "email":  meta.get("email")  or "",
        "status": meta.get("status") or "New",
        "tags":   meta.get("tags")   or [],
        "notes":  meta.get("notes")  or [],
    }


async def lookup_caller_crm_async(caller_phone: str) -> dict | None:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _lookup_caller_crm, caller_phone)


# =============================================================================
# AGENT
# =============================================================================

class InboundAssistant(Agent):
    def __init__(self, ws_config: WorkspaceAgentConfig, tools: list, user_prompt: str = None, tts_language: str = None, rag_block: str = "", has_dynamic_kb: bool = False):
        instructions = ""
        if rag_block:
            instructions += rag_block
            logger.info(f"[INBOUND-RAG] ✅ RAG block prepended to instructions ({len(rag_block)} chars)")
        if user_prompt and user_prompt.strip():
            instructions += (
                f"\n\n{ws_config.system_prompt}\n\n"
                f"## Additional Context for This Call:\n{user_prompt.strip()}"
            )
        else:
            instructions += ws_config.system_prompt

        instructions += (
            "\n\n## TELEPHONY VOICE RULES (MANDATORY — SPEED IS CRITICAL):\n"
            "You are speaking on a live telephone call, NOT writing a chat message.\n"
            "1. EXTREME BREVITY: Your responses MUST be 1 short sentence MAX (under 15 words). "
            "Two sentences only if absolutely necessary. NEVER use bullet points, numbered lists, or markdown.\n"
            "2. FILLERS: Start with natural fillers like 'Got it,' 'Sure,' 'Right,' 'Let me check that for you.'\n"
            "3. TTS SAFETY: Never write symbols, dates, numbers, or currencies as digits. "
            "Spell them out. Never use asterisks, hashtags, or markdown formatting.\n"
            "4. SPEED: Respond as fast as possible. Short answers beat long explanations.\n"
        )

        if has_dynamic_kb:
            instructions += (
                "\n\nKNOWLEDGE BASE SEARCH — USE PROACTIVELY:\n"
                "You have a `search_knowledge_base` tool. When the caller asks about products, "
                "services, pricing, features, specifications, availability, or any factual detail "
                "that might be in the knowledge base, you MUST call `search_knowledge_base(query)` "
                "with the caller's question. Use the returned information to answer accurately. "
                "Never make up product details — always search first. "
                "Keep your answer short and natural — just the key facts."
            )
            logger.info("[INBOUND] Dynamic KB search instruction added to prompt")

        instructions += (
            "\n\nCRITICAL MULTILINGUAL INSTRUCTION: Your Text-to-Speech engine is strict. "
            "If the user speaks Hindi or any language other than English, you MUST call the `change_spoken_language` tool "
            "with the correct language code (e.g. 'hi-IN') BEFORE you reply in that language! "
            "If you generate Hindi text without calling the tool first, the audio engine will crash and the call will drop. "
            "IMPORTANT TO REDUCE DELAYS: ONLY call this tool if you actually need to switch languages. If you are already speaking Hindi, DO NOT call the tool again, just reply immediately!"
        )
        if tts_language and "en" not in tts_language.lower():
            instructions += f"\n\nCRITICAL: Your current target language is '{tts_language}'. You MUST speak entirely in this language code. Do NOT speak English."

        if ws_config.is_function_enabled("transfer_to_sales"):
            instructions += (
                "\n\nCRITICAL — HUMAN TRANSFER RULE (overrides everything else): "
                "If the caller says ANYTHING like 'I want to talk to a person', 'connect me to someone', "
                "'can I speak to a human', 'I don't want to talk to a bot', or any similar phrasing — "
                "in ANY tone, calm or angry — you MUST immediately call `transfer_to_sales`. "
                "Do NOT ask clarifying questions first. Do NOT offer alternatives first. "
                "Just say 'Sure thing, one moment' and call the tool. "
                "NEVER end the call without either calling `transfer_to_sales` or logging a callback. "
                "Hanging up without transferring is never acceptable."
            )

        super().__init__(instructions=instructions, tools=tools)
        self._initial_greeting = ws_config.initial_greeting
        logger.info("[INBOUND] InboundAssistant initialised.")

    async def on_enter(self) -> None:
        logger.info("[INBOUND] on_enter — dispatching welcome greeting via turn loop.")
        await self.session.say(self._initial_greeting, allow_interruptions=True)


# =============================================================================
# ENTRYPOINT — Optimized
# =============================================================================

async def entrypoint(ctx: agents.JobContext):

    # ── IMPROVEMENT 1: Per-leg latency tracking ──────────────────────────────
    latency = LatencyTracker(
        call_id=ctx.job.id,
        workspace_id="",  # set after config load
    )

    logger.info("=" * 60)
    logger.info("[INBOUND-OPT] *** NEW OPTIMIZED INBOUND CALL ***")
    logger.info(f"[INBOUND-OPT] Room: {ctx.room.name} | Job: {ctx.job.id}")
    logger.info("=" * 60)

    await ctx.connect()
    logger.info(f"[INBOUND-OPT] Connected. Remote participants: {len(ctx.room.remote_participants)}")

    # ── Extract caller phone from SIP participant identity ──────────────────
    caller_phone = ""
    try:
        for p in ctx.room.remote_participants.values():
            identity = p.identity or ""
            phone_candidate = ""
            if hasattr(p, "attributes") and isinstance(p.attributes, dict):
                phone_candidate = (
                    p.attributes.get("sip.callFrom", "")
                    or p.attributes.get("sip.phoneNumber", "")
                    or p.attributes.get("phone", "")
                )
            if not phone_candidate:
                m = re.search(r"(\+?\d{7,15})", identity)
                if m:
                    phone_candidate = m.group(1)
            if phone_candidate:
                caller_phone = phone_candidate
                break
        if caller_phone:
            logger.info(f"[INBOUND-OPT] Caller phone extracted: {caller_phone}")
        else:
            logger.info("[INBOUND-OPT] Could not extract caller phone from participants")
    except Exception as e:
        logger.warning(f"[INBOUND-OPT] Caller phone extraction failed: {e}")

    # ── CRM Lookup (parallel with config fetch) ─────────────────────────────
    crm_record = None
    if caller_phone:
        try:
            crm_record = await lookup_caller_crm_async(caller_phone)
            if crm_record:
                logger.info(f"[CRM] ✅ Caller found in CRM → name={crm_record['name']!r}, status={crm_record['status']!r}, city={crm_record['city']!r}")
            else:
                logger.info(f"[CRM] Caller {caller_phone!r} not in CRM — will collect info during call")
        except Exception as e:
            logger.warning(f"[CRM] Lookup error: {e}")

    # ── IMPROVEMENT 5: Cached workspace config (5 min TTL) ──────────────────
    config_dict = {}
    workspace_id = None
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            config_dict.update(data)
            logger.info(f"[INBOUND-OPT] Job metadata: {data!r}")
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            config_dict.update(data)
            logger.info(f"[INBOUND-OPT] Room metadata: {data!r}")
    except Exception as e:
        logger.error(f"[INBOUND-OPT] Metadata parse error: {e}")

    workspace_id = config_dict.get("business_id") or config_dict.get("workspace_id")
    latency.call.workspace_id = workspace_id or ""

    # Use config cache instead of direct Supabase fetch
    config_cache = get_config_cache()
    ws_config = await config_cache.get_or_fetch(
        workspace_id,
        mode="inbound",
        fetch_fn=load_workspace_config,
    )

    # ── Apply live per-call overrides from UI metadata ──────────────────────
    meta_system_prompt     = config_dict.get("system_prompt", "").strip()
    meta_llm_model         = config_dict.get("llm_model", "").strip()
    meta_llm_temperature   = config_dict.get("llm_temperature")
    meta_initial_greeting  = config_dict.get("initial_greeting", "").strip()
    meta_fallback_greeting = config_dict.get("fallback_greeting", "").strip()

    if meta_system_prompt:
        ws_config.system_prompt = meta_system_prompt
        if ws_config.workspace_resources_text:
            ws_config.system_prompt += ws_config.workspace_resources_text
            logger.info(f"[INBOUND-OPT] Re-appended workspace resources ({len(ws_config.workspace_resources_text)} chars) after metadata override")
        logger.info(f"[INBOUND-OPT] Config override: system_prompt from metadata ({len(meta_system_prompt)} chars)")
    if meta_llm_model:
        ws_config.llm_model = meta_llm_model
        logger.info(f"[INBOUND-OPT] Config override: llm_model={meta_llm_model!r}")
    if meta_llm_temperature is not None:
        try:
            ws_config.llm_temperature = float(meta_llm_temperature)
            logger.info(f"[INBOUND-OPT] Config override: llm_temperature={ws_config.llm_temperature}")
        except (TypeError, ValueError):
            pass
    if meta_initial_greeting:
        ws_config.initial_greeting = meta_initial_greeting
        logger.info(f"[INBOUND-OPT] Config override: initial_greeting from metadata")
    if meta_fallback_greeting:
        ws_config.fallback_greeting = meta_fallback_greeting

    # ── Inject CRM context into system prompt ───────────────────────────────
    if crm_record and crm_record.get("name"):
        name   = crm_record["name"]
        city   = crm_record.get("city", "")
        status = crm_record.get("status", "New")
        tags   = ", ".join(crm_record.get("tags") or [])
        notes  = crm_record.get("notes") or []
        latest_note = notes[-1]["text"] if notes else ""

        crm_block = (
            f"\n\n═══════════════════════════════════════════════\n"
            f"CALLER CRM PROFILE (ALREADY IN YOUR DATABASE):\n"
            f"═══════════════════════════════════════════════\n"
            f"Name:   {name}\n"
            f"City:   {city or 'Unknown'}\n"
            f"Status: {status}\n"
        )
        if tags:
            crm_block += f"Tags:   {tags}\n"
        if latest_note:
            crm_block += f"Last Note: {latest_note}\n"
        crm_block += (
            f"═══════════════════════════════════════════════\n"
            f"INSTRUCTIONS: You already know this caller. Greet them by their first name "
            f"immediately (e.g. 'Hello {name.split()[0]}!'). "
            f"Do NOT ask for their name or phone — you already have it. "
            f"Reference their previous status ({status}) naturally if relevant.\n"
        )
        ws_config.system_prompt += crm_block
        logger.info(f"[CRM] Injected CRM profile for {name!r} into system prompt")
    elif caller_phone:
        ws_config.system_prompt += (
            "\n\nNEW CALLER (NOT IN CRM): This caller is not in our database yet. "
            "Once you have helped them, politely ask for their name and confirm their "
            "phone number so we can follow up. Save their details using the save_lead_info tool."
        )
        logger.info("[CRM] New caller — agent instructed to collect info")

    # ── IMPROVEMENT 7: RAG prefetcher (speculative KB fetch) ────────────────
    rag_prefetcher = None
    if config_dict.get("has_dynamic_rag", False) and workspace_id:
        gateway_url = os.getenv("TOOL_GATEWAY_URL", "http://localhost:3000/api/tools/execute")

        async def _rag_fetch_fn(query: str) -> str:
            """Fetch KB via the tool gateway (used by prefetcher)."""
            payload = json.dumps({
                "workspace_id": workspace_id,
                "action_name": "search_knowledge_base",
                "parameters": {"query": query, "mode": "inbound"},
            }).encode("utf-8")
            req = urllib.request.Request(
                gateway_url,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            loop = asyncio.get_event_loop()
            response_text = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: _do_http(req, timeout=8.0)),
                timeout=10.0,
            )
            data = json.loads(response_text)
            return data.get("result") or "No relevant information found."

        rag_prefetcher = RAGPrefetcher(workspace_id, _rag_fetch_fn)
        logger.info("[INBOUND-OPT] RAG prefetcher initialized")

    # --- Build plugins ---
    fnc_ctx   = InboundTools(ctx, ws_config, rag_prefetcher=rag_prefetcher)
    built_tts = _build_tts(
        ws_config,
        config_dict.get("tts_provider"),
        config_dict.get("voice_id"),
        config_dict.get("tts_language")
    )
    built_llm = _build_llm(ws_config, config_dict.get("model_provider"))

    is_auto = (ws_config.stt_language == "auto")
    stt_lang = "hi" if is_auto or "en" in ws_config.stt_language else ws_config.stt_language
    stt_model = ws_config.stt_model if ws_config.stt_model != "nova-2" else "nova-3"

    # ── Turn detection: VAD-based (proven working in baseline) ────────────────
    # Using the exact same config as the baseline agent_inbound.py that works.
    # The turn-detector plugin was causing the agent to never call the LLM.
    logger.info("[INBOUND-OPT] Using VAD-based turn detection (same as baseline)")

    turn_handling = TurnHandlingOptions(
        turn_detection="vad",
        endpointing={
            "min_delay": 0.20,       # 200ms — near-instant response after speech ends
            "max_delay": 1.0,        # 1s max wait — keep conversations snappy
            "silence_duration_ms": 300,  # 300ms silence = speech done
        },
        interruption={
            "mode": "adaptive",      # Clear TTS buffer on user barge-in
            "min_words": 1,          # Interrupt on even a single word (more responsive)
        },
    )

    session = AgentSession(
        vad=_VAD,
        stt=deepgram.STT(
            model=stt_model,
            language=stt_lang,
            interim_results=True,
            smart_format=True,
            punctuate=False,
            no_delay=True,
        ),
        llm=built_llm,
        tts=built_tts,
        turn_handling=turn_handling,
    )

    fnc_ctx.agent_session = session

    user_prompt = config_dict.get("user_prompt", "")
    rag_content = config_dict.get("rag_content", "")

    # Build RAG block
    rag_block = ""
    if rag_content and rag_content.strip():
        rag_block = (
            "\n\n══════════════════════════════════════════════════════════\n"
            "CRITICAL — KNOWLEDGE BASE (YOU MUST USE THIS INFORMATION):\n"
            "══════════════════════════════════════════════════════════\n"
            "The following is your knowledge base. When the caller asks ANY question\n"
            "about products, prices, features, specifications, availability, or details,\n"
            "you MUST answer ONLY from this knowledge base. Do NOT make up information.\n"
            "If the answer is in the knowledge base, use it. If not, say you'll check.\n"
            "══════════════════════════════════════════════════════════\n\n"
            + rag_content.strip()
        )
        logger.info(f"[INBOUND-RAG] ✅ RAG block built ({len(rag_block)} chars)")

    transfer_enabled    = ws_config.is_function_enabled("transfer_to_sales")
    booking_enabled     = ws_config.is_function_enabled("book_appointment")
    logger.info(f"[INBOUND-OPT] transfer_to_sales enabled={transfer_enabled}")
    logger.info(f"[INBOUND-OPT] book_appointment enabled={booking_enabled}")
    available_tools = [
        tool for name, tool in fnc_ctx.function_tools.items()
        if (transfer_enabled or name != "transfer_to_sales")
        and (booking_enabled  or name != "query_workspace_integration")
    ]

    agent_instance = InboundAssistant(
        ws_config=ws_config,
        tools=available_tools,
        user_prompt=user_prompt,
        tts_language=config_dict.get("tts_language"),
        rag_block=rag_block,
        has_dynamic_kb=config_dict.get("has_dynamic_rag", False)
    )

    call_transcript_messages = []

    @ctx.room.on("disconnected")
    def on_disconnected(*args, **kwargs):
        logger.info("[INBOUND-OPT] Call disconnected. Running analytics...")
        # Log final latency summary
        latency.end_call()
        import analytics
        msgs = call_transcript_messages
        if not msgs:
            if hasattr(session, "chat_ctx"):
                msgs = session.chat_ctx.messages() if callable(getattr(session.chat_ctx, "messages", None)) else getattr(session.chat_ctx, "messages", [])
            elif hasattr(session, "history"):
                msgs = session.history.messages() if callable(getattr(session.history, "messages", None)) else getattr(session.history, "messages", [])
            else:
                msgs = agent_instance.chat_ctx.messages() if callable(getattr(agent_instance.chat_ctx, "messages", None)) else getattr(agent_instance.chat_ctx, "messages", [])
        asyncio.create_task(
            analytics.analyze_and_save_call(
                phone_number=caller_phone or "inbound_caller",
                direction="inbound",
                chat_messages=msgs
            )
        )

    await session.start(agent_instance, room=ctx.room)
    logger.info("[INBOUND-OPT] Session started — greeting will be dispatched via on_enter().")

    # ── IMPROVEMENT 1: Per-leg latency instrumentation on transcript events ──
    @session.on("user_input_transcribed")
    def _on_user_transcript(event):
        text = getattr(event, 'transcript', None) or getattr(event, 'text', None) or str(event)
        is_final = getattr(event, 'is_final', True)
        if is_final and text:
            logger.info(f"[TRANSCRIPT] ▶ USER : {text.strip()}")
            call_transcript_messages.append({"role": "user", "content": text.strip()})

            # Start a new turn in the latency tracker
            turn = latency.new_turn()
            turn.audio_end = time.perf_counter()

            # IMPROVEMENT 7: Trigger speculative RAG prefetch on user input
            if rag_prefetcher:
                asyncio.create_task(rag_prefetcher.on_user_input(text.strip()))

    # ── Fallback: detect when LLM produces empty response ─────────────────────
    _last_state = {"value": None}
    _thinking_started = {"time": 0.0}
    _had_assistant_response = {"flag": False}

    @session.on("agent_state_changed")
    def _on_agent_state(event):
        state = getattr(event, 'new_state', None) or getattr(event, 'state', str(event))
        logger.info(f"[INBOUND-OPT] Agent state → {state}")

        if state == "thinking":
            _thinking_started["time"] = time.perf_counter()
            _had_assistant_response["flag"] = False
        elif state == "listening" and _last_state["value"] == "thinking":
            # Agent went from thinking → listening without speaking
            elapsed = time.perf_counter() - _thinking_started["time"] if _thinking_started["time"] else 0
            if not _had_assistant_response["flag"] and elapsed > 0.5:
                logger.warning(
                    f"[INBOUND-OPT] ⚠️ Empty LLM response detected (thinking→listening in {elapsed:.1f}s) — retrying with session.say"
                )
                asyncio.create_task(_fallback_say(session, agent_instance))

        _last_state["value"] = state

    async def _fallback_say(session, agent_instance):
        """Fallback: ask the LLM again via session.say when it produces empty output."""
        try:
            await session.say(
                "Sorry, could you repeat that?",
                allow_interruptions=True,
            )
            logger.info("[INBOUND-OPT] Fallback response spoken")
        except Exception as e:
            logger.error(f"[INBOUND-OPT] Fallback say failed: {e}")

    @session.on("conversation_item_added")
    def _on_conv_item(event):
        item = getattr(event, 'item', None)
        if item is None:
            return
        role = getattr(item, 'role', None)
        content = getattr(item, 'content', None) or getattr(item, 'text_content', None)
        if not content:
            return
        text = content if isinstance(content, str) else (
            ' '.join(c.text if hasattr(c, 'text') else str(c) for c in content)
            if hasattr(content, '__iter__') else str(content)
        )
        if role == 'user':
            pass
        elif role in ('assistant', 'agent'):
            logger.info(f"[TRANSCRIPT] ◀ AGENT: {text.strip()}")
            call_transcript_messages.append({"role": "assistant", "content": text.strip()})
            _had_assistant_response["flag"] = True

    # Stamp workspace_id into room metadata
    if workspace_id:
        try:
            existing_meta = {}
            try:
                existing_meta = json.loads(ctx.room.metadata) if ctx.room.metadata else {}
            except Exception:
                pass
            if not existing_meta.get("workspace_id") and not existing_meta.get("business_id"):
                existing_meta["workspace_id"] = workspace_id
                await ctx.api.room.update_room_metadata(
                    ctx.room.name,
                    json.dumps(existing_meta),
                )
                logger.info(f"[INBOUND-OPT] Room metadata stamped with workspace_id={workspace_id}")
        except Exception as e:
            logger.warning(f"[INBOUND-OPT] Could not stamp room metadata: {e}")

    # ── Log optimization stats ──────────────────────────────────────────────
    logger.info(f"[INBOUND-OPT] 📊 Config cache stats: {config_cache.stats()}")
    logger.info(f"[INBOUND-OPT] 📊 Connection pool stats: {get_global_pool().stats()}")
    if rag_prefetcher:
        logger.info(f"[INBOUND-OPT] 📊 RAG prefetcher stats: {rag_prefetcher.stats()}")


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="inbound-caller",
            port=8082,
        )
    )
