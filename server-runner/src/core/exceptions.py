"""Custom exceptions for the runner.

Each exception has a `status_code` attribute that the
@handle_endpoint decorator reads to return the correct HTTP status.
"""


class DockerContainerNotFoundError(Exception):
    """Raised when a Docker executor container is not running."""
    status_code = 503  # Service Unavailable


class DockerExecutionError(Exception):
    """Raised when a command fails inside a Docker container."""
    status_code = 500


class RepositoryCloneError(Exception):
    """Raised when git clone fails."""
    status_code = 400


class RepositoryNotFoundError(Exception):
    """Raised when the cloned repo path does not exist."""
    status_code = 404


class TestExecutionError(Exception):
    """Raised when test runner fails unexpectedly."""
    status_code = 500


class UnsupportedLanguageError(Exception):
    """Raised when the requested language is not supported."""
    status_code = 422  # Unprocessable Entity


class SessionNotFoundError(Exception):
    """Raised when a session ID does not exist."""
    status_code = 404


class SessionAlreadyExistsError(Exception):
    """Raised when trying to create a session that already exists."""
    status_code = 409  # Conflict


class AuthenticationError(Exception):
    """Raised when API key is missing or invalid."""
    status_code = 401


class InvalidFilePathError(Exception):
    """Raised when a file path escapes the session repo or targets .git."""
    status_code = 400


class GitPushError(Exception):
    """Raised when pushing a commit to the remote fails."""
    status_code = 502


class ExecutorUnavailableError(Exception):
    """Raised when the local executor is missing a tool it needs (bash, npm, python3)."""
    status_code = 503


class RepositoryNotAllowedError(Exception):
    """Raised when a repo's owner is not in RUNNER_ALLOWED_REPO_OWNERS."""
    status_code = 403
