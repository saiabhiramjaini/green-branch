"""Health endpoint."""

from fastapi import APIRouter

from src.app.config import api_settings
from src.app.handlers import handle_endpoint

router = APIRouter(tags=["Health"])


@router.get("/health")
@handle_endpoint
async def health_check() -> dict:
    """Liveness probe."""
    return {
        "status": "healthy",
        "service": api_settings.app_name,
        "version": api_settings.version,
    }
