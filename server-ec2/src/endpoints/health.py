from fastapi import APIRouter

from src.app.handlers import handle_endpoint
from src.core.docker_manager import DockerManager

router = APIRouter(tags=["Health"])


@router.get("/health")
@handle_endpoint
async def health_check():
    """Basic health check."""
    return {"status": "healthy", "service": "ec2-agent"}


@router.get("/health/docker")
@handle_endpoint
async def docker_health():
    """Check Docker daemon connectivity."""
    docker = DockerManager()
    docker.ping()
    return {
        "status": "healthy",
        "docker": "connected",
    }