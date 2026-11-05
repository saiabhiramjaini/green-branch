"""Session endpoints — Redis-backed CRUD + DELETE with repo cleanup."""

import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.models import CreateSessionRequest
from src.services.git_service import GitService
from src.services.session_store import session_store

router = APIRouter(tags=["Session"])


@router.post("/sessions", status_code=201)
@handle_endpoint
async def create_session(request: CreateSessionRequest):
    """Clone repo and create a new session.

    Clones ``request.branch`` if given, otherwise the repository's default branch.
    The GitHub token is only used for the clone and is never stored.
    """
    session_id = str(uuid.uuid4())

    git_service = GitService()
    # Cloning can take a while; keep the event loop free for other requests
    repo_path = await asyncio.to_thread(
        git_service.clone_repo,
        request.repo_url,
        session_id,
        branch=request.branch,
        github_token=request.github_token,
    )

    session_data = {
        "session_id": session_id,
        "user_id": request.user_id or "anonymous",
        "status": "cloned",
        "repo_url": request.repo_url,
        "language": request.language,
        "branch": git_service.get_current_branch(session_id),
        "repo_path": str(repo_path),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    session_store.create(session_id, session_data)
    return session_data


@router.get("/sessions/{session_id}")
@handle_endpoint
async def get_session(session_id: str):
    """Get session details."""
    return session_store.get(session_id)


@router.get("/sessions")
@handle_endpoint
async def list_sessions(user_id: str | None = None):
    """List all sessions, optionally filtered by user_id.

    Args:
        user_id: Optional - filter sessions by user

    Returns:
        List of sessions with count
    """
    if user_id:
        sessions = session_store.list_by_user(user_id)
    else:
        sessions = session_store.list_all()

    return {"sessions": sessions, "count": len(sessions)}


@router.delete("/sessions/{session_id}")
@handle_endpoint
async def delete_session(session_id: str):
    """Delete a session and clean up its cloned repository.

    This performs two operations:
    1. Removes the session from Redis
    2. Deletes the cloned repo directory from disk
    """
    # Get session first (raises SessionNotFoundError if missing)
    session_data = session_store.get(session_id)

    # Clean up cloned repo from filesystem
    git_service = GitService()
    await asyncio.to_thread(git_service.cleanup_session, session_id)

    # Delete from Redis (session + indexes)
    session_store.delete(session_id)

    return {
        "message": f"Session {session_id} deleted",
        "repo_cleaned": True,
        "repo_url": session_data.get("repo_url"),
    }