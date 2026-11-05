"""Custom exceptions for the GreenBranch server."""


class EC2AgentError(Exception):
    """Raised when ec2-agent returns an unexpected error.

    ``detail`` holds the agent's own (user-facing) error message.
    """
    status_code = 502  # Bad Gateway

    def __init__(self, message: str, detail: str | None = None):
        super().__init__(message)
        self.detail = detail or message


class EC2AgentUnreachable(Exception):
    """Raised when ec2-agent cannot be reached."""
    status_code = 503


class SessionCreationError(Exception):
    """Raised when session creation fails."""
    status_code = 500


class AgentRunError(Exception):
    """Raised when the LangGraph agent run fails."""
    status_code = 500


class LLMError(Exception):
    """Raised when LLM call fails."""
    status_code = 500


class UnsupportedLanguageError(Exception):
    """Raised when requested language is not supported."""
    status_code = 422


class FixGenerationError(Exception):
    """Raised when a usable fix cannot be produced for an error (bad LLM output, missing file)."""
    status_code = 500


class PipelineAborted(Exception):
    """Raised by the streaming pipeline when the run cannot continue (e.g. clone failed)."""
    status_code = 500

    def __init__(self, message: str, step: str | None = None):
        super().__init__(message)
        self.step = step
