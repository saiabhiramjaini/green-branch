"""Pydantic models for session management."""

from pydantic import BaseModel, Field


class SessionResponse(BaseModel):
    """Response body for GET /sessions/{session_id}."""

    session_id: str = Field(..., description="Session identifier")
    status: str = Field(..., description="Session status: active, completed, error")
    repo_url: str = Field(default="", description="Repository URL")
    language: str = Field(default="", description="Project language")
    repo_path: str = Field(default="", description="Path on EC2 where repo is cloned")
    created_at: str = Field(default="", description="ISO timestamp of session creation")