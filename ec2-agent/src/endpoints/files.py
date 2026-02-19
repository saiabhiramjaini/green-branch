"""Files endpoint — read file contents from a cloned session repo."""

import os

from fastapi import APIRouter, HTTPException, Query

from src.app.handlers import handle_endpoint
from src.services.git_service import GitService
from src.services.session_store import session_store

router = APIRouter(tags=["Files"])


@router.get("/files")
@handle_endpoint
async def read_file(
    session_id: str = Query(..., description="The session ID"),
    file_path: str = Query(..., description="Relative path of the file within the repo"),
):
    """Read the current contents of a file in a cloned session repo."""
    # Validate session
    session_store.get(session_id)  # raises SessionNotFoundError if missing

    git_service = GitService()
    repo_path = git_service.get_repo_path(session_id)

    abs_path = os.path.join(repo_path, file_path)
    abs_path = os.path.normpath(abs_path)

    # Security: ensure the resolved path is still inside the repo
    if not abs_path.startswith(os.path.normpath(repo_path)):
        raise HTTPException(status_code=400, detail="Invalid file path — path traversal not allowed")

    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail=f"File not found in session: {file_path}")

    with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    return {
        "session_id": session_id,
        "file_path": file_path,
        "content": content,
        "size_bytes": len(content.encode("utf-8")),
    }
