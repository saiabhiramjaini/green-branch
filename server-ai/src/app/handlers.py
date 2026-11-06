"""@handle_endpoint decorator — centralised error handling for all endpoints."""

import logging
from collections.abc import Callable
from typing import Any, ParamSpec, TypeVar

import fastapi

logger = logging.getLogger("greenbranch")

P = ParamSpec("P")
R = TypeVar("R")


def _get_status_code(exc: Exception) -> int:
    """Return HTTP status code from exception."""
    if hasattr(exc, "status_code"):
        return exc.status_code
    return 500


def _get_detail(exc: Exception) -> str | dict[str, Any]:
    """Return a clean detail string from exception."""
    msg = str(exc)
    if not msg:
        return type(exc).__name__
    return msg


def _log_exception(exc: Exception, func_name: str, status_code: int) -> None:
    if status_code >= 500:
        logger.error(f"[{func_name}] {type(exc).__name__}: {exc}", exc_info=True)
    elif status_code >= 400:
        logger.warning(f"[{func_name}] {type(exc).__name__}: {exc}")


def handle_endpoint(func: Callable[P, R]) -> Callable[P, R]:
    """
    Decorator that wraps any FastAPI endpoint with:
    - Structured error handling
    - Automatic status code mapping from custom exceptions
    - Consistent logging

    Usage:
        @router.post("/route")
        @handle_endpoint
        async def my_endpoint(request: MyRequest):
            ...
    """
    import functools

    @functools.wraps(func)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return await func(*args, **kwargs)
        except fastapi.HTTPException:
            raise
        except Exception as exc:
            status_code = _get_status_code(exc)
            detail = _get_detail(exc)
            _log_exception(exc, func.__name__, status_code)
            raise fastapi.HTTPException(
                status_code=status_code,
                detail=detail,
            )

    return wrapper
