"""Custom exceptions for the GreenBranch server."""


class RunnerError(Exception):
    """Raised when server-runner returns an error.

    ``detail`` holds the runner's own (user-facing) error message.
    """
    status_code = 502  # Bad Gateway

    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        self.detail = detail or message


class RunnerUnreachable(Exception):
    """Raised when server-runner cannot be reached."""
    status_code = 503


class LLMError(Exception):
    """Raised when LLM call fails."""
    status_code = 500


class FixGenerationError(Exception):
    """Raised when a usable fix cannot be produced for an error (bad LLM output, missing file)."""
    status_code = 500


class PipelineAborted(Exception):
    """Raised when the run cannot continue (clone failed, no tests found, test runner down)."""
    status_code = 422

    def __init__(self, message: str, step: str | None = None):
        super().__init__(message)
        self.step = step
