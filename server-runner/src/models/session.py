"""Pydantic models for session management."""

from typing import Literal

from pydantic import BaseModel, Field

# Only public GitHub https URLs: the GitHub token is embedded into the clone URL,
# so any other host would receive the user's token.
GITHUB_REPO_URL_PATTERN = r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?(\.git)?/?$"

# Git ref names we accept: no leading "-" (would be parsed as a git option), no spaces.
BRANCH_NAME_PATTERN = r"^[A-Za-z0-9_.][A-Za-z0-9_./-]{0,199}$"


class CreateSessionRequest(BaseModel):
    """Request body for POST /sessions — clone a repo into a new session."""

    repo_url: str = Field(..., pattern=GITHUB_REPO_URL_PATTERN, description="GitHub repository URL (https)")
    language: Literal["python", "nodejs"] = Field(..., description="Project language")
    branch: str | None = Field(
        default=None,
        pattern=BRANCH_NAME_PATTERN,
        description="Branch to clone. Defaults to the repository's default branch.",
    )
    user_id: str | None = Field(default=None, description="Optional user identifier (email, username, etc.)")
    github_token: str | None = Field(default=None, description="GitHub OAuth token for private repo access")



class SessionResponse(BaseModel):
    """Response body for GET /sessions/{session_id}."""

    session_id: str = Field(..., description="Session identifier")
    user_id: str = Field(default="anonymous", description="User who created this session")
    status: str = Field(..., description="Session status: active, completed, error")
    repo_url: str = Field(default="", description="Repository URL")
    language: str = Field(default="", description="Project language")
    branch: str = Field(default="", description="Branch checked out in the session repo")
    repo_path: str = Field(default="", description="Path where the repo is cloned")
    created_at: str = Field(default="", description="ISO timestamp of session creation")