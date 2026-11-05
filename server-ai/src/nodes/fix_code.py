"""fix_code node — asks the LLM to repair a failing file and writes it via the EC2 agent.

The fix is only verified by the next execute_tests run, which accepts or reverts it.
"""

import logging
import time
from datetime import datetime, timezone

from src.app.config import api_settings
from src.core.exceptions import EC2AgentError, FixGenerationError, LLMError
from src.runner.fix_engine import apply_fix, error_key, generate_fix
from src.services.ec2_client import EC2Client
from src.state.graph_state import GraphState

logger = logging.getLogger("greenbranch")


async def fix_code(state: GraphState) -> GraphState:
    """Generate a fix with the LLM, write it, and record it as pending verification."""

    error = state["current_error"]
    file_path = error.get("file", "unknown")
    bug_type = error.get("error_type", "LOGIC")
    line_number = error.get("line")
    iteration = state.get("iteration", 0)

    attempts = state.get("attempts", {})
    key = error_key(error)
    attempts[key] = attempts.get(key, 0) + 1
    state["attempts"] = attempts

    logger.info(f"\n{'~'*60}")
    logger.info(f"[GRAPH] fix_code  iteration={iteration}  attempt={attempts[key]}")
    logger.info(f"[GRAPH] target: {file_path}  bug_type={bug_type}  line={line_number}")
    logger.info(f"[GRAPH] error message: {error.get('message', '')}")
    logger.info(f"{'~'*60}")

    client = EC2Client()
    fixes: list = state.get("fixes_applied", [])
    trace: list = state.get("debug_trace", [])
    ts = datetime.now(timezone.utc).isoformat()
    t0 = time.monotonic()

    try:
        attempt = await generate_fix(
            client,
            state["session_id"],
            error,
            raw_output=state.get("raw_output", ""),
            language=state.get("language", ""),
            retry=attempts[key] > 1,
        )
        await apply_fix(client, state["session_id"], attempt)
    except (LLMError, FixGenerationError, EC2AgentError) as e:
        logger.warning(f"[GRAPH] fix_code failed: {e}")
        fixes.append({
            "file": file_path,
            "bug_type": bug_type,
            "line_number": line_number,
            "commit_message": "",
            "status": "failed",
        })
        state["fixes_applied"] = fixes
        state["pending_fix"] = None
        state["llm_unavailable"] = isinstance(e, LLMError)
        trace.append({
            "stage": "fix_code",
            "iteration": iteration,
            "timestamp": ts,
            "duration_ms": round((time.monotonic() - t0) * 1000),
            "summary": f"FAILED — {file_path}: {e}",
        })
        state["debug_trace"] = trace
        return state

    logger.info(f"[GRAPH] fix written to {attempt.target_file} ({len(attempt.fixed_code)} chars, LLM {attempt.llm_ms:.0f}ms)")

    # Recorded as pending — execute_tests marks it fixed or reverts it
    fixes.append({
        "file": attempt.target_file,
        "bug_type": bug_type,
        "line_number": line_number,
        "commit_message": "",
        "status": "pending",
    })
    state["fixes_applied"] = fixes
    state["pending_fix"] = {"attempt": attempt, "index": len(fixes) - 1}

    trace.append({
        "stage": "fix_code",
        "iteration": iteration,
        "timestamp": ts,
        "duration_ms": round((time.monotonic() - t0) * 1000),
        "llm": {
            "model": api_settings.llm_model,
            "prompt_chars": len(attempt.prompt),
            "output_chars": len(attempt.fixed_code),
            "duration_ms": round(attempt.llm_ms),
            "prompt_preview": attempt.prompt[:400],
            "output_preview": attempt.fixed_code[:400],
        },
        "request": {
            "session_id": state["session_id"],
            "file_path": attempt.target_file,
            "fix_content": f"<{len(attempt.fixed_code)} chars>",
        },
        "summary": f"WRITTEN — {attempt.target_file} ({bug_type}), pending verification",
    })
    state["debug_trace"] = trace

    return state
