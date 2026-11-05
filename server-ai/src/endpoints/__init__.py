"""Endpoints package."""

from src.endpoints.health import router as health_router
from src.endpoints.agent import router as agent_router
from src.endpoints.agent_ws import router as agent_ws_router
from src.endpoints.pr import router as pr_router

__all__ = ["health_router", "agent_router", "agent_ws_router", "pr_router"]
