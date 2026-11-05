"""Agent run endpoint — triggers the full healing pipeline."""

from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.models import (
    AgentRunRequest,
    AgentRunResponse,
    FixApplied,
    CITimelineEntry,
    RunSummary,
    StartRunRequest,
    StartRunResponse,
)
from src.app.config import api_settings
from src.runner.agent_runner import run_agent
from src.services.run_store import run_store

router = APIRouter(tags=["Agent"])


@router.post("/agent/run", response_model=AgentRunResponse, status_code=202)
@handle_endpoint
async def agent_run(request: AgentRunRequest) -> AgentRunResponse:
    """
    Clone a GitHub repo, run the LangGraph healing loop,
    commit verified fixes to a fix branch, and return the run report.
    """
    result = await run_agent(
        repo_url=request.repo_url,
        language=request.language,
        branch_name=request.branch_name,
        install_command=request.install_command,
        test_command=request.test_command,
        branch=request.branch,
        max_iterations=request.max_iterations,
    )

    return AgentRunResponse(
        session_id=result["session_id"],
        status=result["status"],
        passed=result["passed"],
        iterations=result["iterations"],
        message=result["message"],
        run_summary=RunSummary(**result["run_summary"]),
        fixes_applied=[FixApplied(**f) for f in result["fixes_applied"]],
        ci_timeline=[CITimelineEntry(**e) for e in result["ci_timeline"]],
        commit_hash=result.get("commit_hash"),
        branch_name=result.get("branch_name"),
        errors_remaining=result.get("errors_remaining", []),
        debug_trace=result.get("debug_trace", []),
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
