"""Pydantic models for the RIFT 2026 Hackathon agent."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Request ──────────────────────────────────────────────────────────────────

class AgentRunRequest(BaseModel):
    """Request body for POST /agent/run."""

    repo_url: str = Field(..., description="GitHub repository URL")
    language: str = Field(..., description="Project language: python or nodejs")
    team_name: str = Field(..., description="Team name (e.g. RIFT ORGANISERS)")
    team_leader_name: str = Field(..., description="Team leader name (e.g. Saiyam Kumar)")
    install_command: str | None = Field(default=None, description="Custom install command")
    test_command: str | None = Field(default=None, description="Custom test command")
    branch: str = Field(default="main", description="Branch to clone and test")
    max_iterations: int | None = Field(default=None, description="Override max iterations")


# ── Sub-models for response ──────────────────────────────────────────────────

class FixApplied(BaseModel):
    """One row in the Fixes Applied table."""

    file: str = Field(..., description="File path that was fixed")
    bug_type: str = Field(..., description="LINTING | SYNTAX | LOGIC | TYPE_ERROR | IMPORT | INDENTATION")
    line_number: int | None = Field(default=None, description="Line number of the error")
    commit_message: str = Field(default="", description="Commit message for this fix")
    status: str = Field(default="fixed", description="fixed | failed")


class CITimelineEntry(BaseModel):
    """One row in the CI/CD Timeline."""

    iteration: int = Field(..., description="Iteration number (1-indexed)")
    status: str = Field(..., description="passed | failed")
    errors_count: int = Field(default=0, description="Number of errors in this run")
    fixes_applied: int = Field(default=0, description="Fixes applied in this iteration")
    timestamp: str = Field(default="", description="ISO timestamp of this run")


class ScoreBreakdown(BaseModel):
    """Score breakdown per hackathon rules."""

    base_score: int = Field(default=100)
    speed_bonus: int = Field(default=0, description="+10 if < 5 minutes")
    efficiency_penalty: int = Field(default=0, description="-2 per commit over 20")
    total_commits: int = Field(default=0)
    final_score: int = Field(default=100)


class RunSummary(BaseModel):
    """Run summary card for the dashboard."""

    repo_url: str
    team_name: str
    team_leader_name: str
    branch_name: str = Field(default="", description="TEAM_NAME_LEADER_AI_Fix")
    total_failures: int = Field(default=0)
    total_fixes: int = Field(default=0)
    final_status: str = Field(default="FAILED", description="PASSED or FAILED")
    time_taken_seconds: float = Field(default=0.0)


# ── Response ─────────────────────────────────────────────────────────────────

class AgentRunResponse(BaseModel):
    """Full response for POST /agent/run — everything the dashboard needs."""

    session_id: str
    status: str = Field(..., description="passed | failed | partial_fix")
    passed: bool
    iterations: int
    message: str = ""

    # Dashboard sections
    run_summary: RunSummary
    score_breakdown: ScoreBreakdown
    fixes_applied: list[FixApplied] = []
    ci_timeline: list[CITimelineEntry] = []

    # Git
    commit_hash: str | None = None
    branch_name: str | None = None
    errors_remaining: list[dict] = []

    # Full debug trace: every API call with request + response payloads
    debug_trace: list[dict] = Field(default_factory=list, description="Ordered list of API call events")
