from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from concurrent.futures import ThreadPoolExecutor

from src.app.config import settings


app = FastAPI(
    title=settings.APP_NAME,
    description="API server for Agentic AI POC",
    version=settings.VERSION,
    debug=settings.DEBUG,
)

# ---------------------------------------------------------
# CORS Middleware
# ---------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOW_ORIGINS,
    allow_credentials=settings.get("CORS_ALLOW_CREDENTIALS", False),
    allow_methods=settings.get("CORS_ALLOW_METHODS", ["GET"]),
    allow_headers=settings.get("CORS_ALLOW_HEADERS", []),
)

# API Router with prefix from settings
api_router = APIRouter(prefix=settings.API_PREFIX)


@api_router.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint to verify the service is running."""
    return JSONResponse(
        content={
            "status": "ok",
            "service": settings.APP_NAME,
            "version": settings.VERSION,
        }
    )

app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        log_level=settings.LOG_LEVEL.lower(),
    )