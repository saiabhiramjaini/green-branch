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

    repo_url: str = Field(..., description="GitHub repository URL to clone")
    session_id: str = Field(..., min_length=1, max_length=100, description="Unique session identifier")
    language: str = Field(..., description="Project language: python or nodejs")
    branch: str = Field(default="main", description="Branch to clone")

    class Config:
        json_schema_extra = {
            "example": {
                "repo_url": "https://github.com/user/repo",
                "session_id": "abc123",
                "language": "python",
                "branch": "main",
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