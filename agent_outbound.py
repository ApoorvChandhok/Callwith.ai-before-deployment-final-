import os
import certifi
os.environ['SSL_CERT_FILE'] = certifi.where()

import logging
import logging.handlers
import json
import asyncio
import datetime
import re
import urllib.request
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

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)


def _normalize_phone(number: str) -> str:
    """Ensure phone is in E.164 format. Defaults to +91 for 10-digit Indian numbers."""
    if not number:
        return number
    number = number.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if number.startswith("+"):
        return number  # Already E.164
    if number.startswith("91") and len(number) == 12:
        return f"+{number}"  # 91XXXXXXXXXX -> +91XXXXXXXXXX
    if len(number) == 10:
        return f"+91{number}"  # 10-digit Indian mobile
    return f"+{number}"


# ── Logging setup: console + rotating daily file ──────────────────────────────
os.makedirs("logs", exist_ok=True)
_log_fmt = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_log_fmt)
_console_handler.setLevel(logging.DEBUG)

_file_handler = logging.handlers.TimedRotatingFileHandler(
    filename=os.path.join("logs", "outbound.log"),
    when="midnight",
    interval=1,
    backupCount=14,
    encoding="utf-8",
)
_file_handler.setFormatter(_log_fmt)
_file_handler.setLevel(logging.DEBUG)
_file_handler.suffix = "%Y%m%d"  # e.g. outbound.log.20260623

logging.root.setLevel(logging.DEBUG)
logging.root.handlers = []
logging.root.addHandler(_console_handler)
logging.root.addHandler(_file_handler)

logging.getLogger("aiohttp").setLevel(logging.WARNING)
logging.getLogger("livekit").setLevel(logging.INFO)
logger = logging.getLogger("outbound-agent")

# Import the dynamic workspace config loader
from workspace_config_loader import load_workspace_config, WorkspaceAgentConfig

logger.info("[OUTBOUND] Agent initialized")

# Pre-load VAD model at startup — tuned for telephony
_VAD = silero.VAD.load(
    min_silence_duration=0.30,    # 300ms — fast silence detection
    activation_threshold=0.40,    # Balanced threshold
    min_speech_duration=0.15,     # 150ms — very quick detection
    sample_rate=16000,
)


# =============================================================================
# HELPERS
# =============================================================================

def _build_tts(ws_config: WorkspaceAgentConfig, provider_override: str = None, voice_override: str = None, language_override: str = None, speed: float = 1.0):
    provider = (provider_override or ws_config.tts_provider or os.getenv("TTS_PROVIDER", "sarvam")).lower()

    # Route to Sarvam if the voice override is a known Sarvam speaker (bulbul:v3 compatible list)
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
            voice=voice_override or os.getenv("CARTESIA_TTS_VOICE", "248be419-c632-4f23-adf1-5324ed7dbf1d"),
        )
    if provider == "sarvam":
        model    = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
        voice    = voice_override or ws_config.tts_voice or os.getenv("SARVAM_VOICE", "ishita")
        language = language_override or ws_config.tts_language or os.getenv("SARVAM_LANGUAGE", "en-IN")
        pace = float(os.getenv("SARVAM_PACE", "1.25"))  # Faster speech (default 1.0)
        # Validate voice is compatible with bulbul:v3 — fallback to ishita if not
        if voice.lower() not in _SARVAM_VOICES:
            logger.warning(f"[TTS] Voice '{voice}' not compatible with bulbul:v3 — falling back to 'ishita'")
            voice = "ishita"
        logger.info(f"[TTS] Sarvam -- model={model}, speaker={voice}, lang={language}, pace={pace}")
        return sarvam.TTS(model=model, speaker=voice, target_language_code=language, pace=pace)
    if provider == "deepgram":
        # Deepgram uses model names for voices (e.g. aura-asteria-en)
        voice = voice_override or os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en")
        logger.info(f"[TTS] Deepgram -- model={voice}")
        return deepgram.TTS(model=voice)
    if provider == "openai" or os.getenv("OPENAI_API_KEY"):
        voice = voice_override or ws_config.tts_voice or os.getenv("OPENAI_TTS_VOICE", "alloy")
        logger.info(f"[TTS] OpenAI -- voice={voice}, speed={speed}")
        return openai.TTS(
            model=os.getenv("OPENAI_TTS_MODEL", "tts-1"),
            voice=voice,
            speed=speed,
        )
    
    # Fallback to Deepgram
    return deepgram.TTS(model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en"))


# Supported Gemini model catalog with context window metadata
# Listed largest-context first so GEMINI_MODEL env var can override any
_GEMINI_CATALOG: dict[str, str] = {
    # Gemini 2.5 family — up to 2M context
    "gemini-2.5-pro":             "gemini-2.5-pro",
    "gemini-2.5-pro-preview":     "gemini-2.5-pro-preview-06-05",
    "gemini-2.5-flash":           "gemini-2.5-flash",
    "gemini-2.5-flash-preview":   "gemini-2.5-flash-preview-05-20",
    # Gemini 2.0 family — up to 1M context
    "gemini-2.0-flash":           "gemini-2.0-flash",
    "gemini-2.0-flash-exp":       "gemini-2.0-flash-exp",
    # Gemini 1.5 family (stable/GA) — up to 2M context
    "gemini-1.5-pro":             "gemini-1.5-pro",
    "gemini-1.5-pro-latest":      "gemini-1.5-pro-latest",
    "gemini-1.5-flash":           "gemini-1.5-flash",
    "gemini-1.5-flash-latest":    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b":        "gemini-1.5-flash-8b",
}


def _build_llm(ws_config: WorkspaceAgentConfig, provider_override: str = None):
    provider = (provider_override or ws_config.llm_provider or os.getenv("LLM_PROVIDER", "groq")).lower()
    logger.info(f"[LLM] Building LLM — provider={provider}")

    if provider == "openrouter":
        # OpenRouter: routes to Groq-hosted Llama first, falls back to other fast providers
        # Docs: https://openrouter.ai/docs/provider-routing
        or_key   = os.getenv("OPENROUTER_API_KEY")
        or_model = ws_config.llm_model or os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")
        if or_key:
            logger.info(f"[LLM] ✅ OpenRouter — model={or_model}, routing=groq(primary)+fallback")
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
        logger.warning("[LLM] ❌ OpenRouter requested but OPENROUTER_API_KEY not set — falling back")

    if provider == "cerebras":
        cerebras_key = os.getenv("CEREBRAS_API_KEY")
        model = ws_config.llm_model or os.getenv("CEREBRAS_MODEL", "gemma-4-31b")
        if cerebras_key:
            logger.info(f"[LLM] ✅ Cerebras — model={model}, speed=fastest")
            return openai.LLM(
                base_url="https://api.cerebras.ai/v1",
                api_key=cerebras_key,
                model=model,
                temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
            )
        logger.warning("[LLM] ❌ Cerebras requested but CEREBRAS_API_KEY not set — falling back")

    if provider == "groq":
        groq_key = os.getenv("GROQ_API_KEY")
        model = ws_config.llm_model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        if groq_key:
            logger.info(f"[LLM] ✅ Groq — model={model}")
            return openai.LLM(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_key,
                model=model,
                temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
            )
        logger.warning("[LLM] ❌ Groq requested but GROQ_API_KEY not set — falling back")

    if provider in ("google", "gemini"):
        # Accept either GEMINI_API_KEY or GOOGLE_API_KEY
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
            # Use Gemini's OpenAI-compatible endpoint for maximum stability and lower latency
            logger.info(f"[LLM] ✅ Google Gemini — model={gemini_model}")
            llm_instance = openai.LLM(
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=gemini_key,
                model=gemini_model,
                temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
                )
            _patch_gemini_empty_response(llm_instance)
            return llm_instance
        logger.warning("[LLM] ❌ Gemini requested but no API key found — falling back")

    # Last-resort fallback: try OpenRouter first, then direct Groq
    or_key = os.getenv("OPENROUTER_API_KEY")
    if or_key:
        or_model = ws_config.llm_model or os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")
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
    logger.info("[LLM] Groq (last-resort fallback)")
    return openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY"),
        model=ws_config.llm_model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
    )


# ── Gemini Empty-Response Patch ──────────────────────────────────────────────
# Known bug: Gemini intermittently returns streaming responses with finish_reason=STOP
# but empty text content and no function calls. This causes the agent to silently stall.
# Reference: https://github.com/livekit/agents/issues/4066, #4706
# This patch wraps the LLM to detect empty responses.

class _GeminiSafeStream:
    """Wraps an LLMStream, detecting empty Gemini STOP responses."""
    def __init__(self, inner):
        self._inner = inner
        self._has_content = False

    def __aiter__(self):
        return self

    async def __anext__(self):
        chunk = await self._inner.__anext__()
        try:
            if hasattr(chunk, 'choices') and chunk.choices:
                choice = chunk.choices[0]
                delta = getattr(choice, 'delta', None)
                if delta:
                    if getattr(delta, 'content', None):
                        self._has_content = True
                    if getattr(delta, 'tool_calls', None):
                        self._has_content = True
        except StopAsyncIteration:
            raise
        return chunk


class _GeminiSafeContextManager:
    """Async context manager that wraps the original chat() and detects empty responses."""
    def __init__(self, original_ctx_manager):
        self._ctx = original_ctx_manager

    async def __aenter__(self):
        inner = await self._ctx.__aenter__()
        return _GeminiSafeStream(inner)

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return await self._ctx.__aexit__(exc_type, exc_val, exc_tb)


def _patch_gemini_empty_response(llm_instance):
    """Monkey-patch to wrap Gemini's chat() with empty-response detection."""
    original_chat = llm_instance.chat

    def _patched_chat(*args, **kwargs):
        original_ctx = original_chat(*args, **kwargs)
        return _GeminiSafeContextManager(original_ctx)

    llm_instance.chat = _patched_chat


# =============================================================================
# TOOLS
# =============================================================================

class OutboundTools(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, ws_config: WorkspaceAgentConfig, phone_number: str = None, campaign_id: str = ""):
        super().__init__(tools=[])
        self.ctx = ctx
        self.ws_config = ws_config
        self.phone_number = phone_number
        self._campaign_id = campaign_id
        self.agent_session: Optional[AgentSession] = None
        self._unhandled_turns: int = 0  # Safety net: track consecutive unhandled turns

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
                # This works specifically for LiveKit plugins like Sarvam that support update_options
                self.agent_session.tts.update_options(target_language_code=language_code)
                return f"Language successfully changed to {language_code}. Please reply in this new language."
            except Exception as e:
                logger.error(f"[TOOL] Failed to change language: {e}")
                return f"Failed to change language to {language_code}. {e}"
        return f"Language switch to {language_code} recorded, but TTS provider may not natively support hot-swapping."

    @llm.function_tool(description="Look up user details by phone number.")
    async def lookup_user(self, phone: str):
        """Args: phone: phone number to look up."""
        logger.info(f"[TOOL] lookup_user: {phone}")
        return "User found: Shreyas Raj. Status: Premium. Last order: Coffee setup (Delivered)."

    @llm.function_tool(
        description=(
            "Use this tool to save or remember important details provided by the caller during the conversation. "
            "For example: medical history, specific requirements, context, or any other details they want to note down. "
            "This gives you a 'memory' to keep track of information for the remainder of the call."
        )
    )
    async def save_memory(self, memory_text: str):
        """
        Store a note or information in the agent's memory.
        
        Args:
            memory_text: The detailed information to remember.
        """
        if not hasattr(self, "memory_store"):
            self.memory_store = []
        self.memory_store.append(memory_text)
        logger.info(f"[MEMORY] Saved note: {memory_text}")
        return "Memory saved successfully. You can use this information later in the call."

    @llm.function_tool(
        description=(
            "ALWAYS call this tool the moment the customer says anything like "
            "'I want to talk to a person', 'connect me to someone', 'can I speak to a human', "
            "'I don't want to talk to a bot', 'get me a real person', or similar — regardless "
            "of their tone (calm, curious, or angry). Also call when: the customer is "
            "frustrated/upset and de-escalation isn't working; a question falls outside known "
            "offers or specs and needs a specialist; or the customer explicitly asks for a callback. "
            "DO NOT pass a destination unless the customer gives you a specific number. "
            "Leave destination blank to use the default transfer number. "
            "This tool MUST be called — never hang up without invoking it first."
        )
    )
    async def transfer_call(self, destination: Optional[str] = None):
        """Transfer to a human agent. Args: destination: optional override phone number ONLY (leave blank by default)."""
        target = destination or self.ws_config.transfer_number
        if not target:
            return "Error: No default transfer number configured. Please contact support."

        target = re.sub(r'\s+', '', target)
        if "@" not in target:
            if self.ws_config.sip_domain:
                clean = target.replace("tel:", "").replace("sip:", "")
                # Encode the + sign for SIP URI compatibility with Vobiz
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
        
        # Fallback if no SIP participant found
        if not participant_identity:
            for p in self.ctx.room.remote_participants.values():
                participant_identity = p.identity
                break

        if not participant_identity:
            return "Failed to transfer: could not identify the caller."

        async def delayed_transfer():
            await asyncio.sleep(6.0)
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
                await lk_api.aclose()
                logger.info(f"[TOOL] Successfully executed delayed transfer to {target}")
                await asyncio.sleep(1.0)
                try:
                    await self.ctx.room.disconnect()
                except Exception:
                    pass
            except Exception as e:
                logger.error(f"[TOOL] Delayed transfer failed: {e}")
                # Try to speak a fallback message if transfer fails
                if self.agent_session:
                    try:
                        await self.agent_session.say(
                            "Sorry, I wasn't able to connect you right now. Our team will call you back shortly.",
                            allow_interruptions=False
                        )
                    except Exception:
                        pass

        asyncio.create_task(delayed_transfer())
        # Return immediately — agent speaks this line while the transfer fires in background
        return "Sure thing — one moment while I connect you to someone from our team. Please hold!"

    @llm.function_tool(
        description=(
            "Send a real estate project brochure to the lead via email. "
            "Call this when the lead agrees to receive a brochure. "
            "Pass the exact project_name from the brochure catalog and the lead's email address."
        )
    )
    async def send_brochure(self, project_name: str, lead_email: str):
        """
        Send brochure email to the lead.

        Args:
            project_name: The exact project name from the brochure catalog.
            lead_email: The lead's email address to send the brochure to.
        """
        logger.info(f"[TOOL] send_brochure: project={project_name}, email={lead_email}")

        import urllib.request as _req
        import json as _json

        dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000").rstrip("/")
        payload = _json.dumps({
            "workspace_id": self.ws_config.workspace_id,
            "action_name": "send_brochure",
            "parameters": {
                "project_name": project_name,
                "lead_email": lead_email,
                "campaign_id": self._campaign_id,
            }
        }).encode()

        req = _req.Request(
            f"{dashboard_url}/api/tools/execute",
            data=payload,
            headers={
                "Content-Type": "application/json",
                # SECURITY: send shared secret so the gateway accepts this request
                "x-tool-gateway-secret": os.getenv("TOOL_GATEWAY_SECRET", ""),
            },
            method="POST",
        )
        try:
            resp = _req.urlopen(req, timeout=15)
            result = _json.loads(resp.read().decode())
            return result.get("result", "Brochure sent successfully.")
        except Exception as e:
            logger.error(f"[TOOL] send_brochure failed: {e}")
            return "I apologize, there was a small issue sending the email. Our team will follow up with the brochure shortly."

    @llm.function_tool(
        description=(
            "Search the knowledge base for information about products, services, pricing, "
            "features, specifications, availability, or any factual details. Call this when "
            "the customer asks a question that might be answered by the knowledge base. "
            "Returns relevant text snippets from the knowledge base."
        )
    )
    async def search_knowledge_base(self, query: str) -> str:
        """
        Search the knowledge base for relevant information.

        Args:
            query: The search query — use the customer's question or a关键词 version of it.
        """
        logger.info(f"[TOOL] search_knowledge_base: query={query!r}")

        dashboard_url = os.getenv("DASHBOARD_URL", "http://localhost:3000").rstrip("/")

        payload = json.dumps({
            "workspace_id": self.ws_config.workspace_id,
            "action_name": "search_knowledge_base",
            "parameters": {"query": query, "mode": "outbound"},
        }).encode()

        req = urllib.request.Request(
            f"{dashboard_url}/api/tools/execute",
            data=payload,
            headers={
                "Content-Type": "application/json",
                # SECURITY: send shared secret so the gateway accepts this request
                "x-tool-gateway-secret": os.getenv("TOOL_GATEWAY_SECRET", ""),
            },
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            result = json.loads(resp.read().decode()).get("result", "")
            logger.info(f"[TOOL] search_knowledge_base result: {result[:200]!r}")
            return result or "No relevant information found in the knowledge base."
        except Exception as e:
            logger.error(f"[TOOL] search_knowledge_base failed: {e}")
            return "I'm having trouble accessing our knowledge base right now. Let me connect you with our team."

    @llm.function_tool(
        description=(
            "End the current call after completing the conversation. "
            "Use this after you have finished discussing projects, sent brochures, or wrapped up the call. "
            "Say a polite goodbye first, then call this tool to hang up."
        )
    )
    async def end_call(self):
        """End the call gracefully. Say goodbye before calling this tool."""
        logger.info("[TOOL] end_call: Disconnecting room")
        try:
            await asyncio.sleep(2)  # Give TTS time to finish speaking the goodbye
            await self.ctx.room.disconnect()
        except Exception as e:
            logger.error(f"[TOOL] end_call failed: {e}")


# =============================================================================
# AGENT
# =============================================================================

class OutboundAssistant(Agent):
    def __init__(self, ws_config: WorkspaceAgentConfig, tools: list, user_prompt: str = None, tts_language: str = None, is_campaign: bool = False, call_connected_event: asyncio.Event = None, has_dynamic_kb: bool = False):

        logger.info(f"[OUTBOUND-DEBUG] OutboundAssistant init. is_campaign={is_campaign}")
        logger.info(f"[OUTBOUND-DEBUG] user_prompt: {repr(user_prompt)}")
        logger.info(f"[OUTBOUND-DEBUG] base system_prompt: {repr(ws_config.system_prompt)}")
        
        if is_campaign and user_prompt and user_prompt.strip():
            # For campaigns, the campaign prompt completely overrides the base outbound config
            # to prevent persona clashes. But we still need workspace-level resources.
            # IMPORTANT: Knowledge base MUST come FIRST so the LLM prioritizes it.
            instructions = ""
            if ws_config.workspace_resources_text:
                instructions += ws_config.workspace_resources_text
                logger.info(f"[OUTBOUND-DEBUG] Prepended workspace resources ({len(ws_config.workspace_resources_text)} chars)")
            instructions += user_prompt.strip()
            logger.info(f"[OUTBOUND-DEBUG] Selected instructions source: is_campaign override ({len(instructions)} chars)")
        elif user_prompt and user_prompt.strip():
            instructions = (
                f"{ws_config.system_prompt}\n\n"
                f"## Additional Context for This Call:\n{user_prompt.strip()}"
            )
            logger.info(f"[OUTBOUND-DEBUG] Selected instructions source: base config + user_prompt ({len(instructions)} chars)")
        else:
            instructions = ws_config.system_prompt
            logger.info(f"[OUTBOUND-DEBUG] Selected instructions source: base config only ({len(instructions)} chars)")

        logger.info(f"[OUTBOUND-DEBUG] Instructions preview (first 300 chars): {repr(instructions[:300])}")
        # Check if knowledge base is present in final instructions
        if "KNOWLEDGE BASE" in instructions or "Knowledge Base" in instructions:
            kb_idx = instructions.find("KNOWLEDGE BASE")
            if kb_idx == -1:
                kb_idx = instructions.index("Knowledge Base")
            logger.info(f"[OUTBOUND-DEBUG] ✅ Knowledge Base FOUND in instructions at position {kb_idx}, total instructions: {len(instructions)} chars")
            logger.info(f"[OUTBOUND-DEBUG] KB preview: {repr(instructions[kb_idx:kb_idx+200])}")
        else:
            logger.warning(f"[OUTBOUND-DEBUG] ❌ Knowledge Base NOT found in instructions! Total: {len(instructions)} chars")
            
        # ── Telephony voice style prompt (enthusiastic + fast) ──
        instructions += (
            "\n\n## TELEPHONY VOICE RULES (MANDATORY — BE ENTHUSIASTIC & FAST):\n"
            "You are speaking on a live telephone call, NOT writing a chat message.\n"
            "1. EXTREME BREVITY: Your responses MUST be 1 short sentence MAX (under 15 words). "
            "Two sentences only if absolutely necessary. NEVER use bullet points, numbered lists, or markdown.\n"
            "2. FILLERS: Start with natural fillers like 'Haan ji,' 'Bilkul,' 'Achha,' 'Arre wah,' 'Sure.'\n"
            "3. TTS SAFETY: Never write symbols, dates, numbers, or currencies as digits. "
            "Spell them out. Never use asterisks, hashtags, or markdown formatting.\n"
            "4. SPEED: Respond IMMEDIATELY. Short answers beat long explanations.\n"
            "5. SHOW INTEREST: Be genuinely curious about what the customer wants. "
            "Ask follow-up questions. Show excitement when they share preferences.\n"
            "6. ENERGY: Sound enthusiastic and helpful — like you really want to help them find the right car.\n"
        )

        instructions += (
            "7. NATURAL FLOW: Match the caller's energy and language. Be conversational, not robotic.\n"
            "8. NEVER SILENT: If you don't know what to say, ask a question. Never leave dead air.\n"
        )

        instructions += (
            "\n\nCRITICAL MULTILINGUAL INSTRUCTION: You MUST speak in the same language the customer uses. "
            "If the customer speaks Hindi, reply in Hindi. If they speak English, reply in English. "
            "If they mix Hindi and English (Hinglish), reply in Hinglish. Match their language naturally. "
            "IMPORTANT: Do NOT call change_spoken_language for Hindi — the TTS already supports Hindi natively. "
            "Only call change_spoken_language if you need a specific regional language like Tamil, Telugu, etc."
        )
            
        if tts_language and "en" not in tts_language.lower():
            instructions += f"\n\nCRITICAL: Your current target language is '{tts_language}'. You MUST speak entirely in this language code. Do NOT speak English."

        # ── Dynamic RAG search instruction (when KB has embeddings) ──
        if has_dynamic_kb:
            instructions += (
                "\n\nKNOWLEDGE BASE SEARCH — USE PROACTIVELY:\n"
                "You have a `search_knowledge_base` tool. When the customer asks about products, "
                "services, pricing, features, specifications, availability, or any factual detail "
                "that might be in the knowledge base, you MUST call `search_knowledge_base(query)` "
                "with the customer's question. Use the returned information to answer accurately. "
                "Never make up product details — always search first. "
                "Keep your answer short and natural — just the key facts."
            )
            logger.info("[OUTBOUND] Dynamic KB search instruction added to prompt")

        # Only inject the transfer rule if transfer_call is enabled in config
        if ws_config.is_function_enabled("transfer_call"):
            instructions += (
                "\n\nCRITICAL — HUMAN TRANSFER RULE (overrides everything else): "
                "If the customer says ANYTHING like 'I want to talk to a person', 'connect me to someone', "
                "'can I speak to a human', 'I don't want to talk to a bot', or any similar phrasing — "
                "in ANY tone, calm or angry — you MUST immediately call `transfer_call`. "
                "Do NOT ask clarifying questions first. Do NOT offer alternatives first. "
                "Just say 'Sure thing, one moment' and call the tool. "
                "NEVER end the call without either calling `transfer_call` or logging a callback. "
                "Hanging up without transferring is never acceptable."
            )
            
        super().__init__(instructions=instructions, tools=tools)
        self._initial_greeting = ws_config.initial_greeting
        self._call_connected_event = call_connected_event

    async def on_enter(self) -> None:
        """Wait for SIP answer in a background task, then greet to keep scheduler active."""
        async def _greet_when_ready():
            if self._call_connected_event:
                logger.info("[OUTBOUND] on_enter — waiting for SIP answer before greeting...")
                await self._call_connected_event.wait()
            
            logger.info("[OUTBOUND] on_enter — dispatching greeting via turn loop.")
            await self.session.say(self._initial_greeting, allow_interruptions=True)
            
        asyncio.create_task(_greet_when_ready())


# =============================================================================
# ENTRYPOINT
# =============================================================================

async def entrypoint(ctx: agents.JobContext):

    logger.info("=" * 60)
    logger.info("[OUTBOUND] *** NEW OUTBOUND JOB ***")
    logger.info(f"[OUTBOUND] Room: {ctx.room.name} | Job: {ctx.job.id}")
    logger.info("=" * 60)

    await ctx.connect()
    logger.info(f"[OUTBOUND] Connected. Remote participants: {len(ctx.room.remote_participants)}")

    # --- Parse metadata ---
    phone_number = None
    config_dict  = {}

    try:
        if ctx.job.metadata:
            data        = json.loads(ctx.job.metadata)
            phone_number = data.get("phone_number")
            config_dict = data
            logger.info(f"[OUTBOUND] Job metadata -> phone={phone_number!r}")
    except Exception as e:
        logger.error(f"[OUTBOUND] Job metadata parse error: {e}")

    try:
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            if data.get("phone_number"):
                phone_number = data["phone_number"]
            config_dict.update(data)
            logger.info(f"[OUTBOUND] Room metadata -> phone={phone_number!r}")
    except Exception as e:
        logger.error(f"[OUTBOUND] Room metadata parse error: {e}")

    workspace_id = config_dict.get("business_id") or config_dict.get("workspace_id")
    ws_config = await load_workspace_config(workspace_id, mode="outbound")

    # ── Apply live per-call overrides from UI metadata ──────────────────────────
    # These fields are set by the dashboard (CallDispatcher / BulkDialer) on every
    # call so the agent always reflects what the user last configured in the UI —
    # no need to restart the agent or save to agent_config.json.
    meta_system_prompt    = config_dict.get("system_prompt", "").strip()
    meta_llm_model        = config_dict.get("llm_model", "").strip()
    meta_llm_temperature  = config_dict.get("llm_temperature")
    meta_initial_greeting = config_dict.get("initial_greeting", "").strip()
    meta_fallback_greeting = config_dict.get("fallback_greeting", "").strip()

    if meta_system_prompt:
        ws_config.system_prompt = meta_system_prompt
        # Re-append workspace resources that were baked into the original system_prompt
        if ws_config.workspace_resources_text:
            ws_config.system_prompt += ws_config.workspace_resources_text
            logger.info(f"[OUTBOUND] Re-appended workspace resources ({len(ws_config.workspace_resources_text)} chars) after metadata override")
        logger.info(f"[OUTBOUND] Config override: system_prompt from metadata ({len(meta_system_prompt)} chars)")
    if meta_llm_model:
        ws_config.llm_model = meta_llm_model
        logger.info(f"[OUTBOUND] Config override: llm_model={meta_llm_model!r}")
    if meta_llm_temperature is not None:
        try:
            ws_config.llm_temperature = float(meta_llm_temperature)
            logger.info(f"[OUTBOUND] Config override: llm_temperature={ws_config.llm_temperature}")
        except (TypeError, ValueError):
            pass
    if meta_initial_greeting:
        ws_config.initial_greeting = meta_initial_greeting
        logger.info(f"[OUTBOUND] Config override: initial_greeting from metadata")
    if meta_fallback_greeting:
        ws_config.fallback_greeting = meta_fallback_greeting

    # --- Campaign / lead enrichment fields (set by BulkDialer and Workflow engine) ---
    lead_name       = config_dict.get("lead_name", "")
    lead_email      = config_dict.get("lead_email", "")
    lead_data       = config_dict.get("lead_data", {})   # extra spreadsheet columns
    rag_content     = config_dict.get("rag_content", "") # extracted text from uploaded RAG file
    campaign_id     = config_dict.get("campaign_id", "")
    lead_row_index  = config_dict.get("lead_row_index", -1)
    workflow_run_id = config_dict.get("workflow_run_id", "")
    override_system_prompt = config_dict.get("override_system_prompt", False)
    metadata_greeting = config_dict.get("initial_greeting", "")
    metadata_agent_name = config_dict.get("agent_name", "")

    # ── DETAILED RAG CONTENT LOGGING ────────────────────────────────────────
    logger.info(f"[OUTBOUND-RAG] raw rag_content type={type(rag_content).__name__}, len={len(str(rag_content))}")
    if rag_content:
        logger.info(f"[OUTBOUND-RAG] rag_content PREVIEW (first 300): {repr(rag_content[:300])}")
    else:
        logger.warning(f"[OUTBOUND-RAG] ❌ rag_content is EMPTY or missing from metadata!")
        logger.warning(f"[OUTBOUND-RAG] All metadata keys: {list(config_dict.keys())}")

    is_campaign_call = bool(campaign_id or workflow_run_id or override_system_prompt)

    # Override ws_config fields if provided dynamically via manual dialer or bulk dialer
    if metadata_greeting and metadata_greeting.strip():
        ws_config.initial_greeting = metadata_greeting.strip()
        logger.info(f"[OUTBOUND] Overriding initial greeting: {ws_config.initial_greeting!r}")
    
    if not ws_config.initial_greeting:
        ws_config.initial_greeting = "Hello?"
        logger.info("[OUTBOUND] No initial greeting set, defaulting to 'Hello?'")

    # Inject RAG content and lead context
    user_prompt = config_dict.get("user_prompt", "")

    logger.info(f"[OUTBOUND] is_campaign={is_campaign_call}, override_prompt={override_system_prompt}, campaign_id={campaign_id!r}")
    logger.info(f"[OUTBOUND] ws_config.system_prompt AFTER override ({len(ws_config.system_prompt)} chars): {repr(ws_config.system_prompt[:200])}")
    logger.info(f"[OUTBOUND] user_prompt from metadata ({len(user_prompt)} chars): {repr(user_prompt[:200])}")
    
    rag_block = ""
    if rag_content and rag_content.strip():
        rag_block = (
            "\n\n══════════════════════════════════════════════════════════\n"
            "CRITICAL — KNOWLEDGE BASE (YOU MUST USE THIS INFORMATION):\n"
            "══════════════════════════════════════════════════════════\n"
            "The following is your knowledge base. When the customer asks ANY question\n"
            "about products, prices, features, specifications, availability, or details,\n"
            "you MUST answer ONLY from this knowledge base. Do NOT make up information.\n"
            "If the answer is in the knowledge base, use it. If not, say you'll check.\n"
            "══════════════════════════════════════════════════════════\n\n"
            + rag_content.strip()
        )
        logger.info(f"[OUTBOUND-RAG] ✅ RAG block built ({len(rag_block)} chars)")
        logger.info(f"[OUTBOUND-RAG] rag_block PREVIEW: {repr(rag_block[:200])}")
    else:
        logger.warning(f"[OUTBOUND-RAG] ❌ rag_content is empty/whitespace — no RAG block built!")

    if is_campaign_call:
        # For campaigns, we override the base system prompt entirely.
        # IMPORTANT: RAG must come BEFORE the campaign prompt so LLM prioritizes it.
        if rag_block:
            user_prompt = rag_block + "\n\n" + user_prompt
            logger.info(f"[OUTBOUND-RAG] ✅ RAG prepended to user_prompt for campaign call ({len(user_prompt)} chars)")
        else:
            logger.warning(f"[OUTBOUND-RAG] ❌ No RAG block to prepend for campaign call!")
    else:
        # For manual 1-off calls, RAG appends to the base system prompt.
        if rag_block:
            ws_config.system_prompt += rag_block
            logger.info(f"[OUTBOUND-RAG] ✅ RAG appended to ws_config.system_prompt for manual call")

    # Build a lead-context string to prepend to the user_prompt
    if lead_name or lead_data:
        lead_context_parts = []
        if lead_name:
            lead_context_parts.append(f"You are calling {lead_name}.")
        if lead_data and isinstance(lead_data, dict):
            extras = ", ".join(f"{k}: {v}" for k, v in lead_data.items() if v)
            if extras:
                lead_context_parts.append(f"Their details — {extras}.")
        lead_context = " ".join(lead_context_parts)
        user_prompt = f"{lead_context}\n\n{user_prompt}".strip()
        logger.info(f"[OUTBOUND] Lead context injected: {lead_context!r}")

    # --- Build plugins ---
    fnc_ctx   = OutboundTools(ctx, ws_config, phone_number, campaign_id=campaign_id)
    built_tts = _build_tts(
        ws_config,
        config_dict.get("tts_provider"),
        config_dict.get("voice_id"),
        config_dict.get("tts_language"),
        float(config_dict.get("tts_speed", 1.0))
    )
    built_llm = _build_llm(ws_config, config_dict.get("model_provider"))

    is_auto = (ws_config.stt_language == "auto")
    # Use Deepgram's 'hi' model which natively supports excellent Hinglish (fluent English + Hindi).
    # This prevents auto-detection delays and false-interruption bugs when switching languages.
    stt_lang = "hi" if is_auto or "en" in ws_config.stt_language else ws_config.stt_language

    # Resolve STT model — prefer nova-3 (faster streaming, lower latency than nova-2)
    stt_model = ws_config.stt_model if ws_config.stt_model != "nova-2" else "nova-3"

    session = AgentSession(
        vad=_VAD,
        stt=deepgram.STT(
            model=stt_model,
            language=stt_lang,
            interim_results=True,   # Stream partial transcripts word-by-word as user speaks
            smart_format=True,
        ),
        llm=built_llm,
        tts=built_tts,
        turn_handling=TurnHandlingOptions(
            turn_detection="vad",
            endpointing={
                "min_delay": 0.25,       # 250ms — very fast response
                "max_delay": 1.2,        # 1.2s — quick turn close
                "silence_duration_ms": 300,
            },
            interruption={
                "mode": "adaptive",      # Clear TTS buffer on user barge-in
                "min_words": 2,          # Only interrupt if user says 2+ words
            },
        ),
    )

    # Link session to tools for dynamic language switching
    fnc_ctx.agent_session = session

    call_connected_event = asyncio.Event()

    # Filter out disabled custom functions (e.g. transfer_call)
    transfer_enabled = ws_config.is_function_enabled("transfer_call")
    logger.info(f"[OUTBOUND] transfer_call enabled={transfer_enabled}")
    available_tools = [
        tool for name, tool in fnc_ctx.function_tools.items()
        if transfer_enabled or name != "transfer_call"
    ]

    agent_instance = OutboundAssistant(
        ws_config=ws_config,
        tools=available_tools,
        user_prompt=user_prompt,
        tts_language=config_dict.get("tts_language"),
        is_campaign=is_campaign_call,
        call_connected_event=call_connected_event,
        has_dynamic_kb=config_dict.get("has_dynamic_rag", False)
    )

    # Accumulate transcripts reliably since livekit-agents v0.8+ session history structure varies
    call_transcript_messages = []

    # ── Analytics: write campaign result when call ends so Live Results table populates ──
    @ctx.room.on("disconnected")
    def on_disconnected(*args, **kwargs):
        logger.info("[OUTBOUND] Call disconnected. Running analytics...")
        import analytics
        
        # In modern livekit-agents, session manages history. For maximum reliability, 
        # we pass the real-time transcript accumulated via session events if available.
        # Fallback to session.chat_ctx or session.history if the list is empty.
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
                phone_number=phone_number or "unknown",
                direction="outbound",
                chat_messages=msgs,
                campaign_id=campaign_id,
                lead_row_index=lead_row_index,
                lead_email=lead_email,
                workflow_run_id=workflow_run_id,
                room_name=ctx.room.name,
            )
        )
    
    # Capitalize the voice ID so it displays nicely (e.g. "Ishita" instead of "ishita")
    raw_voice_id = config_dict.get("voice_id", "")
    final_agent_name = metadata_agent_name.strip() if metadata_agent_name.strip() else (raw_voice_id.capitalize() if raw_voice_id else "AI Agent")
    if hasattr(ctx.room.local_participant, "update_name"):
        await ctx.room.local_participant.update_name(final_agent_name)



    # Note: RoomInputOptions removed to prevent deprecation warnings and access violation bugs with Rust core
    await session.start(agent_instance, room=ctx.room)
    logger.info("[OUTBOUND] Session started.")

    # --- Dial or greet ---
    remote_participants = list(ctx.room.remote_participants.values())
    logger.info(f"[OUTBOUND] Remote participants: {len(remote_participants)}")

    should_dial        = False
    user_already_here  = False

    if phone_number:
        for p in remote_participants:
            # Match with or without + prefix in identity
            clean = phone_number.lstrip('+')
            if f"sip_{phone_number}" in p.identity or f"sip_{clean}" in p.identity or "sip_" in p.identity:
                user_already_here = True
                logger.info(f"[OUTBOUND] SIP participant already in room: {p.identity!r}")
                break
        should_dial = not user_already_here
    else:
        logger.warning("[OUTBOUND] No phone_number. Skipping dial-out.")

    if should_dial:
        e164_number = _normalize_phone(phone_number)
        # Strip '+' from identity — WebRTC layer can't parse '+' as integer
        safe_identity = f"sip_{e164_number.lstrip('+')}"
        logger.info(f"[OUTBOUND] Dialling {e164_number} (raw={phone_number}) via trunk {ws_config.outbound_trunk_id}...")
        try:
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=ws_config.outbound_trunk_id,
                    sip_call_to=e164_number,
                    participant_identity=safe_identity,
                    wait_until_answered=True,
                )
            )
            logger.info("[OUTBOUND] Call answered. Triggering greeting...")
            # Quick pause for WebRTC stream to stabilise after SIP answer
            await asyncio.sleep(0.3)
            call_connected_event.set()

            # ── Write "Connected" status so the dashboard shows real-time progress ──
            if campaign_id:
                try:
                    analytics_result = {
                        "row_index":    lead_row_index,
                        "phone_number": phone_number or "unknown",
                        "lead_email":   lead_email,
                        "status":       "Connected",
                        "remarks":      "Call connected",
                        "sentiment":    "",
                        "intent":       "",
                        "timestamp":    datetime.datetime.now().isoformat(),
                    }
                    campaign_file = os.path.join("data", f"campaign_{campaign_id}.json")
                    existing = []
                    if os.path.exists(campaign_file):
                        try:
                            with open(campaign_file, "r", encoding="utf-8") as f:
                                existing = json.load(f)
                        except Exception:
                            pass
                    existing.append(analytics_result)
                    with open(campaign_file, "w", encoding="utf-8") as f:
                        json.dump(existing, f, indent=2)
                    logger.info(f"[OUTBOUND] Campaign 'Connected' status written (row {lead_row_index})")
                except Exception:
                    pass

        except Exception as e:
            logger.error(f"[OUTBOUND] Dial failed: {e}")
            import traceback; logger.error(traceback.format_exc())

            # ── Graceful failure: write campaign result instead of crashing ──
            # When the trunk is busy (486) or any dial error occurs, write a
            # "No Answer" result so the bulk dialer report is accurate, then
            # clean up instead of crashing the entire agent process.
            if campaign_id:
                try:
                    import analytics
                    analytics_result = {
                        "row_index":    lead_row_index,
                        "phone_number": phone_number or "unknown",
                        "lead_email":   lead_email,
                        "status":       "No Answer",
                        "remarks":      f"Dial failed: {e}",
                        "sentiment":    "",
                        "intent":       "",
                        "timestamp":    datetime.datetime.now().isoformat(),
                    }
                    campaign_file = os.path.join("data", f"campaign_{campaign_id}.json")
                    existing = []
                    if os.path.exists(campaign_file):
                        try:
                            with open(campaign_file, "r", encoding="utf-8") as f:
                                existing = json.load(f)
                        except Exception:
                            pass
                    existing.append(analytics_result)
                    with open(campaign_file, "w", encoding="utf-8") as f:
                        json.dump(existing, f, indent=2)
                    logger.info(f"[OUTBOUND] Campaign failure result written (row {lead_row_index})")
                except Exception as write_err:
                    logger.error(f"[OUTBOUND] Failed to write campaign failure result: {write_err}")

            # Disconnect cleanly — don't call ctx.shutdown() which kills the
            # entire worker process and all other concurrent call sessions.
            try:
                await ctx.room.disconnect()
            except Exception:
                pass
            return
    else:
        logger.info("[OUTBOUND] No dial needed (SIP already present or fallback). Triggering greeting instantly...")
        call_connected_event.set()

    # ── Real-time transcript logging ─────────────────────────────────────────
    # These session events fire AFTER each turn completes so we always get
    # the final, committed text (not interim STT results).
    @session.on("user_input_transcribed")
    def _on_user_transcript(event):
        text = getattr(event, 'transcript', None) or getattr(event, 'text', None) or str(event)
        is_final = getattr(event, 'is_final', True)
        if is_final and text:
            logger.info(f"[TRANSCRIPT] ▶ USER : {text.strip()}")
            call_transcript_messages.append({"role": "user", "content": text.strip()})

    @session.on("agent_state_changed")
    def _on_agent_state(event):
        state = getattr(event, 'new_state', None) or getattr(event, 'state', str(event))
        logger.info(f"[OUTBOUND] Agent state → {state}")

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
            # user messages are handled by user_input_transcribed for better accuracy
            # but in case it's missed or synthesized, we can optionally capture here
            pass
        elif role in ('assistant', 'agent'):
            logger.info(f"[TRANSCRIPT] ◀ AGENT: {text.strip()}")
            call_transcript_messages.append({"role": "assistant", "content": text.strip()})

if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="outbound-caller",   # Must match LiveKit outbound dispatch rule
        )
    )
