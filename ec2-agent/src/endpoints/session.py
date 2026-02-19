from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.services.git_service import GitService

router = APIRouter(tags=["Session"])

# In-memory session store (simple dict for hackathon)
sessions: dict = {}


@router.post("/sessions", status_code=201)
@handle_endpoint
async def create_session(repo_url: str, language: str):
    """Clone repo and create a new session."""
    import uuid
    from datetime import datetime, timezone

    session_id = str(uuid.uuid4())

    # Check if already exists (edge case)
    if session_id in sessions:
        from src.core.exceptions import SessionAlreadyExistsError
        raise SessionAlreadyExistsError(session_id)

    git_service = GitService()
    repo_path = git_service.clone_repo(repo_url, session_id)

    sessions[session_id] = {
        "session_id": session_id,
        "status": "cloned",
        "repo_url": repo_url,
        "language": language,
        "repo_path": str(repo_path),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return sessions[session_id]


@router.get("/sessions/{session_id}")
@handle_endpoint
async def get_session(session_id: str):
    """Get session details."""
    if session_id not in sessions:
        from src.core.exceptions import SessionNotFoundError
        raise SessionNotFoundError(session_id)

    return sessions[session_id]