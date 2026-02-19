"""Agent run endpoint — triggers the full healing pipeline."""

from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.models import (
    AgentRunRequest,
    AgentRunResponse,
    FixApplied,
    CITimelineEntry,
    ScoreBreakdown,
    RunSummary,
)
from src.runner.agent_runner import run_agent

router = APIRouter(tags=["Agent"])


@router.post("/agent/run", response_model=AgentRunResponse, status_code=202)
@handle_endpoint
async def agent_run(request: AgentRunRequest) -> AgentRunResponse:
    """
    Clone a GitHub repo, run the LangGraph healing loop,
    commit fixes to TEAM_NAME_LEADER_AI_Fix branch,
    and return comprehensive dashboard data.
    """
    result = await run_agent(
        repo_url=request.repo_url,
        language=request.language,
        team_name=request.team_name,
        team_leader_name=request.team_leader_name,
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
        score_breakdown=ScoreBreakdown(**result["score_breakdown"]),
        fixes_applied=[FixApplied(**f) for f in result["fixes_applied"]],
        ci_timeline=[CITimelineEntry(**e) for e in result["ci_timeline"]],
        commit_hash=result.get("commit_hash"),
        branch_name=result.get("branch_name"),
        errors_remaining=result.get("errors_remaining", []),
        debug_trace=result.get("debug_trace", []),
    )
