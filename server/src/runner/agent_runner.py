"""agent_runner — full orchestration: session → graph → commit → score → results.json."""

import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.app.config import api_settings
from src.graph.healing_graph import build_graph
from src.services.ec2_client import EC2Client

logger = logging.getLogger("rift_server")


def _make_branch_name(team_name: str, leader_name: str) -> str:
    """
    Build branch name per hackathon rules:
    All UPPERCASE, spaces → underscores, ends with _AI_Fix.
    e.g. "RIFT ORGANISERS" + "Saiyam Kumar" → "RIFT_ORGANISERS_SAIYAM_KUMAR_AI_Fix"
    """
    clean = lambda s: re.sub(r"[^A-Z0-9_]", "", s.upper().replace(" ", "_"))
    return f"{clean(team_name)}_{clean(leader_name)}_AI_Fix"


def _calculate_score(
    total_commits: int,
    time_taken_seconds: float,
) -> dict[str, Any]:
    """Score per hackathon rules: base 100, +10 if <5min, -2 per commit over 20."""
    base = 100
    speed_bonus = 10 if time_taken_seconds < 300 else 0
    excess_commits = max(0, total_commits - 20)
    efficiency_penalty = excess_commits * 2
    final = max(0, base + speed_bonus - efficiency_penalty)
    return {
        "base_score": base,
        "speed_bonus": speed_bonus,
        "efficiency_penalty": efficiency_penalty,
        "total_commits": total_commits,
        "final_score": final,
    }


async def run_agent(
    repo_url: str,
    language: str,
    team_name: str,
    team_leader_name: str,
    install_command: str | None = None,
    test_command: str | None = None,
    branch: str = "main",
    max_iterations: int | None = None,
) -> dict[str, Any]:
    """
    End-to-end agent run:
    1. Create EC2 session (clone repo).
    2. Run LangGraph healing loop (test → select → fix → repeat).
    3. Commit each fixed file to branch TEAM_NAME_LEADER_AI_Fix.
    4. Calculate score, build results.json.
    5. Return everything the dashboard needs.
    """
    start_time = time.time()
    client = EC2Client()
    run_debug_trace: list[dict[str, Any]] = []  # collects non-graph stages

    # ── 1. Branch name ──
    branch_name = _make_branch_name(team_name, team_leader_name)
    logger.info(f"\n{'@'*60}")
    logger.info(f"[RUNNER] run_agent START")
    logger.info(f"[RUNNER] repo_url={repo_url}")
    logger.info(f"[RUNNER] language={language}  branch={branch}")
    logger.info(f"[RUNNER] team={team_name}  leader={team_leader_name}")
    logger.info(f"[RUNNER] branch_name={branch_name}")
    logger.info(f"{'@'*60}")

    # ── 2. Create session (clone repo) ──
    logger.info(f"[RUNNER] ▶ STEP 1: create_session")
    t_session = time.monotonic()
    session = await client.create_session(repo_url, language)
    session_ms = (time.monotonic() - t_session) * 1000
    session_id: str = session["session_id"]
    logger.info(f"[RUNNER] session created: id={session_id}  repo_path={session.get('repo_path')}  ({session_ms:.0f}ms)")

    run_debug_trace.append({
        "stage": "create_session",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_ms": round(session_ms),
        "request": {"repo_url": repo_url, "language": language},
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
        "branch": branch,
        "team_name": team_name,
        "team_leader_name": team_leader_name,
        "branch_name": branch_name,
        "install_command": install_command,
        "test_command": test_command,
        "errors": [],
        "passed": False,
        "current_error": None,
        "iteration": 0,
        "max_iterations": max_iterations or api_settings.max_iterations,
        "fixes_applied": [],
        "ci_timeline": [],
        "total_failures_detected": 0,
        "fixed_files": [],
        "commit_hash": None,
        "raw_output": "",
        "debug_trace": [],   # graph nodes will append to this
    }

    final_state: dict[str, Any] = await graph.ainvoke(initial_state)
    logger.info(
        f"[RUNNER] graph done: passed={final_state['passed']}  "
        f"iters={final_state['iteration']}  fixes={len(final_state['fixes_applied'])}  "
        f"trace_entries={len(final_state.get('debug_trace', []))}"
    )

    # ── 4. Commit all fixed files ──
    logger.info(f"[RUNNER] ▶ STEP 3: committing fixed files ({len(final_state['fixed_files'])} files)")
    commit_hash: str | None = None
    total_commits = 0

    if final_state["fixed_files"]:
        for fix in final_state["fixes_applied"]:
            if fix.get("status") != "fixed":
                continue
            file_path = fix["file"]
            commit_msg = fix.get("commit_message", f"[AI-AGENT] Fix {file_path}")
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
                logger.info(f"[RUNNER] commit: success={commit_result.get('success')}  hash={commit_result.get('commit_hash')}  ({commit_ms:.0f}ms)")
                if commit_result.get("success"):
                    commit_hash = commit_result.get("commit_hash")
                    total_commits += 1
                run_debug_trace.append({
                    "stage": "commit_fix",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "duration_ms": round(commit_ms),
                    "request": {"session_id": session_id, "file_path": file_path, "commit_message": commit_msg, "branch_name": branch_name},
                    "response": commit_result,
                    "summary": f"commit {commit_result.get('commit_hash','?')[:8]} — {file_path}",
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

    # ── 5. Timing & score ──
    time_taken = time.time() - start_time
    score = _calculate_score(total_commits, time_taken)
    logger.info(f"[RUNNER] score={score}  time_taken={time_taken:.1f}s  total_commits={total_commits}")

    # ── 6. Build result ──
    passed = final_state["passed"]
    total_fixes = len([f for f in final_state["fixes_applied"] if f["status"] == "fixed"])
    errors_remaining = final_state["errors"]

    logger.info(f"[RUNNER] final: passed={passed}  total_fixes={total_fixes}  errors_remaining={len(errors_remaining)}")

    run_summary = {
        "repo_url": repo_url,
        "team_name": team_name,
        "team_leader_name": team_leader_name,
        "branch_name": branch_name,
        "total_failures": final_state.get("total_failures_detected", 0),
        "total_fixes": total_fixes,
        "final_status": "PASSED" if passed else "FAILED",
        "time_taken_seconds": round(time_taken, 2),
    }

    # Merge run-level trace entries (session/commit) with graph-level trace
    full_debug_trace = run_debug_trace[:1] + final_state.get("debug_trace", []) + run_debug_trace[1:]

    result = {
        "session_id": session_id,
        "status": "passed" if passed else ("partial_fix" if total_fixes > 0 else "failed"),
        "passed": passed,
        "iterations": final_state["iteration"],
        "message": "All tests passing." if passed else f"{len(errors_remaining)} error(s) remain.",
        "run_summary": run_summary,
        "score_breakdown": score,
        "fixes_applied": final_state["fixes_applied"],
        "ci_timeline": final_state["ci_timeline"],
        "commit_hash": commit_hash,
        "branch_name": branch_name if commit_hash else None,
        "errors_remaining": errors_remaining,
        "debug_trace": full_debug_trace,
    }

    # ── 7. Write results.json ──
    try:
        results_path = Path("results.json")
        results_path.write_text(json.dumps(result, indent=2, default=str))
        logger.info(f"run_agent: results.json written to {results_path.resolve()}")
    except Exception as e:
        logger.error(f"run_agent: failed to write results.json: {e}")

    return result
