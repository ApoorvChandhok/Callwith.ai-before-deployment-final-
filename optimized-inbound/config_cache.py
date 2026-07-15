"""
config_cache.py
───────────────
In-memory TTL cache for workspace configs.

Avoids hitting Supabase 3x per call. Configs change rarely (on dashboard save),
so a 5-minute TTL is safe. Falls through to live fetch on miss or expiry.
"""

import asyncio
import logging
import time
from typing import Optional, Any
from dataclasses import dataclass, field

logger = logging.getLogger("config-cache")


@dataclass
class CachedConfig:
    """A cached workspace config with TTL metadata."""
    config: Any
    fetched_at: float = 0.0
    hit_count: int = 0


class WorkspaceConfigCache:
    """
    TTL cache for WorkspaceAgentConfig objects.

    Keys on (workspace_id, mode). Evicts after ttl_s seconds.
    Thread-safe via asyncio.Lock (single event loop).

    Usage:
        cache = WorkspaceConfigCache(ttl_s=300)
        ws_config = await cache.get_or_fetch(workspace_id, mode, fetch_fn)
    """

    def __init__(self, ttl_s: float = 300):
        self._cache: dict[str, CachedConfig] = {}
        self._ttl_s = ttl_s
        self._lock = asyncio.Lock()
        self._stats = {"hits": 0, "misses": 0}

    def _key(self, workspace_id: str, mode: str) -> str:
        return f"{workspace_id}:{mode}"

    async def get_or_fetch(self, workspace_id: Optional[str], mode: str, fetch_fn):
        """
        Get config from cache, or fetch via fetch_fn() and cache the result.

        Args:
            workspace_id: Business UUID
            mode: "inbound" or "outbound"
            fetch_fn: Async callable(workspace_id, mode) -> WorkspaceAgentConfig

        Returns:
            WorkspaceAgentConfig (from cache or fresh fetch)
        """
        if not workspace_id:
            # No workspace_id — always fetch (static fallback path)
            self._stats["misses"] += 1
            return await fetch_fn(workspace_id, mode)

        key = self._key(workspace_id, mode)

        async with self._lock:
            if key in self._cache:
                entry = self._cache[key]
                age_s = time.time() - entry.fetched_at
                if age_s < self._ttl_s:
                    entry.hit_count += 1
                    self._stats["hits"] += 1
                    logger.info(
                        f"[ConfigCache] ✅ Cache HIT for {workspace_id!r} mode={mode!r} "
                        f"(age={age_s:.0f}s, hits={entry.hit_count})"
                    )
                    return entry.config
                else:
                    logger.info(
                        f"[ConfigCache] ⏰ Cache EXPIRED for {workspace_id!r} mode={mode!r} "
                        f"(age={age_s:.0f}s > ttl={self._ttl_s:.0f}s)"
                    )
                    del self._cache[key]

        # Fetch outside lock
        self._stats["misses"] += 1
        logger.info(f"[ConfigCache] 🔍 Cache MISS — fetching from Supabase: {workspace_id!r} mode={mode!r}")
        config = await fetch_fn(workspace_id, mode)

        async with self._lock:
            self._cache[key] = CachedConfig(
                config=config,
                fetched_at=time.time(),
            )
            logger.info(f"[ConfigCache] 📦 Cached config for {workspace_id!r} (pool size: {len(self._cache)})")

        return config

    def invalidate(self, workspace_id: str, mode: str = None):
        """Manually invalidate cache for a workspace (e.g. after dashboard save)."""
        if mode:
            key = self._key(workspace_id, mode)
            self._cache.pop(key, None)
            logger.info(f"[ConfigCache] 🗑️ Invalidated: {key}")
        else:
            # Invalidate all modes for this workspace
            keys_to_remove = [k for k in self._cache if k.startswith(f"{workspace_id}:")]
            for k in keys_to_remove:
                del self._cache[k]
            logger.info(f"[ConfigCache] 🗑️ Invalidated all modes for: {workspace_id}")

    def stats(self) -> dict:
        """Return cache statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        return {
            "size": len(self._cache),
            "hits": self._stats["hits"],
            "misses": self._stats["misses"],
            "hit_rate": f"{self._stats['hits'] / total * 100:.1f}%" if total > 0 else "N/A",
            "entries": {
                k: {
                    "age_s": round(time.time() - v.fetched_at, 1),
                    "hit_count": v.hit_count,
                }
                for k, v in self._cache.items()
            },
        }


# Global singleton
_global_cache = WorkspaceConfigCache(ttl_s=300)  # 5 min TTL


def get_config_cache() -> WorkspaceConfigCache:
    """Get the global config cache singleton."""
    return _global_cache
