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

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(env_path)

# ── Logging setup: console + rotating daily file ──────────────────────────────
os.makedirs("logs", exist_ok=True)
_log_fmt = logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# Console handler
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_log_fmt)
_console_handler.setLevel(logging.DEBUG)

# Rotating daily file — keeps 14 days of logs
_file_handler = logging.handlers.TimedRotatingFileHandler(
    filename=os.path.join("logs", "inbound.log"),
    when="midnight",
    interval=1,
    backupCount=14,
    encoding="utf-8",
)
_file_handler.setFormatter(_log_fmt)
_file_handler.setLevel(logging.DEBUG)
_file_handler.suffix = "%Y%m%d"  # e.g. inbound.log.20260623

# Root logger
logging.root.setLevel(logging.DEBUG)
logging.root.handlers = []  # clear basicConfig defaults
logging.root.addHandler(_console_handler)
logging.root.addHandler(_file_handler)

logging.getLogger("aiohttp").setLevel(logging.WARNING)
logging.getLogger("livekit").setLevel(logging.INFO)
logging.getLogger("livekit.rust").setLevel(logging.ERROR)  # suppress Rust panic spam
logger = logging.getLogger("inbound-agent")

# Import the dynamic workspace config loader
from workspace_config_loader import load_workspace_config, WorkspaceAgentConfig

logger.info("[INBOUND] Agent initialized")

# Pre-load VAD model at startup (avoids cold-load delay on first call)
# Tuned for telephony: fast onset detection + balanced silence window
_VAD = silero.VAD.load(
    min_silence_duration=0.40,    # 400ms — faster than 550ms, still natural
    activation_threshold=0.40,    # Balanced threshold
    min_speech_duration=0.20,     # 200ms — quick detection
    sample_rate=16000,
)


# =============================================================================
# HELPERS
# =============================================================================

def _build_tts(ws_config: WorkspaceAgentConfig, provider_override: str = None, voice_override: str = None, language_override: str = None):
    provider = (provider_override or os.getenv("TTS_PROVIDER", ws_config.tts_provider)).lower()

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
            voice=os.getenv("CARTESIA_TTS_VOICE", "248be419-c632-4f23-adf1-5324ed7dbf1d"),
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
        return deepgram.TTS(model=os.getenv("DEEPGRAM_TTS_MODEL", "aura-asteria-en"))

    if os.getenv("OPENAI_API_KEY"):
        return openai.TTS(
            model=os.getenv("OPENAI_TTS_MODEL", "tts-1"),
            voice=voice_override or os.getenv("OPENAI_TTS_VOICE", ws_config.tts_voice),
        )
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
    provider = (provider_override or os.getenv("LLM_PROVIDER", ws_config.llm_provider)).lower()

    if provider == "groq":
        model = os.getenv("GROQ_MODEL", ws_config.llm_model)
        logger.info(f"[LLM] Groq — model={model}")
        return openai.LLM(
            base_url="https://api.groq.com/openai/v1",
            api_key=os.getenv("GROQ_API_KEY"),
            model=model,
            temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
        )

    if provider in ("google", "gemini"):
        # Accept either GEMINI_API_KEY or GOOGLE_API_KEY
        gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        env_model    = os.getenv("GEMINI_MODEL", "").strip()
        config_model = ws_config.llm_model.strip().lower()
        gemini_model = (
            env_model
            or _GEMINI_CATALOG.get(config_model)
            or (ws_config.llm_model if "gemini" in config_model else None)
            or "gemini-2.5-flash-latest"
        )
        if gemini_key:
            # Use Gemini's OpenAI-compatible endpoint for maximum stability and lower latency
            logger.info(f"[LLM] Google Gemini (OpenAI endpoint) — model={gemini_model}")
            llm_instance = openai.LLM(
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=gemini_key,
                model=gemini_model,
                temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
                )
            _patch_gemini_empty_response(llm_instance)
            return llm_instance
        logger.warning("[LLM] Google requested but no API key found — falling back to Groq")

    if provider == "openai":
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            model = os.getenv("OPENAI_MODEL", ws_config.llm_model)
            logger.info(f"[LLM] OpenAI — model={model}")
            return openai.LLM(
                api_key=openai_key,
                model=model,
                )
        logger.warning("[LLM] OpenAI requested but OPENAI_API_KEY not set — falling back to Groq")

    # Last-resort fallback: Groq
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    logger.info(f"[LLM] Groq (last-resort fallback) — model={model}")
    return openai.LLM(
        base_url="https://api.groq.com/openai/v1",
        api_key=os.getenv("GROQ_API_KEY"),
        model=model,
        temperature=float(os.getenv("GROQ_TEMPERATURE", str(ws_config.llm_temperature))),
    )


# ── Gemini Empty-Response Patch ──────────────────────────────────────────────
# Known bug: Gemini intermittently returns streaming responses with finish_reason=STOP
# but empty text content and no function calls. This causes the agent to silently stall.
# Reference: https://github.com/livekit/agents/issues/4066, #4706

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

class InboundTools(llm.ToolContext):
    def __init__(self, ctx: agents.JobContext, ws_config: WorkspaceAgentConfig):
        super().__init__(tools=[])
        self.ctx       = ctx
        self.ws_config = ws_config
        self.lead_info = {}
        self.agent_session: Optional[AgentSession] = None

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

    @llm.function_tool(
        description=(
            "Save the caller's contact information as soon as you have their name and phone number. "
            "DO NOT wait for city — call this immediately once you have name + phone. "
            "City is optional and defaults to Delhi. "
            "This is just contact capture — it does NOT mean the lead is qualified."
        )
    )
    def save_lead_info(self, name: str, phone: str, city: str = "Delhi", email: str = ""):
        """
        Store caller lead details and confirm collection.

        Args:
            name:  Caller's full name
            phone: Caller's phone number
            city:  Caller's city or location (optional, defaults to Delhi)
            email: Caller's email address (optional — capture if they offer it)
        """
        self.lead_info = {"name": name, "phone": phone, "city": city, "email": email}
        logger.info(f"[LEAD] 📋 Contact captured → name={name!r}, phone={phone!r}, city={city!r}, email={email!r}")

        # Write to CSV (contact info only, not yet qualified)
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
            "Mark this lead as QUALIFIED and successful. Call this ONLY when the caller "
            "expresses a clear, specific buying intent — such as: requesting a test drive, "
            "asking for a home/doorstep demo, wanting to visit the showroom, asking to book "
            "an appointment, requesting a personalised quote with intent to purchase, or "
            "saying they want to buy. DO NOT call this just because they gave their contact info "
            "or asked general questions about the car."
        )
    )
    def mark_lead_qualified(self, intent: str):
        """
        Mark the lead as qualified based on expressed buying intent.

        Args:
            intent: What specific action the caller requested (e.g. 'test drive booking',
                    'home demo request', 'showroom visit', 'price quote for purchase')
        """
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
        """Transfer inbound caller to a live human. Args: destination: optional override phone number ONLY (leave blank by default)."""
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
        # Return immediately — agent speaks this while transfer fires in background
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
        """
        Generic extensible tool gateway. Routes real-time integration actions
        to the Next.js API gateway (TOOL_GATEWAY_URL) during an active call.

        Args:
            action_name:      The action to execute (e.g. 'book_appointment', 'check_availability').
            parameters_json:  JSON string of parameters for the action.
        """
        gateway_url = os.getenv("TOOL_GATEWAY_URL", "http://localhost:3000/api/tools/execute")
        workspace_id = self.ws_config.workspace_id or "default"

        logger.info(f"[TOOL] query_workspace_integration → action={action_name!r}, workspace={workspace_id!r}")

        # Parse parameters_json safely
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
                timeout=15.0,  # increased: token refresh + freeBusy + create can take 10s
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


def _do_http(req: urllib.request.Request, timeout: float = 5.0) -> str:
    """Blocking HTTP call — run in executor so it doesn't block the event loop."""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {body}")


# =============================================================================
# AGENT
# =============================================================================

class InboundAssistant(Agent):
    def __init__(self, ws_config: WorkspaceAgentConfig, tools: list, user_prompt: str = None, tts_language: str = None, rag_block: str = ""):
        # Build instructions with KB-FIRST ordering so LLM prioritizes knowledge base
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
            
        # ── Telephony voice style prompt (latency optimization) ──
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

        instructions += (
            "\n\nCRITICAL MULTILINGUAL INSTRUCTION: Your Text-to-Speech engine is strict. "
            "If the user speaks Hindi or any language other than English, you MUST call the `change_spoken_language` tool "
            "with the correct language code (e.g. 'hi-IN') BEFORE you reply in that language! "
            "If you generate Hindi text without calling the tool first, the audio engine will crash and the call will drop. "
            "IMPORTANT TO REDUCE DELAYS: ONLY call this tool if you actually need to switch languages. If you are already speaking Hindi, DO NOT call the tool again, just reply immediately!"
        )
        if tts_language and "en" not in tts_language.lower():
            instructions += f"\n\nCRITICAL: Your current target language is '{tts_language}'. You MUST speak entirely in this language code. Do NOT speak English."

        # Only inject the transfer rule if transfer_to_sales is enabled in config
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
        """Called by the LiveKit AgentSession when this agent becomes active.

        Sending the greeting here (inside the agent lifecycle) is critical:
        the turn scheduler stays active after say() returns, so the agent
        will automatically generate LLM replies to every subsequent user turn.
        Using session.say() in the entrypoint() function instead breaks this
        because it runs OUTSIDE the turn loop.
        """
        logger.info("[INBOUND] on_enter — dispatching welcome greeting via turn loop.")
        await self.session.say(self._initial_greeting, allow_interruptions=True)


# =============================================================================
# ENTRYPOINT
# =============================================================================

async def entrypoint(ctx: agents.JobContext):

    logger.info("=" * 60)
    logger.info("[INBOUND] *** NEW INBOUND CALL ***")
    logger.info(f"[INBOUND] Room: {ctx.room.name} | Job: {ctx.job.id}")
    logger.info("=" * 60)

    await ctx.connect()
    logger.info(f"[INBOUND] Connected. Remote participants: {len(ctx.room.remote_participants)}")

    # Log metadata (informational only — inbound doesn't need phone from metadata)
    config_dict = {}
    workspace_id = None
    try:
        if ctx.job.metadata:
            data = json.loads(ctx.job.metadata)
            config_dict.update(data)
            logger.info(f"[INBOUND] Job metadata: {data!r}")
        if ctx.room.metadata:
            data = json.loads(ctx.room.metadata)
            config_dict.update(data)
            logger.info(f"[INBOUND] Room metadata: {data!r}")
    except Exception as e:
        logger.error(f"[INBOUND] Metadata parse error: {e}")

    # The trunk identity typically contains the SIP trunk info
    workspace_id = config_dict.get("business_id") or config_dict.get("workspace_id")
    ws_config = await load_workspace_config(workspace_id, mode="inbound")

    # ── Apply live per-call overrides from UI metadata ──────────────────────────
    # These fields are set by the dashboard on every call so the agent always
    # reflects what the user last configured in the UI — no restart needed.
    meta_system_prompt     = config_dict.get("system_prompt", "").strip()
    meta_llm_model         = config_dict.get("llm_model", "").strip()
    meta_llm_temperature   = config_dict.get("llm_temperature")
    meta_initial_greeting  = config_dict.get("initial_greeting", "").strip()
    meta_fallback_greeting = config_dict.get("fallback_greeting", "").strip()

    if meta_system_prompt:
        ws_config.system_prompt = meta_system_prompt
        # Re-append workspace resources that were baked into the original system_prompt
        if ws_config.workspace_resources_text:
            ws_config.system_prompt += ws_config.workspace_resources_text
            logger.info(f"[INBOUND] Re-appended workspace resources ({len(ws_config.workspace_resources_text)} chars) after metadata override")
        logger.info(f"[INBOUND] Config override: system_prompt from metadata ({len(meta_system_prompt)} chars)")
    if meta_llm_model:
        ws_config.llm_model = meta_llm_model
        logger.info(f"[INBOUND] Config override: llm_model={meta_llm_model!r}")
    if meta_llm_temperature is not None:
        try:
            ws_config.llm_temperature = float(meta_llm_temperature)
            logger.info(f"[INBOUND] Config override: llm_temperature={ws_config.llm_temperature}")
        except (TypeError, ValueError):
            pass
    if meta_initial_greeting:
        ws_config.initial_greeting = meta_initial_greeting
        logger.info(f"[INBOUND] Config override: initial_greeting from metadata")
    if meta_fallback_greeting:
        ws_config.fallback_greeting = meta_fallback_greeting

    # --- Build plugins ---
    fnc_ctx   = InboundTools(ctx, ws_config)
    built_tts = _build_tts(
        ws_config,
        config_dict.get("tts_provider"),
        config_dict.get("voice_id"),
        config_dict.get("tts_language")
    )
    built_llm = _build_llm(ws_config, config_dict.get("model_provider"))

    is_auto = (ws_config.stt_language == "auto")
    # Use Deepgram's 'hi' model which natively supports excellent Hinglish (fluent English + Hindi).
    # This prevents auto-detection delays and false-interruption bugs when switching languages.
    stt_lang = "hi" if is_auto or "en" in ws_config.stt_language else ws_config.stt_language

    # Resolve STT model — prefer nova-3 (faster streaming, lower latency than nova-2)
    stt_model = ws_config.stt_model if ws_config.stt_model != "nova-2" else "nova-3"

    session = AgentSession(
        vad=_VAD,  # reuse pre-loaded model — no disk I/O on call start
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
                "min_delay": 0.35,       # 350ms — faster response
                "max_delay": 1.5,        # 1.5s — not too slow
                "silence_duration_ms": 400,
            },
            interruption={
                "mode": "adaptive",      # Clear TTS buffer on user barge-in
                "min_words": 2,          # Only interrupt if user says 2+ words
            },
        ),
    )
    
    # Link session to tools for dynamic language switching
    fnc_ctx.agent_session = session

    user_prompt = config_dict.get("user_prompt", "")
    rag_content = config_dict.get("rag_content", "")

    # Build RAG block with strong KB-first formatting
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

    # Filter out disabled custom functions (e.g. transfer_to_sales)
    transfer_enabled = ws_config.is_function_enabled("transfer_to_sales")
    logger.info(f"[INBOUND] transfer_to_sales enabled={transfer_enabled}")
    available_tools = [
        tool for name, tool in fnc_ctx.function_tools.items()
        if transfer_enabled or name != "transfer_to_sales"
    ]

    agent_instance = InboundAssistant(
        ws_config=ws_config,
        tools=available_tools,
        user_prompt=user_prompt,
        tts_language=config_dict.get("tts_language"),
        rag_block=rag_block
    )

    call_transcript_messages = []

    @ctx.room.on("disconnected")
    def on_disconnected(*args, **kwargs):
        logger.info("[INBOUND] Call disconnected. Running analytics...")
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
                phone_number="inbound_caller",
                direction="inbound",
                chat_messages=msgs
            )
        )

    # Note: RoomInputOptions removed to prevent deprecation warnings and access violation bugs with Rust core
    await session.start(agent_instance, room=ctx.room)
    logger.info("[INBOUND] Session started — greeting will be dispatched via on_enter().")

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
        logger.info(f"[INBOUND] Agent state → {state}")

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

    # Stamp workspace_id into room metadata so the super-admin panel can resolve the workspace name
    if workspace_id:
        try:
            import json as _json
            existing_meta = {}
            try:
                existing_meta = _json.loads(ctx.room.metadata) if ctx.room.metadata else {}
            except Exception:
                pass
            if not existing_meta.get("workspace_id") and not existing_meta.get("business_id"):
                existing_meta["workspace_id"] = workspace_id
                await ctx.api.room.update_room_metadata(
                    ctx.room.name,
                    _json.dumps(existing_meta),
                )
                logger.info(f"[INBOUND] Room metadata stamped with workspace_id={workspace_id}")
        except Exception as e:
            logger.warning(f"[INBOUND] Could not stamp room metadata: {e}")


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="inbound-caller",   # Must match LiveKit inbound dispatch rule
            port=8082,                     # Use 8082 to avoid collision with outbound agent (8081)
        )
    )

