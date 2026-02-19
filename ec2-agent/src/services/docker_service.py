"""Docker execution service — run commands in long-running containers."""

import logging
import time

from src.app.config import api_settings
from src.core.docker_manager import DockerManager
from src.core.exceptions import DockerExecutionError, UnsupportedLanguageError

logger = logging.getLogger("ec2_agent")


class DockerService:
    """Execute commands in pre-running Docker containers."""

    # Map language → container name
    CONTAINER_MAP: dict[str, str] = {
        "python": api_settings.python_container,
        "nodejs": api_settings.node_container,
    }

    # Map language → dependency install command
    INSTALL_COMMANDS: dict[str, str] = {
        "python": "pip install -r requirements.txt 2>&1 && pip install pytest 2>&1",
        "nodejs": "npm install 2>&1",
    }

    # Map language → test command
    TEST_COMMANDS: dict[str, str] = {
        "python": "python -m pytest -v --tb=short 2>&1",
        "nodejs": "npm test 2>&1",
    }

    def __init__(self):
        self.docker_manager = DockerManager()

    def get_container_name(self, language: str) -> str:
        """Get container name for a language. Raises UnsupportedLanguageError."""
        name = self.CONTAINER_MAP.get(language)
        if name is None:
            raise UnsupportedLanguageError(
                f"Language '{language}' is not supported. Supported: {list(self.CONTAINER_MAP.keys())}"
            )
        return name

    def exec_command(self, language: str, command: str, workdir: str) -> tuple[int, str]:
        """Execute a command in the appropriate container.

        Args:
            language: "python" or "nodejs"
            command: Shell command to execute
            workdir: Working directory inside the container

        Returns:
            Tuple of (exit_code, output_string)

        Raises:
            DockerContainerNotFoundError if container not running.
        """
        container_name = self.get_container_name(language)
        container = self.docker_manager.get_container(container_name)

        full_command = f"bash -c 'cd {workdir} && {command}'"
        logger.info(f"Executing in {container_name}: {command[:100]}...")

        start = time.time()
        exit_code, output = container.exec_run(full_command, demux=False)
        duration = time.time() - start

        output_str = output.decode("utf-8") if output else ""

        logger.info(
            f"Command finished: exit_code={exit_code}, "
            f"duration={duration:.2f}s, output_length={len(output_str)}"
        )

        return exit_code, output_str

    def install_dependencies(self, language: str, repo_path: str) -> tuple[int, str]:
        """Install project dependencies in the container.

        repo_path should be the container-visible path (e.g., /repos/session_abc).
        """
        install_cmd = self.INSTALL_COMMANDS.get(language)
        if install_cmd is None:
            raise UnsupportedLanguageError(f"No install command for '{language}'")

        logger.info(f"Installing dependencies for {language} at {repo_path}")
        return self.exec_command(language, install_cmd, repo_path)

    def run_tests(self, language: str, repo_path: str) -> tuple[int, str]:
        """Run tests in the container.

        Returns (exit_code, raw_test_output).
        exit_code 0 = all passed, non-zero = failures.
        """
        test_cmd = self.TEST_COMMANDS.get(language)
        if test_cmd is None:
            raise UnsupportedLanguageError(f"No test command for '{language}'")

        logger.info(f"Running tests for {language} at {repo_path}")
        return self.exec_command(language, test_cmd, repo_path)