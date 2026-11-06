"""Pydantic models for the agent endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

GITHUB_REPO_URL_PATTERN = r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?(\.git)?/?$"
BRANCH_NAME_PATTERN = r"^[A-Za-z0-9_.][A-Za-z0-9_./-]{0,199}$"


# ── Requests ─────────────────────────────────────────────────────────────────

class _RunOptions(BaseModel):
    """Options shared by streaming (POST /agent/runs) and blocking (POST /agent/run) runs."""

    repo_url: str = Field(..., pattern=GITHUB_REPO_URL_PATTERN, description="GitHub repository URL (https)")
    language: Literal["python", "nodejs"] = Field(..., description="Project language")
    install_command: str | None = Field(default=None, description="Custom install command")
    test_command: str | None = Field(default=None, description="Custom test command")
    branch_name: str | None = Field(
        default=None,
        pattern=BRANCH_NAME_PATTERN,
        description="Branch to commit fixes to (default: greenbranch/fix-<repo>-<timestamp>)",
    )
    max_iterations: int | None = Field(default=None, ge=1, le=10, description="Override max iterations")
    github_token: str | None = Field(default=None, description="GitHub OAuth token used to clone, push and open the PR")


class StartRunRequest(_RunOptions):
    """Request body for POST /agent/runs — register a streaming run."""

    session_id: str | None = Field(default=None, description="Existing session (repo already cloned)")


class AgentRunRequest(_RunOptions):
    """Request body for POST /agent/run — run the pipeline and wait for the report."""

    branch: str | None = Field(
        default=None,
        pattern=BRANCH_NAME_PATTERN,
        description="Branch to clone and test (default: the repository's default branch)",
    )


class StartRunResponse(BaseModel):
    """Response for POST /agent/runs."""

    run_id: str = Field(..., description="Single-use id for GET /agent/ws?run_id=…")
    expires_in: int = Field(..., description="Seconds until the run_id expires")


# ── Sub-models for response ──────────────────────────────────────────────────

class FixApplied(BaseModel):
    """One row in the Fixes Applied table."""

    file: str = Field(..., description="File path that was fixed")
    bug_type: str = Field(..., description="LINTING | SYNTAX | LOGIC | TYPE_ERROR | IMPORT | INDENTATION")
    line_number: int | None = Field(default=None, description="Line number of the error")
    commit_message: str = Field(default="", description="Commit message for this fix")
    status: str = Field(default="fixed", description="fixed | failed")
    description: str = Field(default="", description="Root cause, or why the fix failed")


class CITimelineEntry(BaseModel):
    """One row in the CI/CD Timeline."""

    iteration: int = Field(..., description="Iteration number (1-indexed)")
    status: str = Field(..., description="passed | failed")
    errors_count: int = Field(default=0, description="Number of errors in this run")
    fixes_applied: int = Field(default=0, description="Fixes applied in this iteration")
    timestamp: str = Field(default="", description="ISO timestamp of this run")


class RunSummary(BaseModel):
    """Run summary card for the dashboard."""

    repo_url: str
    branch_name: str = Field(default="", description="Branch the fixes were pushed to (empty if nothing was pushed)")
    base_branch: str = Field(default="", description="Branch that was cloned and tested")
    total_failures: int = Field(default=0)
    total_fixes: int = Field(default=0)
    total_commits: int = Field(default=0)
    final_status: str = Field(default="FAILED", description="PASSED or FAILED")
    time_taken_seconds: float = Field(default=0.0)


# ── Response ─────────────────────────────────────────────────────────────────

class AgentRunResponse(BaseModel):
    """Full response for POST /agent/run."""

    session_id: str
    status: str = Field(..., description="passed | failed | partial_fix")
    passed: bool
    iterations: int
    message: str = ""

    run_summary: RunSummary
    fixes_applied: list[FixApplied] = []
    ci_timeline: list[CITimelineEntry] = []

    commit_hash: str | None = None
    branch_name: str | None = None
    pr_url: str | None = None
    errors_remaining: list[dict] = []
