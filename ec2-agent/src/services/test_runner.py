"""Test runner orchestrator — coordinates clone, test, and parse."""

import logging
import os
import time

from src.models.execution import ExecuteTestsRequest, ExecuteTestsResponse, TestError
from src.services.docker_service import DockerService
from src.services.git_service import GitService
from src.utils.parsers import parse_test_output

logger = logging.getLogger("ec2_agent")


class TestRunner:
    """Orchestrates the full test execution pipeline.

    Flow: clone repo → install deps → run tests → parse output → return results.
    """

    def __init__(self):
        self.git_service = GitService()
        self.docker_service = DockerService()

    def run_tests(
        self,
        repo_url: str,
        session_id: str,
        language: str,
        branch: str = "main",
        install_command: str | None = None,
        test_command: str | None = None,
    ) -> ExecuteTestsResponse:
        """Execute the full test pipeline.

        Args:
            repo_url: GitHub repository URL
            session_id: Unique session identifier
            language: "python" or "nodejs"
            branch: Git branch to clone
            install_command: Optional custom dependency install command
            test_command: Optional custom test execution command

        Returns:
            ExecuteTestsResponse with test results

        Pipeline:
        1. Clone the repository
        2. Install dependencies in Docker container
        3. Run tests in Docker container
        4. Parse the output for errors
        5. Return structured results
        """
        start_time = time.time()

        # 1. Get repo path (clone only if not already present)
        repo_path = self.git_service.get_repo_path(session_id)
        if not os.path.exists(repo_path):
            repo_path = self.git_service.clone_repo(
                repo_url=repo_url,
                session_id=session_id,
                branch=branch,
            )

        # Container sees repos at /repos/ (volume mount)
        container_repo_path = os.path.join("/repos", session_id)

        # 2. Install dependencies
        logger.info(f"Installing dependencies for {language}")
        install_exit, install_output = self.docker_service.install_dependencies(
            language=language,
            repo_path=container_repo_path,
            custom_command=install_command,
        )
        if install_exit != 0:
            logger.warning(f"Dependency install had issues: {install_output[:200]}")

        # 3. Run tests
        logger.info(f"Running tests for {language}")
        test_exit, test_output = self.docker_service.run_tests(
            language=language,
            repo_path=container_repo_path,
            custom_command=test_command,
        )

        # 4. Parse output
        errors = parse_test_output(test_output, language)

        # 5. Build response
        duration = time.time() - start_time
        passed = _count_passed(test_output, language)
        failed = len(errors)

        status = "success" if test_exit == 0 else "failed"

        logger.info(
            f"Test run complete: status={status}, passed={passed}, "
            f"failed={failed}, duration={duration:.2f}s"
        )

        return ExecuteTestsResponse(
            session_id=session_id,
            status=status,
            language=language,
            passed=passed,
            failed=failed,
            errors=errors,
            raw_output=test_output,
            duration=round(duration, 2),
        )


def _count_passed(output: str, language: str) -> int:
    """Extract number of passed tests from raw output."""
    if language == "python":
        # Pytest output: "8 passed, 2 failed in 1.23s"
        for line in output.splitlines():
            if "passed" in line:
                for part in line.split():
                    if part.isdigit():
                        return int(part)
    elif language == "nodejs":
        # Jest output: "Tests: 2 failed, 8 passed, 10 total"
        for line in output.splitlines():
            if "passed" in line.lower():
                parts = line.split()
                for i, part in enumerate(parts):
                    if "passed" in part.lower() and i > 0:
                        num = parts[i - 1].replace(",", "")
                        if num.isdigit():
                            return int(num)
    return 0