"""API-key authentication for requests coming from the main server / frontend backend."""

import logging
import secrets

from fastapi import Header, HTTPException

from src.app.config import api_settings

logger = logging.getLogger("runner")


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Reject requests without a valid ``X-API-Key`` header.

    Fails closed: if no key is configured, requests are only allowed in debug mode.
    """
    expected = api_settings.api_key
    if not expected:
        if api_settings.debug:
            return
        raise HTTPException(status_code=503, detail="Runner API key is not configured")

    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
