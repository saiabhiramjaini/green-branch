"""Short-lived, single-use run tickets.

The frontend's backend registers a run (config + GitHub token) via an authenticated
POST /agent/runs and gets back an unguessable ``run_id``. The browser then opens the
WebSocket with only that id, so the GitHub token never passes through the browser.

Tickets live in process memory, so the server must run with a single worker.
"""

import secrets
import threading
import time
from typing import Any

from src.app.config import api_settings


class RunStore:
    """In-memory store of pending run configs, keyed by run_id."""

    def __init__(self) -> None:
        self._runs: dict[str, tuple[float, dict[str, Any]]] = {}
        self._lock = threading.Lock()

    def create(self, config: dict[str, Any]) -> str:
        """Store a run config and return its run_id."""
        run_id = secrets.token_urlsafe(32)
        now = time.monotonic()
        with self._lock:
            self._purge_expired(now)
            self._runs[run_id] = (now + api_settings.run_ticket_ttl, config)
        return run_id

    def claim(self, run_id: str) -> dict[str, Any] | None:
        """Remove and return a run config. Returns None if unknown, used, or expired."""
        with self._lock:
            entry = self._runs.pop(run_id, None)
        if entry is None:
            return None
        expires_at, config = entry
        return config if time.monotonic() < expires_at else None

    def _purge_expired(self, now: float) -> None:
        for run_id in [r for r, (exp, _) in self._runs.items() if exp <= now]:
            del self._runs[run_id]


run_store = RunStore()
