"""Streaming execution endpoint — real-time test output via SSE."""

import json
import logging
import os
import time
from typing import Generator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from src.app.config import api_settings
from src.app.handlers import handle_endpoint
from src.models import ExecuteTestsRequest
from src.services.docker_service import DockerService
from src.services.git_service import GitService
from src.services.session_store import session_store
from src.utils.parsers import count_passed, parse_test_output

logger = logging.getLogger("ec2_agent")

router = APIRouter(tags=["Streaming Execution"])


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE event line."""
    return f"data: {json.dumps(data)}\n\n"


def _relay(
    gen: Generator[str, None, tuple[int, str]],
    phase: str,
    lines: list[str],
) -> Generator[str, None, tuple[int, str]]:
    """Forward each output line of *gen* as an SSE log event.

    Returns the wrapped generator's ``(exit_code, full_output)``.
    """
    try:
        while True:
            line = next(gen)
            lines.append(line)
            yield _sse_event({"type": "log", "phase": phase, "line": line})
    except StopIteration as stop:
        return stop.value or (0, "\n".join(lines))


def _stream_execution(
    session_id: str,
    language: str,
    install_command: str | None,
    test_command: str | None,
) -> Generator[str, None, None]:
    """Generator that streams test execution output as SSE events."""

    start = time.time()
    docker_service = DockerService()
    container_repo_path = os.path.join(api_settings.container_repos_path, session_id)

    # ── Install ──────────────────────────────────────────────────────────
    yield _sse_event({"type": "phase", "phase": "install"})

    install_lines: list[str] = []
    try:
        install_exit, _ = yield from _relay(
            docker_service.install_dependencies_streaming(
                language=language,
                repo_path=container_repo_path,
                custom_command=install_command,
            ),
            "install",
            install_lines,
        )
    except Exception as e:
        logger.warning(f"Install streaming failed, falling back: {e}")
        install_exit, install_output = docker_service.install_dependencies(
            language=language,
            repo_path=container_repo_path,
            custom_command=install_command,
        )
        for line in install_output.strip().split("\n"):
            yield _sse_event({"type": "log", "phase": "install", "line": line})

    yield _sse_event({"type": "phase_done", "phase": "install", "exit_code": install_exit})

    # ── Test ─────────────────────────────────────────────────────────────
    yield _sse_event({"type": "phase", "phase": "test"})

    test_lines: list[str] = []
    try:
        test_exit, full_test_output = yield from _relay(
            docker_service.run_tests_streaming(
                language=language,
                repo_path=container_repo_path,
                custom_command=test_command,
            ),
            "test",
            test_lines,
        )
    except Exception as e:
        logger.warning(f"Test streaming failed, falling back: {e}")
        test_exit, full_test_output = docker_service.run_tests(
            language=language,
            repo_path=container_repo_path,
            custom_command=test_command,
        )
        for line in full_test_output.strip().split("\n"):
            yield _sse_event({"type": "log", "phase": "test", "line": line})

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
