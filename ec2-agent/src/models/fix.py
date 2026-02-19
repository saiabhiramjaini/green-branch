"""Pydantic models for apply-fix endpoint."""

from pydantic import BaseModel, Field


class ApplyFixRequest(BaseModel):
    """Request body for POST /apply-fix."""

    session_id: str = Field(..., description="Session identifier")
    file_path: str = Field(..., description="Relative path of file to fix")
    fix_content: str = Field(..., description="New content for the file (or patch)")
    commit_message: str = Field(
        ..., description="Commit message (should start with [AI-AGENT])"
    )
    branch_name: str = Field(..., description="Branch to commit and push to")


class ApplyFixResponse(BaseModel):
    """Response body from POST /apply-fix."""

    success: bool = Field(..., description="Whether the fix was applied successfully")
    commit_hash: str | None = Field(default=None, description="Git commit hash if successful")
    message: str = Field(default="", description="Status message")