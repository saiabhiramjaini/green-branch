import asyncio

from fastapi import APIRouter

from src.app.config import api_settings
from src.app.handlers import handle_endpoint
from src.services.executors import get_executor

router = APIRouter(tags=["Health"])


@router.get("/health")
@handle_endpoint
async def health_check():
    """Basic health check."""
    return {"status": "healthy", "service": "ec2-agent", "executor": api_settings.executor}


@router.get("/health/executor")
@handle_endpoint
async def executor_health():
    """Check that commands can be run (Docker reachable, or local tools installed)."""
    details = await asyncio.to_thread(lambda: get_executor().check())
    return {"status": "healthy", **details}
