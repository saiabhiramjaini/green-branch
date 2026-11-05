"""Streaming execution endpoint — real-time test output via SSE."""

import json
import logging
import time
from collections.abc import Callable, Generator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from src.app.handlers import handle_endpoint
from src.models import ExecuteTestsRequest
from src.services.execution_service import ExecutionService
from src.services.executors import CommandStream, get_executor
from src.services.git_service import GitService
from src.services.session_store import session_store
from src.utils.parsers import count_passed, parse_test_output

logger = logging.getLogger("ec2_agent")

router = APIRouter(tags=["Streaming Execution"])


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE event line."""
    return f"data: {json.dumps(data)}\n\n"


def _relay(
    make_stream: Callable[[], CommandStream],
    phase: str,
) -> Generator[str, None, tuple[int, str]]:
    """Run a command stream, forwarding each output line as an SSE log event.

    Returns its ``(exit_code, full_output)``. If the command can't run, the error
    is sent as a log line and the phase fails with exit code -1, so the client
    still receives a result.
    """
    lines: list[str] = []
    try:
        stream = make_stream()
        while True:
            line = next(stream)
            lines.append(line)
            yield _sse_event({"type": "log", "phase": phase, "line": line})
    except StopIteration as stop:
        return stop.value
    except Exception as e:
        logger.error(f"{phase} failed: {e}")
        message = f"[error] {phase} could not run: {e}"
        lines.append(message)
        yield _sse_event({"type": "log", "phase": phase, "line": message})
        return -1, "\n".join(lines)


def _stream_execution(
    session_id: str,
    language: str,
    install_command: str | None,
    test_command: str | None,
) -> Generator[str, None, None]:
    """Generator that streams test execution output as SSE events."""

    start = time.time()
    service = ExecutionService()

    # ── Install ──────────────────────────────────────────────────────────
    yield _sse_event({"type": "phase", "phase": "install"})
    install_exit, _ = yield from _relay(
        lambda: service.install_streaming(session_id, language, install_command), "install"
    )
    yield _sse_event({"type": "phase_done", "phase": "install", "exit_code": install_exit})

    # ── Test ─────────────────────────────────────────────────────────────
    yield _sse_event({"type": "phase", "phase": "test"})
    test_exit, full_test_output = yield from _relay(
        lambda: service.test_streaming(session_id, language, test_command), "test"
    )
    yield _sse_event({"type": "phase_done", "phase": "test", "exit_code": test_exit})

    # Parse errors
    errors = parse_test_output(full_test_output, language)
    status = "success" if test_exit == 0 else "failed"

    # ── Final result ──
    result = {
        "session_id": session_id,
        "status": status,
        "language": language,
        "passed": count_passed(full_test_output, language),
        "failed": len(errors),
        "errors": [e.model_dump() for e in errors],
        "raw_output": full_test_output,
        "duration": round(time.time() - start, 2),
    }

    new_status = "completed" if status == "success" else "failed"
    session_store.update(session_id, {"status": new_status})

    yield _sse_event({"type": "result", "data": result})
    yield _sse_event({"type": "done"})


@router.post("/execute/stream")
@handle_endpoint
async def execute_tests_streaming(request: ExecuteTestsRequest):
    """Run tests with real-time SSE streaming output.

    Returns a text/event-stream response where each event is a JSON line:
    - {"type": "phase", "phase": "install"|"test"}
    - {"type": "log", "phase": "...", "line": "..."}
    - {"type": "phase_done", "phase": "...", "exit_code": N}
    - {"type": "result", "data": {...}}
    - {"type": "done"}
    """
    # Validate before streaming starts so errors become proper HTTP responses
    session = session_store.get(request.session_id)
    GitService().require_repo_path(request.session_id)
    get_executor().check_language(session["language"])  # e.g. container down / npm missing → 503
    session_store.update(request.session_id, {"status": "running"})

    return StreamingResponse(
        _stream_execution(
            session_id=request.session_id,
            language=session["language"],
            install_command=request.install_command,
            test_command=request.test_command,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
