"""Redis-backed session store — production-grade session management."""

import json
import logging
from datetime import datetime, timezone

import redis

from src.app.config import api_settings
from src.core.exceptions import SessionNotFoundError, SessionAlreadyExistsError

logger = logging.getLogger("ec2_agent")

# ═══════════════════════════════════════════════════════════
# KEY SCHEMA
# ═══════════════════════════════════════════════════════════
#   session:{session_id}        → JSON blob (hash-like)
#   user_sessions:{user_id}     → Redis SET of session_ids
#   sessions_index              → Redis SET of ALL session_ids
# ═══════════════════════════════════════════════════════════

SESSION_PREFIX = "session:"
USER_INDEX_PREFIX = "user_sessions:"
SESSIONS_INDEX = "sessions_index"


class SessionStore:
    """
    Redis-backed session store with TTL, user indexing,
    and full CRUD operations.

    Usage:
        store = SessionStore()
        store.ping()                             # verify connectivity
        store.create(session_id, data)           # create session
        data = store.get(session_id)             # get session
        store.update(session_id, {"status": x})  # partial update
        store.delete(session_id)                 # remove session
        sessions = store.list_all()              # list all
        sessions = store.list_by_user(user_id)   # filter by user
    """

    def __init__(self):
        self._client: redis.Redis | None = None

    @property
    def client(self) -> redis.Redis:
        """Lazy-initialised Redis client with connection pooling."""
        if self._client is None:
            self._client = redis.from_url(
                api_settings.redis_url,
                decode_responses=True,   # return str, not bytes
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30,
            )
            logger.info("Redis client initialised (connection pool ready)")
        return self._client

    # ── Health ────────────────────────────────────────────

    def ping(self) -> bool:
        """Verify Redis connectivity. Raises on failure."""
        result = self.client.ping()
        logger.info("Redis PING → PONG")
        return result

    # ── CRUD ──────────────────────────────────────────────

    def create(self, session_id: str, data: dict) -> dict:
        """
        Store a new session with TTL and index it.

        Raises SessionAlreadyExistsError if key already exists.
        """
        key = f"{SESSION_PREFIX}{session_id}"

        # Atomic check-and-set (NX = only if not exists)
        payload = json.dumps(data)
        was_set = self.client.set(key, payload, nx=True, ex=api_settings.session_ttl)

        if not was_set:
            raise SessionAlreadyExistsError(session_id)

        # Add to indexes (with same TTL on user set)
        user_id = data.get("user_id", "anonymous")
        pipe = self.client.pipeline()
        pipe.sadd(SESSIONS_INDEX, session_id)
        pipe.sadd(f"{USER_INDEX_PREFIX}{user_id}", session_id)
        pipe.execute()

        logger.info(f"Session created: {session_id} (TTL={api_settings.session_ttl}s)")
        return data

    def get(self, session_id: str) -> dict:
        """
        Retrieve a session by ID.

        Raises SessionNotFoundError if missing or expired.
        """
        key = f"{SESSION_PREFIX}{session_id}"
        raw = self.client.get(key)

        if raw is None:
            raise SessionNotFoundError(session_id)

        return json.loads(raw)

    def update(self, session_id: str, updates: dict) -> dict:
        """
        Partial update — merges `updates` into the existing session.

        Preserves remaining TTL.
        Raises SessionNotFoundError if missing.
        """
        key = f"{SESSION_PREFIX}{session_id}"

        # Get current TTL so we can preserve it
        ttl = self.client.ttl(key)
        raw = self.client.get(key)

        if raw is None:
            raise SessionNotFoundError(session_id)

        data = json.loads(raw)
        data.update(updates)
        data["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Write back with remaining TTL (or default if TTL was -1/no expiry)
        effective_ttl = ttl if ttl > 0 else api_settings.session_ttl
        self.client.set(key, json.dumps(data), ex=effective_ttl)

        logger.info(f"Session updated: {session_id} → {list(updates.keys())}")
        return data

    def delete(self, session_id: str) -> bool:
        """
        Delete a session and remove it from all indexes.

        Returns True if deleted, raises SessionNotFoundError if not found.
        """
        key = f"{SESSION_PREFIX}{session_id}"
        raw = self.client.get(key)

        if raw is None:
            raise SessionNotFoundError(session_id)

        data = json.loads(raw)
        user_id = data.get("user_id", "anonymous")

        # Atomic cleanup: session key + both indexes
        pipe = self.client.pipeline()
        pipe.delete(key)
        pipe.srem(SESSIONS_INDEX, session_id)
        pipe.srem(f"{USER_INDEX_PREFIX}{user_id}", session_id)
        pipe.execute()

        logger.info(f"Session deleted: {session_id}")
        return True

    def exists(self, session_id: str) -> bool:
        """Check if a session exists (without deserializing)."""
        return self.client.exists(f"{SESSION_PREFIX}{session_id}") > 0

    # ── Listing ───────────────────────────────────────────

    def list_all(self) -> list[dict]:
        """Return all active sessions."""
        session_ids = self.client.smembers(SESSIONS_INDEX)
        return self._fetch_many(session_ids)

    def list_by_user(self, user_id: str) -> list[dict]:
        """Return all sessions for a specific user."""
        session_ids = self.client.smembers(f"{USER_INDEX_PREFIX}{user_id}")
        return self._fetch_many(session_ids)

    # ── Internal ──────────────────────────────────────────

    def _fetch_many(self, session_ids: set[str]) -> list[dict]:
        """
        Fetch multiple sessions via pipeline.
        Automatically cleans up stale index entries (expired sessions).
        """
        if not session_ids:
            return []

        # Pipeline GET for all IDs
        pipe = self.client.pipeline()
        ordered_ids = list(session_ids)
        for sid in ordered_ids:
            pipe.get(f"{SESSION_PREFIX}{sid}")
        results = pipe.execute()

        sessions = []
        stale_ids = []

        for sid, raw in zip(ordered_ids, results):
            if raw is not None:
                sessions.append(json.loads(raw))
            else:
                # Session expired but still in index → mark for cleanup
                stale_ids.append(sid)

        # Lazy cleanup of stale index entries
        if stale_ids:
            pipe = self.client.pipeline()
            for sid in stale_ids:
                pipe.srem(SESSIONS_INDEX, sid)
            pipe.execute()
            logger.info(f"Cleaned {len(stale_ids)} stale index entries")

        return sessions

    def close(self) -> None:
        """Close the Redis connection pool."""
        if self._client is not None:
            self._client.close()
            logger.info("Redis connection pool closed")
            self._client = None


# Global singleton — import this everywhere
session_store = SessionStore()
