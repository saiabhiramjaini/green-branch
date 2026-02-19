from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.models import ExecuteTestsRequest
from src.services.test_runner import TestRunner
from src.endpoints.session import sessions

router = APIRouter(tags=["Execution"])


@router.post("/execute")
@handle_endpoint
async def execute_tests(request: ExecuteTestsRequest):
    """Run tests for a session."""
    from src.core.exceptions import SessionNotFoundError

    # Validate session exists
    if request.session_id not in sessions:
        raise SessionNotFoundError(request.session_id)

    session = sessions[request.session_id]

    # Update session status
    session["status"] = "running"

    # Run tests via TestRunner
    test_runner = TestRunner()
    result = test_runner.run_tests(
        repo_url=request.repo_url,
        session_id=request.session_id,
        language=request.language,
        branch=request.branch,
    )

    # Update session status based on result
    session["status"] = "completed" if result.status == "success" else "failed"

    return result