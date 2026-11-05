"""Test runner orchestrator — coordinates install, test, and parse."""

import logging
import time

from src.models.execution import ExecuteTestsResponse
from src.services.execution_service import ExecutionService
from src.services.git_service import GitService
from src.utils.parsers import count_passed, parse_test_output

logger = logging.getLogger("ec2_agent")


class TestRunner:
    """Orchestrates the full test execution pipeline.

    Flow: install deps → run tests → parse output → return results.
    The repo must already be cloned by POST /sessions.
    """

    def __init__(self):
        self.git_service = GitService()
        self.execution_service = ExecutionService()

    def run_tests(
        self,
        session_id: str,
        language: str,
        install_command: str | None = None,
        test_command: str | None = None,
    ) -> ExecuteTestsResponse:
        """Install dependencies, run the test suite and parse the results.

        Blocking — call it from a worker thread in async endpoints.

        Args:
            session_id: Unique session identifier
            language: "python" or "nodejs"
            install_command: Optional custom dependency install command
            test_command: Optional custom test execution command
        """
        start_time = time.time()

        # Raises RepositoryNotFoundError if the clone is gone
        self.git_service.require_repo_path(session_id)

        # 1. Install dependencies
        logger.info(f"Installing dependencies for {language}")
        install_exit, install_output = self.execution_service.install(session_id, language, install_command)
        if install_exit != 0:
            logger.warning(f"Dependency install had issues: {install_output[:200]}")

        # 2. Run tests
        logger.info(f"Running tests for {language}")
        test_exit, test_output = self.execution_service.run_tests(session_id, language, test_command)

        # 3. Parse output
        errors = parse_test_output(test_output, language)

        # 4. Build response
        duration = time.time() - start_time
        passed = count_passed(test_output, language)
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
