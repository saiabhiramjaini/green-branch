"""execute_tests node — calls the EC2 agent over HTTP to run the test suite."""

import logging
import time
from datetime import datetime, timezone

from src.state.graph_state import GraphState
from src.services.ec2_client import EC2Client

logger = logging.getLogger("rift_server")


async def execute_tests(state: GraphState) -> GraphState:
    """Run tests via the EC2 agent, update state, and record CI timeline entry."""

    iteration = state.get("iteration", 0) + 1
    logger.info(f"\n{'*'*60}")
    logger.info(f"[GRAPH] execute_tests  iteration={iteration}")
    logger.info(f"[GRAPH] session_id={state['session_id']}  branch={state.get('branch','main')}")
    logger.info(f"{'*'*60}")

    request_payload = {
        "session_id": state["session_id"],
        "branch": state.get("branch", "main"),
        "install_command": state.get("install_command"),
        "test_command": state.get("test_command"),
    }

    t0 = time.monotonic()
    client = EC2Client()
    result = await client.execute_tests(
        session_id=state["session_id"],
        install_command=state.get("install_command"),
        test_command=state.get("test_command"),
        branch=state.get("branch", "main"),
    )
    elapsed_ms = (time.monotonic() - t0) * 1000

    errors = result.get("errors", [])
    passed = result.get("status") == "success"

    logger.info(f"[GRAPH] execute_tests RESULT: passed={passed}  errors={len(errors)}  duration_ms={elapsed_ms:.0f}")
    logger.info(f"[GRAPH] raw_output preview: {result.get('raw_output','')[:300]}")
    if errors:
        for i, e in enumerate(errors):
            logger.info(f"[GRAPH]   error[{i}]: {e.get('error_type')} in {e.get('file')} line {e.get('line')} — {e.get('message','')[:120]}")

    state["errors"] = errors
    state["passed"] = passed
    state["iteration"] = iteration
    state["raw_output"] = result.get("raw_output", "")

    # Track total unique failures detected (on first run)
    if iteration == 1:
        state["total_failures_detected"] = len(errors)
    elif len(errors) > state.get("total_failures_detected", 0):
        state["total_failures_detected"] = len(errors)

    # Record CI timeline entry
    fixes_so_far = len(state.get("fixes_applied", []))
    timeline: list = state.get("ci_timeline", [])
    ts = datetime.now(timezone.utc).isoformat()
    timeline.append({
        "iteration": iteration,
        "status": "passed" if passed else "failed",
        "errors_count": len(errors),
        "fixes_applied": fixes_so_far,
        "timestamp": ts,
    })
    state["ci_timeline"] = timeline

    # Append to debug trace
    trace: list = state.get("debug_trace", [])
    trace.append({
        "stage": "execute_tests",
        "iteration": iteration,
        "timestamp": ts,
        "duration_ms": round(elapsed_ms),
        "request": request_payload,
        "response": {
            "status": result.get("status"),
            "passed": result.get("passed", 0),
            "failed": result.get("failed", 0),
            "errors": errors,
            "raw_output": result.get("raw_output", ""),
            "duration": result.get("duration"),
        },
        "summary": f"{'PASSED' if passed else 'FAILED'} — {len(errors)} error(s)",
    })
    state["debug_trace"] = trace

    return state
