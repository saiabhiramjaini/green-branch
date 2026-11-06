"""Main Server configuration — Pydantic BaseSettings."""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class ApiSettings(BaseSettings):
    """Main server settings."""

    # ── App metadata ──
    app_name: str = Field(default="GreenBranch Server", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")
    debug: bool = Field(default=False, description="Enable debug mode")

    # ── Server ──
    host: str = Field(default="0.0.0.0", description="Bind host")
    port: int = Field(default=8000, description="Port to listen on")
    uvicorn_workers: int = Field(default=1, description="Uvicorn worker processes")
    reload: bool = Field(default=False, description="Auto-reload on code changes")

    # ── Logging ──
    log_level: str = Field(default="info", description="Log level")

    # ── CORS ──
    cors_allow_origins: list[str] = Field(
        default=[],
        description="Allowed CORS origins (browsers only use the WebSocket, so none by default)",
    )

    # ── Auth ──
    api_key: str = Field(
        default="",
        description="API key required in the X-API-Key header. Empty = reject all requests unless debug is on.",
    )
    run_ticket_ttl: int = Field(
        default=120,
        description="Seconds a run ticket from POST /agent/runs stays valid for opening the WebSocket",
    )

    # ── Runner (server-runner) ──
    runner_url: str = Field(
        default="http://localhost:8001",
        description="Base URL of server-runner",
    )
    runner_api_key: str = Field(
        default="",
        description="API key for server-runner (its RUNNER_API_KEY)",
    )
    runner_timeout: float = Field(
        default=900.0,
        description="Seconds to wait on the runner; must cover a dependency install plus a test run",
    )

    # ── LLM (Groq) ──
    groq_api_key: str = Field(
        default="",
        description="Groq API key",
    )
    llm_model: str = Field(
        default="llama-3.3-70b-versatile",
        description="Groq model name",
    )
    llm_max_tokens: int = Field(default=4096, description="Max tokens per LLM call")
    llm_temperature: float = Field(default=0.2, description="LLM temperature")

    # ── Agent ──
    max_iterations: int = Field(
        default=5,
        description="Max test runs per pipeline (the first run plus one per fix attempt)",
    )

    @field_validator("log_level")
    @classmethod
    def lowercase_log_level(cls, v: str) -> str:
        return v.lower()

    model_config = {
        "env_prefix": "SERVER_",
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


# Global singleton
api_settings = ApiSettings()