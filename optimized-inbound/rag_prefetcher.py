"""
rag_prefetcher.py
─────────────────
Speculative knowledge base prefetching.

When the LLM emits tokens suggesting a knowledge-seeking intent (e.g. "let me check",
"our", "the price is", product names), we kick off a KB search in parallel while the
LLM is still generating. If the LLM calls search_knowledge_base, we serve the cached
result instead of making a fresh HTTP call.

Saves 200-500ms on knowledge-heavy turns by overlapping KB fetch with LLM generation.
"""

import asyncio
import logging
import time
from typing import Optional

logger = logging.getLogger("rag-prefetcher")

# Intent signals that suggest the caller is asking about products/services
_INTENT_KEYWORDS = [
    "price", "cost", "how much", "available", "feature", "specification",
    "does it have", "can it", "is there", "tell me about", "what is",
    "let me check", "our ", "the ", "this ", "that ", "it has",
    "model", "variant", "color", "size", "plan", "package",
    "treatment", "appointment", "booking", "slot",
]


class RAGPrefetcher:
    """
    Speculatively prefetches KB results when intent is detected.

    Usage:
        prefetcher = RAGPrefetcher(workspace_id, fetch_fn)
        # On each user transcript:
        await prefetcher.on_user_input(transcript_text)
        # When LLM calls search_knowledge_base:
        result = await prefetcher.get_cached_or_fetch(query)
    """

    def __init__(self, workspace_id: str, fetch_fn):
        """
        Args:
            workspace_id: Current workspace ID
            fetch_fn: Async callable(query: str) -> str (performs KB search)
        """
        self._workspace_id = workspace_id
        self._fetch_fn = fetch_fn
        self._cache: dict[str, tuple[str, float]] = {}  # query -> (result, timestamp)
        self._pending: dict[str, asyncio.Task] = {}  # query -> Task
        self._ttl_s = 30  # Cache TTL — KB results are stable for 30s

    def _detect_intent(self, text: str) -> Optional[str]:
        """
        Detect if user text suggests a knowledge-seeking intent.
        Returns a search query if intent detected, None otherwise.
        """
        text_lower = text.lower().strip()
        for keyword in _INTENT_KEYWORDS:
            if keyword in text_lower:
                # Use the full text as the query — the embedding search will handle relevance
                return text_lower
        return None

    async def on_user_input(self, text: str):
        """
        Analyze user input and speculative prefetch if intent detected.
        Non-blocking — runs in background.
        """
        query = self._detect_intent(text)
        if not query:
            return

        # Don't prefetch if we already have a cached result
        if query in self._cache:
            age = time.time() - self._cache[query][1]
            if age < self._ttl_s:
                logger.debug(f"[RAG-Prefetch] Already cached: {query[:50]}")
                return

        # Don't start duplicate prefetches
        if query in self._pending and not self._pending[query].done():
            return

        logger.info(f"[RAG-Prefetch] 🔍 Speculative prefetch for: {query[:60]}")
        self._pending[query] = asyncio.create_task(self._do_fetch(query))

    async def _do_fetch(self, query: str):
        """Perform the actual KB fetch."""
        try:
            result = await self._fetch_fn(query)
            self._cache[query] = (result, time.time())
            logger.info(f"[RAG-Prefetch] ✅ Cached result for: {query[:50]} ({len(result)} chars)")
        except Exception as e:
            logger.warning(f"[RAG-Prefetch] ⚠️ Fetch failed for: {query[:50]} — {e}")

    async def get_cached_or_fetch(self, query: str) -> str:
        """
        Get KB result — serve from cache if available, otherwise fetch fresh.
        This is called when the LLM actually invokes search_knowledge_base.
        """
        # Normalize query for cache lookup
        query_key = query.lower().strip()

        # Check cache
        if query_key in self._cache:
            result, ts = self._cache[query_key]
            age = time.time() - ts
            if age < self._ttl_s:
                logger.info(f"[RAG-Prefetch] ⚡ Cache HIT for: {query_key[:50]} (age={age:.1f}s)")
                return result

        # Check pending prefetch
        for cached_query, task in self._pending.items():
            if cached_query in query_key or query_key in cached_query:
                if not task.done():
                    logger.info(f"[RAG-Prefetch] ⏳ Waiting for in-flight prefetch: {cached_query[:50]}")
                    try:
                        await asyncio.wait_for(task, timeout=5.0)
                        if cached_query in self._cache:
                            return self._cache[cached_query][0]
                    except (asyncio.TimeoutError, Exception):
                        pass

        # Cache miss — fetch fresh
        logger.info(f"[RAG-Prefetch] 🔍 Cache MISS — fetching: {query_key[:50]}")
        result = await self._fetch_fn(query)
        self._cache[query_key] = (result, time.time())
        return result

    def clear(self):
        """Clear all cached results and cancel pending fetches."""
        for task in self._pending.values():
            if not task.done():
                task.cancel()
        self._pending.clear()
        self._cache.clear()

    def stats(self) -> dict:
        return {
            "cached_queries": len(self._cache),
            "pending_fetches": sum(1 for t in self._pending.values() if not t.done()),
            "total_prefetched": len(self._pending),
        }
