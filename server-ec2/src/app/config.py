"""EC2 Agent configuration — Pydantic BaseSettings"""

import os
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode


class ApiSettings(BaseSettings):
    """EC2 Agent server settings."""

    # ── App metadata ──
    app_name: str = Field(default="EC2 Agent", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Enable debug mode")

    # ── Server ──
    host: str = Field(
        default="0.0.0.0",
        description="Bind host: 127.0.0.1 for dev, 0.0.0.0 for prod.",
    )
    port: int = Field(default=8001, description="Port to listen on")
    uvicorn_workers: int = Field(
        default=1,
        description="Number of uvicorn worker processes.",
    )
    reload: bool = Field(
        default=False,
        description="Auto-reload on code changes. Only for local development.",
    )

    # ── Logging ──
    log_level: str = Field(default="info", description="Log level")

    # ── CORS ──
    cors_allow_origins: list[str] = Field(
        default=[],
        description="Allowed CORS origins (the agent is called server-to-server, so none by default)",
    )

    # ── Execution ──
    executor: Literal["docker", "local"] = Field(
        default="docker",
        description=(
            "Where install/test commands run. 'docker': inside the long-running executor "
            "containers (isolated). 'local': as plain processes on this machine, for hosts "
            "without Docker such as an Android phone. Local mode requires allowed_repo_owners."
        ),
    )
    allowed_repo_owners: Annotated[list[str], NoDecode] = Field(
        default=[],
        description=(
            "GitHub users/orgs whose repositories may be cloned (comma-separated). "
            "Empty = any owner, which is only accepted with the docker executor."
        ),
    )
    install_timeout: int = Field(default=600, description="Seconds before a dependency install is stopped")
    test_timeout: int = Field(default=300, description="Seconds before a test run is stopped")

    # ── Docker executor ──
    python_container: str = Field(
        default="python-executor",
        description="Name of the long-running Python Docker container",
    )
    node_container: str = Field(
        default="node-executor",
        description="Name of the long-running Node.js Docker container",
    )
    container_repos_path: str = Field(
        default="/repos",
        description="Path where repos are mounted inside the executor containers",
    )

    # ── Git ──
    commit_author_name: str = Field(default="GreenBranch", description="Author name on fix commits")
    commit_author_email: str = Field(
        default="greenbranch@users.noreply.github.com",
        description="Author email on fix commits",
    )

    # ── Paths ──
    repos_base_path: str = Field(
        default="/home/ubuntu/repos",
        description="Base path where cloned repos are stored on this machine",
    )

    # ── Redis ──
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Full Redis connection URL (redis://user:pass@host:port/db)",
    )
    session_ttl: int = Field(
        default=7200,
        description="Session TTL in seconds (default: 2 hours)",
    )
    cleanup_interval: int = Field(
        default=600,
        description="Seconds between sweeps that delete cloned repos whose session has expired",
    )

    # ── Auth ──
    api_key: str = Field(
        default="",
        description="API key required in the X-API-Key header. Empty = reject all requests unless debug is on.",
    )

    @field_validator("log_level")
    @classmethod
    def lowercase_log_level(cls, v: str) -> str:
        """Convert log level to lowercase (uvicorn requirement)."""
        return v.lower()

    @field_validator("allowed_repo_owners", mode="before")
    @classmethod
    def split_owners(cls, v: str | list[str]) -> list[str]:
        """Accept "a,b" from the environment; compare owners case-insensitively."""
        if isinstance(v, str):
            v = v.split(",")
        return [owner.strip().lower() for owner in v if owner.strip()]

    @field_validator("repos_base_path")
    @classmethod
    def expand_repos_path(cls, v: str) -> str:
        return os.path.expanduser(v)

    model_config = {
        "env_prefix": "EC2_AGENT_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


# Global singleton — import this everywhere
api_settings = ApiSettings()