"""GitHub REST API helpers."""

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx

logger = logging.getLogger("greenbranch")

GITHUB_API = "https://api.github.com"


@dataclass
class PullRequestResult:
    success: bool
    pr_url: str | None = None
    pr_number: int | None = None
    message: str = ""


class GitHubAPIError(Exception):
    """Raised when GitHub returns an unexpected error."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def repo_full_name_from_url(repo_url: str) -> str:
    """https://github.com/owner/repo(.git) → owner/repo"""
    clean = repo_url.rstrip("/")
    if clean.endswith(".git"):
        clean = clean[:-4]
    return "/".join(clean.split("/")[-2:])


def default_branch_name(repo_url: str) -> str:
    """A fresh fix branch per run, e.g. ``greenbranch/fix-my-repo-20261106-142530``.

    Unique names mean a re-run never collides with a branch pushed by an earlier run.
    """
    repo = repo_full_name_from_url(repo_url).split("/")[-1].lower()
    repo = re.sub(r"[^a-z0-9._-]+", "-", repo).strip("-.") or "repo"
    return f"greenbranch/fix-{repo}-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"


async def create_pull_request(
    *,
    repo_full_name: str,
    head: str,
    base: str,
    title: str,
    body: str,
    github_token: str,
) -> PullRequestResult:
    """Open a pull request from *head* into *base*.

    Returns ``success=False`` with GitHub's message for 422s (PR already exists,
    no diff, ...). Raises GitHubAPIError for other failures.
    """
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload = {"title": title, "body": body, "head": head, "base": base}

    logger.info(f"[PR] Creating PR: {repo_full_name} {head} → {base}")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(f"{GITHUB_API}/repos/{repo_full_name}/pulls", json=payload, headers=headers)
    except httpx.HTTPError as e:
        logger.error(f"[PR] Cannot reach GitHub API: {e}")
        raise GitHubAPIError(f"Cannot reach GitHub API: {e}", status_code=502)

    if response.status_code == 201:
        data = response.json()
        logger.info(f"[PR] Created successfully: {data.get('html_url')}")
        return PullRequestResult(
            success=True,
            pr_url=data.get("html_url"),
            pr_number=data.get("number"),
            message=f"Pull request #{data.get('number')} created successfully",
        )

    if response.status_code == 422:
        # Often means PR already exists or no diff
        data = response.json()
        message = data.get("message", "")
        errors = data.get("errors", [])
        if errors:
            message = errors[0].get("message", message)
        logger.warning(f"[PR] GitHub 422: {message}")
        return PullRequestResult(success=False, message=f"Cannot create PR: {message}")

    detail = response.text[:500]
    logger.error(f"[PR] GitHub API error {response.status_code}: {detail}")
    raise GitHubAPIError(f"GitHub API error: {detail}", status_code=response.status_code)
