"""Docker client singleton manager."""

import logging

import docker
from docker.models.containers import Container

from src.core.exceptions import DockerContainerNotFoundError, DockerExecutionError

logger = logging.getLogger("ec2_agent")


class DockerManager:
    """Singleton Docker client manager."""

    _instance = None
    _client = None

    def __new__(cls):
        """Singleton pattern — one Docker client for the entire app."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize Docker client (lazy-loaded)."""
        if self._client is None:
            try:
                self._client = docker.from_env()
                logger.info("Docker client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Docker client: {e}")
                raise DockerExecutionError(f"Cannot connect to Docker daemon: {e}")

    def ping(self) -> bool:
        """Ping Docker daemon to check connectivity."""
        try:
            self._client.ping()
            return True
        except Exception as e:
            logger.error(f"Docker ping failed: {e}")
            raise DockerExecutionError(f"Docker daemon not responding: {e}")

    def get_container(self, name: str) -> Container:
        """Get a container by name.

        Raises DockerContainerNotFoundError if not found or not running.
        """
        try:
            container = self._client.containers.get(name)
            if container.status != "running":
                raise DockerContainerNotFoundError(
                    f"Container '{name}' exists but is not running (status: {container.status})"
                )
            return container
        except docker.errors.NotFound:
            raise DockerContainerNotFoundError(
                f"Container '{name}' not found. Please ensure long-running containers are created."
            )
        except docker.errors.APIError as e:
            raise DockerExecutionError(f"Docker API error: {e}")