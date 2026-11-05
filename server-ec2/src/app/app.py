import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.config import api_settings
from src.app.security import require_api_key
from src.endpoints import (
    health_router,
    session_router,
    execution_router,
    streaming_execution_router,
    fix_router,
    files_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    # --- Startup ---
    print(f"{api_settings.app_name} v{api_settings.version} starting...")
    print(f"Repos path: {api_settings.repos_base_path}")

    # Local mode has no sandbox: only run code from repos whose owners were explicitly allowed
    if api_settings.executor == "local" and not api_settings.allowed_repo_owners:
        if not api_settings.debug:
            raise RuntimeError(
                "EC2_AGENT_EXECUTOR=local requires EC2_AGENT_ALLOWED_REPO_OWNERS "
                "(comma-separated GitHub users/orgs whose repos may be cloned)"
            )
        print("WARNING: local executor with no EC2_AGENT_ALLOWED_REPO_OWNERS — any repo can run code here (debug mode)")

    # Verify the executor can run commands (Docker reachable / bash available)
    from src.services.executors import get_executor
    details = get_executor().check()
    print(f"Executor ready: {details}")
    if api_settings.allowed_repo_owners:
        print(f"Allowed repo owners: {', '.join(api_settings.allowed_repo_owners)}")

    # Verify Redis connectivity on startup
    from src.services.session_store import session_store
    session_store.ping()
    print(f"Redis connected (TTL={api_settings.session_ttl}s)")

    if not api_settings.api_key:
        if api_settings.debug:
            print("WARNING: EC2_AGENT_API_KEY is not set — authentication disabled (debug mode)")
        else:
            print("WARNING: EC2_AGENT_API_KEY is not set — all authenticated endpoints will return 503")

    # Periodically delete cloned repos whose session has expired
    from src.services.cleanup import run_cleanup_loop
    cleanup_task = asyncio.create_task(run_cleanup_loop())

    yield  # App is running

    # --- Shutdown ---
    cleanup_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await cleanup_task
    from src.services.session_store import session_store as _store
    _store.close()
    print("Redis connection closed")
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
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Register Routers ---
    api_prefix = "/api/v1"

    # Health stays public (load balancer / uptime probes); everything else needs the API key
    app.include_router(health_router, prefix=api_prefix)

    authenticated = [Depends(require_api_key)]
    app.include_router(session_router, prefix=api_prefix, dependencies=authenticated)
    app.include_router(execution_router, prefix=api_prefix, dependencies=authenticated)
    app.include_router(streaming_execution_router, prefix=api_prefix, dependencies=authenticated)
    app.include_router(fix_router, prefix=api_prefix, dependencies=authenticated)
    app.include_router(files_router, prefix=api_prefix, dependencies=authenticated)

    return app