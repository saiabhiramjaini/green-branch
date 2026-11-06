"""Pydantic models for fix endpoints."""

from pydantic import BaseModel, Field

from src.models.session import BRANCH_NAME_PATTERN


class ApplyFixRequest(BaseModel):
    """Request body for POST /fix — apply changes locally and run tests."""

    session_id: str = Field(..., description="Session identifier")
    file_path: str = Field(..., description="Relative path of file to fix")
    fix_content: str = Field(..., description="New content for the file")
    install_command: str | None = Field(
        default=None, description="Optional custom install command"
    )
    test_command: str | None = Field(
        default=None, description="Optional custom test command"
    )
    run_tests: bool = Field(
        default=True,
        description="Run the test suite after writing the file. Set false when the caller re-runs tests itself.",
    )


class ApplyFixResponse(BaseModel):
    """Response body from POST /fix."""

    success: bool = Field(..., description="Tests passed after the fix (or file written, when run_tests=false)")
    file_updated: bool = Field(..., description="Whether file was written to disk")
    test_result: dict | None = Field(default=None, description="Test execution result (None when run_tests=false)")
    message: str = Field(default="", description="Status message")


class CommitFixRequest(BaseModel):
    """Request body for POST /commit — create branch, commit, and push."""

    session_id: str = Field(..., description="Session identifier")
    file_path: str = Field(..., description="Relative path of file to commit")
    commit_message: str = Field(
        ..., description="Commit message (should start with [AI-AGENT])"
    )
    branch_name: str = Field(
        default="fix/greenbranch",
        pattern=BRANCH_NAME_PATTERN,
        description="Branch name (default: fix/greenbranch)"
    )
    github_token: str | None = Field(
        default=None, description="GitHub OAuth token for authenticated push"
    )


class CommitFixResponse(BaseModel):
    """Response body from POST /commit."""

    success: bool = Field(..., description="Whether commit+push succeeded")
    commit_hash: str | None = Field(default=None, description="Git commit hash")
    branch_name: str = Field(..., description="Branch name")
    message: str = Field(default="", description="Status message")