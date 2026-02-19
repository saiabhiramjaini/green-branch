"""EC2 Agent configuration — Pydantic BaseSettings"""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


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
        default=["*"],
        description="Allowed CORS origins",
    )

    # ── Docker container names ──
    python_container: str = Field(
        default="python-executor",
        description="Name of the long-running Python Docker container",
    )
    node_container: str = Field(
        default="node-executor",
        description="Name of the long-running Node.js Docker container",
    )

    # ── Paths ──
    repos_base_path: str = Field(
        default="/home/ubuntu/repos",
        description="Base path where cloned repos are stored on EC2",
    )

    # ── Auth ──
    api_key: str = Field(
        default="",
        description="API key for authenticating requests from main backend",
    )

    @field_validator("log_level")
    @classmethod
    def lowercase_log_level(cls, v: str) -> str:
        """Convert log level to lowercase (uvicorn requirement)."""
        return v.lower()

    model_config = {
        "env_prefix": "EC2_AGENT_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


# Global singleton — import this everywhere
api_settings = ApiSettings()