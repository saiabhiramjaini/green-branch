"""Pydantic models for test execution endpoint."""

from pydantic import BaseModel, Field


class TestError(BaseModel):
    """A single test failure/error."""

    file: str = Field(..., description="File path where error occurred")
    line: int | None = Field(default=None, description="Line number of the error")
    error_type: str = Field(
        ..., description="Bug category: LINTING, SYNTAX, LOGIC, TYPE_ERROR, IMPORT, INDENTATION"
    )
    message: str = Field(..., description="Error message from test output")
    full_trace: str | None = Field(default=None, description="Full traceback if available")


class ExecuteTestsRequest(BaseModel):
    """Request body for POST /execute-tests."""

    session_id: str = Field(..., min_length=1, max_length=100, description="Unique session identifier")
    install_command: str | None = Field(
        default=None,
        description="Custom dependency installation command (optional). Uses smart defaults if not provided."
    )
    test_command: str | None = Field(
        default=None,
        description="Custom test execution command (optional). Uses smart defaults if not provided."
    )

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "abc123",
                "install_command": "uv pip install -r requirements.txt",
                "test_command": "uv run pytest -v",
            }
        }


class ExecuteTestsResponse(BaseModel):
    """Response body from POST /execute-tests."""

    session_id: str = Field(..., description="Session identifier")
    status: str = Field(..., description="Execution status: success, failed, error")
    language: str = Field(..., description="Detected/provided language")
    passed: int = Field(default=0, description="Number of tests passed")
    failed: int = Field(default=0, description="Number of tests failed")
    errors: list[TestError] = Field(default_factory=list, description="List of test errors")
    raw_output: str = Field(default="", description="Raw test output from container")
    duration: float = Field(default=0.0, description="Execution time in seconds")