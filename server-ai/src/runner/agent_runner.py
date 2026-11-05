"""agent_runner — full orchestration: session → graph → commit → report."""

import logging
import time
from datetime import datetime, timezone
from typing import Any

from src.app.config import api_settings
from src.graph.healing_graph import build_graph
from src.services.ec2_client import EC2Client
from src.services.github import default_branch_name

logger = logging.getLogger("greenbranch")


async def run_agent(
    repo_url: str,
    language: str,
    branch_name: str | None = None,
    install_command: str | None = None,
    test_command: str | None = None,
    branch: str | None = None,
    max_iterations: int | None = None,
) -> dict[str, Any]:
    """
    End-to-end agent run:
    1. Create EC2 session (clone *branch*, or the repo's default branch).
    2. Run LangGraph healing loop (test → select → fix → verify → repeat).
    3. Commit each verified file to *branch_name* (default: a fresh greenbranch/fix-… branch).
    4. Return the run report.
    """
    start_time = time.time()
    client = EC2Client()
    run_debug_trace: list[dict[str, Any]] = []  # collects non-graph stages

    # ── 1. Branch name ──
    branch_name = branch_name or default_branch_name(repo_url)
    logger.info(f"\n{'@'*60}")
    logger.info(f"[RUNNER] run_agent START")
    logger.info(f"[RUNNER] repo_url={repo_url}")
    logger.info(f"[RUNNER] language={language}  branch={branch or 'default'}")
    logger.info(f"[RUNNER] branch_name={branch_name}")
    logger.info(f"{'@'*60}")

    # ── 2. Create session (clone repo) ──
    logger.info(f"[RUNNER] ▶ STEP 1: create_session")
    t_session = time.monotonic()
    session = await client.create_session(repo_url, language, branch=branch)
    session_ms = (time.monotonic() - t_session) * 1000
    session_id: str = session["session_id"]
    logger.info(f"[RUNNER] session created: id={session_id}  repo_path={session.get('repo_path')}  ({session_ms:.0f}ms)")

    run_debug_trace.append({
        "stage": "create_session",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_ms": round(session_ms),
        "request": {"repo_url": repo_url, "language": language, "branch": branch},
        "response": session,
        "summary": f"Session {session_id} created — repo cloned",
    })

    # ── 3. Build & run the healing graph ──
    logger.info(f"[RUNNER] ▶ STEP 2: LangGraph healing loop (max_iterations={max_iterations or api_settings.max_iterations})")
    graph = build_graph()

    initial_state: dict[str, Any] = {
        "session_id": session_id,
        "repo_url": repo_url,
        "language": language,
        "branch": session.get("branch") or "main",
        "branch_name": branch_name,
        "install_command": install_command,
        "test_command": test_command,
        "errors": [],
        "passed": False,
        "current_error": None,
        "iteration": 0,
        "max_iterations": max_iterations or api_settings.max_iterations,
        "attempts": {},
        "pending_fix": None,
        "llm_unavailable": False,
        "fixes_applied": [],
        "ci_timeline": [],
        "total_failures_detected": 0,
        "fixed_files": [],
        "commit_hash": None,
        "raw_output": "",
        "debug_trace": [],   # graph nodes will append to this
    }

    try:
        final_state: dict[str, Any] = await graph.ainvoke(initial_state)
        commit_hash, total_commits = await _commit_verified_fixes(
            client, session_id, final_state, branch_name, run_debug_trace
        )
    finally:
        try:
            await client.delete_session(session_id)
        except Exception as e:
            logger.warning(f"[RUNNER] Could not delete session {session_id}: {e}")

    logger.info(
        f"[RUNNER] graph done: passed={final_state['passed']}  "
        f"iters={final_state['iteration']}  fixes={len(final_state['fixes_applied'])}  "
        f"commits={total_commits}  trace_entries={len(final_state.get('debug_trace', []))}"
    )

    # ── 4. Build result ──
    time_taken = time.time() - start_time
    passed = final_state["passed"]
    total_fixes = len([f for f in final_state["fixes_applied"] if f["status"] == "fixed"])
    errors_remaining = final_state["errors"]

    logger.info(f"[RUNNER] final: passed={passed}  total_fixes={total_fixes}  errors_remaining={len(errors_remaining)}  time={time_taken:.1f}s")

    run_summary = {
        "repo_url": repo_url,
        "branch_name": branch_name if commit_hash else "",
        "base_branch": initial_state["branch"],
        "total_failures": final_state.get("total_failures_detected", 0),
        "total_fixes": total_fixes,
        "total_commits": total_commits,
        "final_status": "PASSED" if passed else "FAILED",
        "time_taken_seconds": round(time_taken, 2),
    }

    # Merge run-level trace entries (session/commit) with graph-level trace
    full_debug_trace = run_debug_trace[:1] + final_state.get("debug_trace", []) + run_debug_trace[1:]

    return {
        "session_id": session_id,
        "status": "passed" if passed else ("partial_fix" if total_fixes > 0 else "failed"),
        "passed": passed,
        "iterations": final_state["iteration"],
        "message": "All tests passing." if passed else f"{len(errors_remaining)} error(s) remain.",
        "run_summary": run_summary,
        "fixes_applied": final_state["fixes_applied"],
        "ci_timeline": final_state["ci_timeline"],
        "commit_hash": commit_hash,
        "branch_name": branch_name if commit_hash else None,
        "errors_remaining": errors_remaining,
        "debug_trace": full_debug_trace,
    }


async def _commit_verified_fixes(
    client: EC2Client,
    session_id: str,
    final_state: dict[str, Any],
    branch_name: str,
    run_debug_trace: list[dict[str, Any]],
) -> tuple[str | None, int]:
    """Commit each file with a verified fix (one commit per file). Returns (last hash, count)."""
    by_file: dict[str, list[dict[str, Any]]] = {}
    for fix in final_state["fixes_applied"]:
        if fix.get("status") == "fixed":
            by_file.setdefault(fix["file"], []).append(fix)

    logger.info(f"[RUNNER] ▶ STEP 3: committing verified fixes ({len(by_file)} files)")
    commit_hash: str | None = None
    total_commits = 0

    for file_path, fixes in by_file.items():
        commit_msg = (
            fixes[0]["commit_message"] if len(fixes) == 1
            else f"[AI-AGENT] Fix {len(fixes)} failing tests in {file_path}"
        )
        logger.info(f"[RUNNER] committing {file_path}: {commit_msg}")
        t_commit = time.monotonic()
        try:
            commit_result = await client.commit_fix(
                session_id=session_id,
                file_path=file_path,
                commit_message=commit_msg,
                branch_name=branch_name,
            )
            commit_ms = (time.monotonic() - t_commit) * 1000
            commit_hash = commit_result.get("commit_hash")
            total_commits += 1
            logger.info(f"[RUNNER] commit: hash={commit_hash}  ({commit_ms:.0f}ms)")
            run_debug_trace.append({
                "stage": "commit_fix",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_ms": round(commit_ms),
                "request": {"session_id": session_id, "file_path": file_path, "commit_message": commit_msg, "branch_name": branch_name},
                "response": commit_result,
                "summary": f"commit {(commit_hash or '?')[:8]} — {file_path}",
            })
        except Exception as e:
            logger.error(f"[RUNNER] commit failed for {file_path}: {e}")
            run_debug_trace.append({
                "stage": "commit_fix",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_ms": 0,
                "request": {"file_path": file_path},
                "response": {"error": str(e)},
                "summary": f"FAILED — {file_path}: {e}",
            })

    return commit_hash, total_commits
