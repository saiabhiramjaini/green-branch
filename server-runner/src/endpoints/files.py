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

    # Raises InvalidFilePathError (400) if the path escapes the repo
    abs_path = GitService().resolve_file_path(session_id, file_path)

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
