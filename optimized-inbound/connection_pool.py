"""
connection_pool.py
──────────────────
Persistent connection pooling for LLM/TTS/STT clients.

Avoids creating new HTTP/WS connections on every call — pays TLS handshake once,
reuses across calls. Falls back gracefully if pooled connection is stale.
"""

import asyncio
import logging
import time
from typing import Optional, Any
from dataclasses import dataclass, field

logger = logging.getLogger("connection-pool")


@dataclass
class PooledClient:
    """A cached client with creation timestamp and health status."""
    client: Any
    created_at: float = 0.0
    last_used: float = 0.0
    use_count: int = 0
    healthy: bool = True


class ConnectionPool:
    """
    Generic async connection pool for LLM/TTS/STT clients.

    Clients are keyed by (provider, model, config_hash). Stale clients
    (older than max_age_s) are evicted on next access. Max pool size is
    enforced with LRU eviction.

    Usage:
        pool = ConnectionPool(max_size=10, max_age_s=600)
        llm = await pool.get("llm", "gemini-2.5-flash", create_fn)
    """

    def __init__(self, max_size: int = 10, max_age_s: float = 600):
        self._pool: dict[str, PooledClient] = {}
        self._max_size = max_size
        self._max_age_s = max_age_s
        self._lock = asyncio.Lock()

    def _evict_stale(self):
        """Remove clients older than max_age_s."""
        now = time.time()
        stale_keys = [
            k for k, v in self._pool.items()
            if (now - v.created_at) > self._max_age_s
        ]
        for k in stale_keys:
            logger.info(f"[Pool] Evicting stale client: {k}")
            del self._pool[k]

    def _evict_lru(self):
        """Remove the least-recently-used client when pool is full."""
        if len(self._pool) < self._max_size:
            return
        lru_key = min(self._pool, key=lambda k: self._pool[k].last_used)
        logger.info(f"[Pool] Evicting LRU client: {lru_key}")
        del self._pool[lru_key]

    async def get(self, key: str, create_fn) -> Any:
        """
        Get a client from pool, or create one via create_fn() if not available.

        Args:
            key: Pool key (e.g. "llm:gemini-2.5-flash:high-temp")
            create_fn: Async callable that returns a new client instance

        Returns:
            A pooled or freshly created client
        """
        async with self._lock:
            self._evict_stale()

            if key in self._pool:
                entry = self._pool[key]
                entry.last_used = time.time()
                entry.use_count += 1
                logger.debug(f"[Pool] Reusing client: {key} (use #{entry.use_count})")
                return entry.client

            # Pool full — evict LRU
            self._evict_lru()

        # Create outside lock (may be slow)
        logger.info(f"[Pool] Creating new client: {key}")
        client = await create_fn()

        async with self._lock:
            self._pool[key] = PooledClient(
                client=client,
                created_at=time.time(),
                last_used=time.time(),
                use_count=1,
            )
            logger.info(f"[Pool] Cached client: {key} (pool size: {len(self._pool)})")

        return client

    def mark_unhealthy(self, key: str):
        """Mark a client as unhealthy so it gets evicted."""
        if key in self._pool:
            self._pool[key].healthy = False
            logger.warning(f"[Pool] Marked unhealthy: {key}")
            del self._pool[key]

    def stats(self) -> dict:
        """Return pool statistics."""
        return {
            "size": len(self._pool),
            "max_size": self._max_size,
            "clients": {
                k: {
                    "use_count": v.use_count,
                    "age_s": round(time.time() - v.created_at, 1),
                    "healthy": v.healthy,
                }
                for k, v in self._pool.items()
            },
        }


# Global singleton pool — shared across all calls in one agent process
_global_pool = ConnectionPool(max_size=10, max_age_s=900)  # 15 min max age


def get_global_pool() -> ConnectionPool:
    """Get the global connection pool singleton."""
    return _global_pool
