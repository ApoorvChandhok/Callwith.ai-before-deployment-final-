"""
sentence_chunker.py
────────────────────
Sentence-boundary detection for incremental TTS.

Buffers LLM tokens and flushes to TTS at natural clause boundaries
(comma, period, question mark, exclamation, conjunctions). This lets the
caller hear the agent start speaking within ~200ms of the first clause
instead of waiting for the full response.

Falls back to a max-buffer flush if no boundary arrives within max_buffer_ms.
"""

import re
import asyncio
import logging
from typing import Callable, Awaitable, Optional

logger = logging.getLogger("sentence-chunker")

# Sentence-ending punctuation
_SENTENCE_END = re.compile(r'[.!?。！？]\s*$')

# Clause boundary: comma, semicolon, dash, or conjunction followed by space
_CLAUSE_BREAK = re.compile(r'[,;:—–]\s+$|(?:\s+(?:and|but|or|so|then|because|that|which|who|where|when)\s+)$', re.IGNORECASE)

# Minimum characters before we consider flushing (avoid 1-char flushes)
_MIN_FLUSH_CHARS = 8

# Max buffer time before force-flush (ms)
_DEFAULT_MAX_BUFFER_MS = 400


class SentenceChunker:
    """
    Buffers LLM token stream and flushes at sentence/clause boundaries.

    Usage:
        chunker = SentenceChunker(flush_fn=tts.push_text, max_buffer_ms=400)
        for token in llm_stream:
            await chunker.push(token)
        await chunker.flush()  # flush remaining buffer
    """

    def __init__(
        self,
        flush_fn: Callable[[str], Awaitable[None]],
        max_buffer_ms: int = _DEFAULT_MAX_BUFFER_MS,
    ):
        self._flush_fn = flush_fn
        self._max_buffer_ms = max_buffer_ms
        self._buffer = ""
        self._total_chars = 0
        self._flush_count = 0
        self._timer_task: Optional[asyncio.Task] = None

    async def push(self, token: str):
        """Push a token from the LLM stream. May trigger a flush at clause boundary."""
        self._buffer += token
        self._total_chars += len(token)

        # Check for sentence end (highest priority flush)
        if _SENTENCE_END.search(self._buffer) and len(self._buffer) >= _MIN_FLUSH_CHARS:
            await self._do_flush("sentence_end")
            return

        # Check for clause break (medium priority — only if buffer is meaningful)
        if len(self._buffer) >= 15 and _CLAUSE_BREAK.search(self._buffer):
            await self._do_flush("clause_break")
            return

        # Start max-buffer timer if not already running
        if self._timer_task is None or self._timer_task.done():
            self._timer_task = asyncio.create_task(self._timed_flush())

    async def _timed_flush(self):
        """Force-flush after max_buffer_ms if no natural boundary arrives."""
        await asyncio.sleep(self._max_buffer_ms / 1000)
        if self._buffer.strip():
            await self._do_flush("max_buffer_timeout")

    async def _do_flush(self, reason: str):
        """Flush the buffer to TTS."""
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()

        text = self._buffer.strip()
        self._buffer = ""

        if text and len(text) >= _MIN_FLUSH_CHARS:
            self._flush_count += 1
            logger.debug(
                f"[Chunker] Flushing #{self._flush_count} ({reason}): "
                f"{text[:60]}{'...' if len(text) > 60 else ''}"
            )
            await self._flush_fn(text)

    async def flush(self):
        """Flush any remaining buffer (call at end of LLM stream)."""
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()

        text = self._buffer.strip()
        self._buffer = ""

        if text:
            self._flush_count += 1
            logger.debug(f"[Chunker] Final flush #{self._flush_count}: {text[:60]}")
            await self._flush_fn(text)

    def stats(self) -> dict:
        return {
            "total_chars": self._total_chars,
            "flush_count": self._flush_count,
            "avg_chunk_size": round(self._total_chars / max(self._flush_count, 1), 1),
        }
