"""Pull Request creation endpoint — uses GitHub API to create PRs."""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.app.handlers import handle_endpoint
from src.services.github import create_pull_request

router = APIRouter(tags=["Pull Request"])


class CreatePRRequest(BaseModel):
    """Request body for POST /pr — create a GitHub Pull Request."""

    repo_full_name: str = Field(..., pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", description="Full repo name (owner/repo)")
    branch_name: str = Field(..., description="Head branch name with the fixes")
    base_branch: str = Field(default="main", description="Base branch to merge into")
    title: str = Field(..., description="PR title")
    body: str = Field(default="", description="PR description body")
    github_token: str = Field(..., description="GitHub OAuth access token")


class CreatePRResponse(BaseModel):
    """Response for PR creation."""

    success: bool
    pr_url: Optional[str] = None
    pr_number: Optional[int] = None
    message: str = ""


@router.post("/pr", response_model=CreatePRResponse)
@handle_endpoint
async def create_pull_request_endpoint(request: CreatePRRequest) -> CreatePRResponse:
    """Create a Pull Request on GitHub from the AI fix branch to the base branch."""
    result = await create_pull_request(
        repo_full_name=request.repo_full_name,
        head=request.branch_name,
        base=request.base_branch,
        title=request.title,
        body=request.body,
        github_token=request.github_token,
    )
    return CreatePRResponse(**vars(result))
