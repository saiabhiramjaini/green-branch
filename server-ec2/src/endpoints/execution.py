from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.models import ExecuteTestsRequest
from src.services.test_runner import TestRunner
from src.services.session_store import session_store

router = APIRouter(tags=["Execution"])


@router.post("/execute")
@handle_endpoint
async def execute_tests(request: ExecuteTestsRequest):
    """Run tests for a session."""
    # Validate session exists (raises SessionNotFoundError if missing)
    session = session_store.get(request.session_id)

    # Update session status
    session_store.update(request.session_id, {"status": "running"})

    # Run tests via TestRunner
    test_runner = TestRunner()
    result = test_runner.run_tests(
        session_id=request.session_id,
        language=session["language"],
        install_command=request.install_command,
        test_command=request.test_command,
    )

    # Update session status based on result
    new_status = "completed" if result.status == "success" else "failed"
    session_store.update(request.session_id, {"status": new_status})

    return result
