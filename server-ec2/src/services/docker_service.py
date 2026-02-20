"""Docker execution service — run commands in long-running containers."""

import logging
import time
from typing import Generator

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

    @staticmethod
    def _normalize_test_command(cmd: str, host_repo_path: str | None = None) -> str:
        """Normalize a user-supplied test command before executing it.

        Handles three known problem cases:
        1. **Vitest explicit** — `vitest` without ``--run`` blocks forever in
           watch mode.  We inject ``--run`` automatically.
        2. **Vitest via npm** — `npm test` / `npm run test` that delegates to
           vitest. We detect this from ``package.json`` and swap the command
           to ``npx vitest --run`` so it exits after one pass.
        3. **pytest with an explicit dir** — ``pytest test/`` or ``pytest tests/``
           fails with "file or directory not found" when the path doesn't exist.
           We strip the path and let pytest auto-discover instead.
        """
        import json
        import re
        stripped = cmd.strip()

        # ── Vitest explicit: add --run [✓ catches `vitest`, `npx vitest`, etc.] ──
        if re.search(r'\bvitest\b', stripped, re.IGNORECASE):
            if '--run' not in stripped:
                stripped = re.sub(
                    r'(\bvitest\b)',
                    r'\1 --run',
                    stripped,
                    count=1,
                    flags=re.IGNORECASE,
                )
                logger.info(f"[normalize] Added --run to vitest command: {stripped}")
            return stripped

        # ── npm test / npm run test → check if underlying runner is vitest ──
        is_npm_test = bool(re.match(r'^npm\s+(run\s+)?test', stripped, re.IGNORECASE))
        if is_npm_test and host_repo_path:
            # host_repo_path may be the container-visible path (/repos/session_id).
            # Remap to the actual host path so we can read package.json from disk.
            try:
                from src.app.config import api_settings as _settings
                container_prefix = _settings.container_repos_path  # e.g. /repos
                if host_repo_path.startswith(container_prefix):
                    session_part = host_repo_path[len(container_prefix):].lstrip("/")
                    host_path = os.path.join(_settings.repos_base_path, session_part)
                else:
                    host_path = host_repo_path
            except Exception:
                host_path = host_repo_path

            pkg_path = os.path.join(host_path, "package.json")
            try:
                with open(pkg_path, "r", encoding="utf-8") as fh:
                    pkg = json.load(fh)
                # Check scripts.test and devDependencies / dependencies for vitest
                test_script = pkg.get("scripts", {}).get("test", "")
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                uses_vitest = "vitest" in test_script or "vitest" in deps
                if uses_vitest:
                    stripped = "npx vitest --run 2>&1"
                    logger.info(f"[normalize] Detected vitest via package.json, overriding: {stripped}")
                    return stripped
            except Exception as exc:
                logger.debug(f"[normalize] Could not read package.json: {exc}")


        # ── pytest: strip explicit test directory paths ───────────────────────
        if re.search(r'\bpytest\b', stripped, re.IGNORECASE):
            cleaned = re.sub(
                r'(?<=\s)(tests?/?)(?=\s|$)',
                '',
                ' ' + stripped,
            ).strip()
            if cleaned != stripped:
                logger.info(
                    f"[normalize] Stripped test dir from pytest command: "
                    f"{stripped!r} → {cleaned!r}"
                )
                stripped = cleaned

        return stripped

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

    def exec_command_streaming(
        self, language: str, command: str, workdir: str
    ) -> Generator[str, None, tuple[int, str]]:
        """Execute a command and yield output lines in real-time.

        Yields each line as it is produced by the container.
        After all lines are yielded, the full output and exit code
        can be obtained from the generator's return value.
        """
        container_name = self.get_container_name(language)
        container = self.docker_manager.get_container(container_name)

        full_command = f"bash -c 'cd {workdir} && {command}'"
        logger.info(f"[STREAM] Executing in {container_name}: {command[:100]}...")

        # Use Docker SDK's exec_create + exec_start for streaming + exit code
        exec_id = container.client.api.exec_create(
            container.id, full_command, stdout=True, stderr=True
        )
        stream = container.client.api.exec_start(exec_id, stream=True)

        all_output: list[str] = []
        buffer = ""
        for chunk in stream:
            text = chunk.decode("utf-8", errors="replace")
            buffer += text
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                all_output.append(line)
                yield line
        # Yield any remaining partial line
        if buffer.strip():
            all_output.append(buffer)
            yield buffer

        # Get the exit code
        inspect = container.client.api.exec_inspect(exec_id)
        exit_code = inspect.get("ExitCode", -1)
        full_output = "\n".join(all_output)

        logger.info(f"[STREAM] Command finished: exit_code={exit_code}, lines={len(all_output)}")
        return exit_code, full_output

    def install_dependencies(
        self, language: str, repo_path: str, custom_command: str | None = None
    ) -> tuple[int, str]:
        """Install project dependencies in the container.

        Args:
            language: "python" or "nodejs"
            repo_path: Container-visible path (e.g., /repos/session_abc)
            custom_command: Optional custom install command. If None, uses default.

        Returns:
            Tuple of (exit_code, output_string)
        """
        if custom_command:
            install_cmd = custom_command + " 2>&1"
            logger.info(f"Using custom install command: {install_cmd[:100]}")
        else:
            install_cmd = self.INSTALL_COMMANDS.get(language)
            if install_cmd is None:
                raise UnsupportedLanguageError(f"No install command for '{language}'")
            logger.info(f"Using default install for {language}")

        logger.info(f"Installing dependencies at {repo_path}")
        return self.exec_command(language, install_cmd, repo_path)

    def run_tests(
        self, language: str, repo_path: str, custom_command: str | None = None
    ) -> tuple[int, str]:
        """Run tests in the container.

        Args:
            language: "python" or "nodejs"
            repo_path: Container-visible path (e.g., /repos/session_abc)
            custom_command: Optional custom test command. If None, uses default.

        Returns:
            Tuple of (exit_code, raw_test_output)
            exit_code 0 = all passed, non-zero = failures.
        """
        if custom_command:
            test_cmd = self._normalize_test_command(custom_command, repo_path) + " 2>&1"
            logger.info(f"Using custom test command: {test_cmd[:100]}")
        else:
            test_cmd = self.TEST_COMMANDS.get(language)
            if test_cmd is None:
                raise UnsupportedLanguageError(f"No test command for '{language}'")
            logger.info(f"Using default test runner for {language}")

        logger.info(f"Running tests at {repo_path}")
        return self.exec_command(language, test_cmd, repo_path)

    def _resolve_command(
        self, language: str, custom_command: str | None, command_map: dict[str, str], label: str
    ) -> str:
        """Resolve command from custom or defaults."""
        if custom_command:
            cmd = custom_command + " 2>&1"
            logger.info(f"Using custom {label} command: {cmd[:100]}")
            return cmd
        cmd = command_map.get(language)
        if cmd is None:
            raise UnsupportedLanguageError(f"No {label} command for '{language}'")
        logger.info(f"Using default {label} for {language}")
        return cmd

    def install_dependencies_streaming(
        self, language: str, repo_path: str, custom_command: str | None = None
    ) -> Generator[str, None, tuple[int, str]]:
        """Install dependencies, yielding output lines in real-time."""
        cmd = self._resolve_command(language, custom_command, self.INSTALL_COMMANDS, "install")
        return self.exec_command_streaming(language, cmd, repo_path)

    def run_tests_streaming(
        self, language: str, repo_path: str, custom_command: str | None = None
    ) -> Generator[str, None, tuple[int, str]]:
        """Run tests, yielding output lines in real-time."""
        normalized = self._normalize_test_command(custom_command, repo_path) if custom_command else None
        cmd = self._resolve_command(language, normalized, self.TEST_COMMANDS, "test")
        return self.exec_command_streaming(language, cmd, repo_path)