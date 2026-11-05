import uvicorn

from src.app.config import api_settings


def main():
    """Entry point for the EC2 agent server."""
    uvicorn.run(
        "src.app.app:init_app",
        factory=True,
        host=api_settings.host,
        port=api_settings.port,
        workers=api_settings.uvicorn_workers,
        reload=api_settings.reload,
        log_level=api_settings.log_level,
    )


if __name__ == "__main__":
    main()