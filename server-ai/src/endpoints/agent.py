"""Agent run endpoints — start a streaming run, or run the pipeline and wait for the report."""

from fastapi import APIRouter

from src.app.config import api_settings
from src.app.handlers import handle_endpoint
from src.models import (
    AgentRunRequest,
    AgentRunResponse,
    CITimelineEntry,
    FixApplied,
    RunSummary,
    StartRunRequest,
    StartRunResponse,
)
from src.runner.streaming_runner import run_streaming
from src.services.run_store import run_store

router = APIRouter(tags=["Agent"])


@router.post("/agent/run", response_model=AgentRunResponse)
@handle_endpoint
async def agent_run(request: AgentRunRequest) -> AgentRunResponse:
    """Clone the repo, run the healing pipeline, commit verified fixes and open a PR
    (when a GitHub token is given), then return the full report.

    Same pipeline as the WebSocket run, without live events — for scripts and CLIs.
    The request stays open until the run ends, which can take several minutes.
    """
    result = await run_streaming(**request.model_dump())

    errors_remaining = result["errors_remaining"]
    return AgentRunResponse(
        session_id=result["session_id"],
        status=result["status"],
        passed=result["passed"],
        iterations=result["iterations"],
        message="All tests passing." if result["passed"] else f"{len(errors_remaining)} error(s) remain.",
        run_summary=RunSummary(
            repo_url=result["repo_url"],
            branch_name=result["branch_name"] or "",
            base_branch=result["base_branch"],
            total_failures=result["total_failures"],
            total_fixes=result["total_fixed"],
            total_commits=result["total_commits"],
            final_status="PASSED" if result["passed"] else "FAILED",
            time_taken_seconds=result["time_taken_seconds"],
        ),
        fixes_applied=[FixApplied(**f) for f in result["fixes_applied"]],
        ci_timeline=[CITimelineEntry(**e) for e in result["ci_timeline"]],
        commit_hash=result["commit_hash"],
        branch_name=result["branch_name"],
        pr_url=result["pr_url"],
        errors_remaining=errors_remaining,
    )


@router.post("/agent/runs", response_model=StartRunResponse, status_code=201)
@handle_endpoint
async def start_run(request: StartRunRequest) -> StartRunResponse:
    """Register a streaming run and return a single-use id for ``/agent/ws?run_id=…``.

    Called server-to-server by the frontend's backend, so the GitHub token never
    reaches the browser or the WebSocket URL.
    """
    run_id = run_store.create(request.model_dump())
    return StartRunResponse(run_id=run_id, expires_in=api_settings.run_ticket_ttl)
