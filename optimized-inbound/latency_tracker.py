"""
latency_tracker.py
──────────────────
Per-leg latency instrumentation for the voice pipeline.

Measures: STT processing, LLM TTFT, LLM generation, TTS first-chunk, TTS synthesis.
Logs breakdown per call and per turn. Stores in structured format for dashboard consumption.
"""

import time
import logging
import json
from dataclasses import dataclass, field, asdict
from typing import Optional
from contextlib import asynccontextmanager

logger = logging.getLogger("latency-tracker")


@dataclass
class TurnLatency:
    """Latency breakdown for a single user turn."""
    turn_number: int = 0

    # Timestamps (perf_counter seconds)
    audio_end: float = 0.0           # When user stopped speaking (VAD fire)
    stt_start: float = 0.0           # When STT processing begins
    stt_final: float = 0.0           # When final transcript received
    llm_start: float = 0.0           # When LLM request sent
    llm_first_token: float = 0.0     # When first LLM token arrives
    llm_end: float = 0.0             # When LLM finishes generating
    tts_start: float = 0.0           # When TTS synthesis begins
    tts_first_chunk: float = 0.0     # When first TTS audio chunk is ready
    tts_end: float = 0.0             # When TTS finishes

    # Computed deltas (ms)
    stt_latency_ms: float = 0.0      # audio_end → stt_final
    llm_ttft_ms: float = 0.0         # stt_final → llm_first_token (or llm_start → llm_first_token)
    llm_gen_ms: float = 0.0          # llm_first_token → llm_end
    tts_first_ms: float = 0.0        # llm_end → tts_first_chunk (or llm_first_token → tts_first_chunk)
    tts_total_ms: float = 0.0        # tts_start → tts_end
    e2e_response_ms: float = 0.0     # audio_end → tts_first_chunk (perceived latency)

    def compute(self):
        """Compute deltas from timestamps."""
        if self.stt_final and self.audio_end:
            self.stt_latency_ms = (self.stt_final - self.audio_end) * 1000
        if self.llm_first_token and self.llm_start:
            self.llm_ttft_ms = (self.llm_first_token - self.llm_start) * 1000
        if self.llm_end and self.llm_first_token:
            self.llm_gen_ms = (self.llm_end - self.llm_first_token) * 1000
        if self.tts_first_chunk and self.llm_first_token:
            self.tts_first_ms = (self.tts_first_chunk - self.llm_first_token) * 1000
        if self.tts_end and self.tts_start:
            self.tts_total_ms = (self.tts_end - self.tts_start) * 1000
        if self.tts_first_chunk and self.audio_end:
            self.e2e_response_ms = (self.tts_first_chunk - self.audio_end) * 1000

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CallLatency:
    """Full latency profile for one call."""
    call_id: str = ""
    workspace_id: str = ""
    turns: list = field(default_factory=list)
    call_start: float = 0.0
    call_end: float = 0.0

    # Aggregated stats
    avg_e2e_ms: float = 0.0
    avg_ttft_ms: float = 0.0
    p95_e2e_ms: float = 0.0
    max_e2e_ms: float = 0.0
    total_turns: int = 0

    def compute_stats(self):
        """Compute aggregate stats from turns."""
        if not self.turns:
            return
        e2e = [t.e2e_response_ms for t in self.turns if t.e2e_response_ms > 0]
        ttft = [t.llm_ttft_ms for t in self.turns if t.llm_ttft_ms > 0]
        if e2e:
            self.avg_e2e_ms = sum(e2e) / len(e2e)
            self.max_e2e_ms = max(e2e)
            sorted_e2e = sorted(e2e)
            p95_idx = int(len(sorted_e2e) * 0.95)
            self.p95_e2e_ms = sorted_e2e[min(p95_idx, len(sorted_e2e) - 1)]
        if ttft:
            self.avg_ttft_ms = sum(ttft) / len(ttft)
        self.total_turns = len(self.turns)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["turns"] = [t.to_dict() for t in self.turns]
        return d

    def log_summary(self):
        """Log a human-readable latency summary."""
        self.compute_stats()
        logger.info(
            f"[LATENCY] 📊 Call {self.call_id} summary: "
            f"turns={self.total_turns}, "
            f"avg_e2e={self.avg_e2e_ms:.0f}ms, "
            f"avg_ttft={self.avg_ttft_ms:.0f}ms, "
            f"p95_e2e={self.p95_e2e_ms:.0f}ms, "
            f"max_e2e={self.max_e2e_ms:.0f}ms"
        )
        for t in self.turns:
            logger.info(
                f"[LATENCY]   Turn {t.turn_number}: "
                f"STT={t.stt_latency_ms:.0f}ms | "
                f"TTFT={t.llm_ttft_ms:.0f}ms | "
                f"LLM_gen={t.llm_gen_ms:.0f}ms | "
                f"TTS_first={t.tts_first_ms:.0f}ms | "
                f"E2E={t.e2e_response_ms:.0f}ms"
            )


class LatencyTracker:
    """
    Tracks per-turn and per-call latency for a single call session.
    Usage:
        tracker = LatencyTracker(call_id="...", workspace_id="...")
        turn = tracker.new_turn()
        turn.audio_end = time.perf_counter()
        ...
        turn.compute()
        tracker.log_summary()  # at call end
    """

    def __init__(self, call_id: str = "", workspace_id: str = ""):
        self.call = CallLatency(
            call_id=call_id,
            workspace_id=workspace_id,
            call_start=time.perf_counter(),
        )
        self._turn_counter = 0

    def new_turn(self) -> TurnLatency:
        self._turn_counter += 1
        turn = TurnLatency(turn_number=self._turn_counter)
        self.call.turns.append(turn)
        return turn

    def end_call(self):
        self.call.call_end = time.perf_counter()
        self.call.compute_stats()
        self.call.log_summary()
        return self.call.to_dict()


@asynccontextmanager
async def track_leg(name: str, turn: TurnLatency, attr_start: str, attr_end: str = None):
    """
    Async context manager to time a pipeline leg.
    Usage:
        async with track_leg("STT", turn, "stt_start", "stt_final"):
            result = await stt_process(audio)
    """
    setattr(turn, attr_start, time.perf_counter())
    try:
        yield
    finally:
        if attr_end:
            setattr(turn, attr_end, time.perf_counter())
