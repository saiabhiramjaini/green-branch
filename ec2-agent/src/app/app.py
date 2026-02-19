from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.config import api_settings
from src.endpoints import (
    health_router,
    session_router,
    execution_router,
    fix_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # --- Startup ---
    print(f"{api_settings.app_name} v{api_settings.version} starting...")
    print(f"Repos path: {api_settings.repos_base_path}")

    # Verify Docker connectivity on startup
    from src.core.docker_manager import DockerManager
    docker = DockerManager()
    docker.ping()
    print("Docker daemon connected")

    yield  # App is running

    # --- Shutdown ---
    print("Shutting down...")


def init_app() -> FastAPI:
    """Application factory — builds and returns the FastAPI app."""

    app = FastAPI(
        title=api_settings.app_name,
        version=api_settings.version,
        debug=api_settings.debug,
        lifespan=lifespan,
    )

    # --- CORS Middleware ---
    app.add_middleware(
        CORSMiddleware,
        allow_origins=api_settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Register Routers ---
    api_prefix = "/api/v1"

    app.include_router(health_router, prefix=api_prefix)
    app.include_router(session_router, prefix=api_prefix)
    app.include_router(execution_router, prefix=api_prefix)
    app.include_router(fix_router, prefix=api_prefix)

    return app