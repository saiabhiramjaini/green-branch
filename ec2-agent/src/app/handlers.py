"""Exception handlers and decorators for API endpoints."""

import functools
import logging
import traceback
from collections.abc import Callable, Coroutine
from typing import Any, ParamSpec, TypeVar

import fastapi
from pydantic import ValidationError

logger = logging.getLogger("ec2_agent")

P = ParamSpec("P")
R = TypeVar("R")


def _get_status_code(exc: Exception) -> int:
    """Extract HTTP status code from exception.

    1. Check for explicit `status_code` attribute (our custom exceptions).
    2. Fall back to intelligent classification by exception name.
    """
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code

    exc_name = type(exc).__name__.lower()

    if any(p in exc_name for p in ("validation", "config", "schema", "parse", "format")):
        return 422
    if "notfound" in exc_name or "not_found" in exc_name:
        return 404
    if "unauthorized" in exc_name or "unauthenticated" in exc_name:
        return 401
    if "forbidden" in exc_name or "permission" in exc_name:
        return 403
    if "ratelimit" in exc_name or "rate_limit" in exc_name:
        return 429

    return 500


def _get_detail(exc: Exception) -> str | dict[str, Any]:
    """Extract detail message from exception."""
    detail = getattr(exc, "detail", None)
    if detail is not None:
        return detail

    if isinstance(exc, ValidationError):
        return {"message": "Validation error", "errors": exc.errors()}

    return f"{type(exc).__name__}: {exc!s}"


def _log_exception(exc: Exception, func_name: str, status_code: int) -> None:
    """Log exception with severity based on status code."""
    extra: dict[str, Any] = {
        "error_type": type(exc).__name__,
        "status_code": status_code,
    }

    internal_detail = getattr(exc, "internal_detail", None)
    if internal_detail is not None:
        extra["internal_detail"] = internal_detail

    if status_code >= 500:
        extra["traceback"] = traceback.format_exc()

    log_msg = f"Exception in {func_name}: {exc}"
    if status_code >= 500:
        logger.error(log_msg, extra=extra)
    elif status_code >= 400:
        logger.warning(log_msg, extra=extra)
    else:
        logger.info(log_msg, extra=extra)


def handle_endpoint(
    func: Callable[P, Coroutine[Any, Any, R]],
) -> Callable[P, Coroutine[Any, Any, R]]:
    """Decorator: wraps exceptions into appropriate HTTP responses.

    Usage:
        @router.post("/my-endpoint")
        @handle_endpoint
        async def my_endpoint(request: MyRequest):
            ...
    """

    @functools.wraps(func)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return await func(*args, **kwargs)
        except fastapi.HTTPException:
            raise  # Let FastAPI's own HTTPException pass through
        except Exception as exc:
            status_code = _get_status_code(exc)
            detail = _get_detail(exc)
            _log_exception(exc, func.__name__, status_code)
            raise fastapi.HTTPException(status_code=status_code, detail=detail) from exc

    return wrapper