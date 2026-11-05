"""Execution service — picks the install/test commands for a repo and runs them.

Where the commands run (Docker containers or this machine) is up to the executor
selected by EC2_AGENT_EXECUTOR; see src/services/executors.py.
"""

import json
import logging
import os
import re

from src.app.config import api_settings
from src.core.exceptions import UnsupportedLanguageError
from src.services.executors import CommandExecutor, CommandStream, get_executor
from src.services.git_service import GitService

logger = logging.getLogger("ec2_agent")


def drain(stream: CommandStream) -> tuple[int, str]:
    """Run a command stream to completion and return its (exit_code, full_output)."""
    try:
        while True:
            next(stream)
    except StopIteration as stop:
        return stop.value


class ExecutionService:
    """Install dependencies and run tests for a session's cloned repo."""

    # Map language → dependency install command
    INSTALL_COMMANDS: dict[str, str] = {
        "python": "if [ -f requirements.txt ]; then pip install -r requirements.txt; fi && pip install pytest",
        "nodejs": "npm install",
    }

    # Map language → test command
    TEST_COMMANDS: dict[str, str] = {
        "python": "python -m pytest -v --tb=short",
        "nodejs": "npm test",
    }

    def __init__(self, executor: CommandExecutor | None = None):
        self.executor = executor or get_executor()
        self.git_service = GitService()

    @staticmethod
    def normalize_test_command(cmd: str, repo_path: str | None = None) -> str:
        """Normalize a user-supplied test command before executing it.

        Handles three known problem cases:
        1. **Vitest explicit** — `vitest` without ``--run`` blocks forever in
           watch mode.  We inject ``--run`` automatically.
        2. **Vitest via npm** — `npm test` / `npm run test` that delegates to
           vitest. We detect this from ``package.json`` (read from *repo_path*)
           and swap the command to ``npx vitest --run`` so it exits after one pass.
        3. **pytest with an explicit dir** — ``pytest test/`` or ``pytest tests/``
           fails with "file or directory not found" when the path doesn't exist.
           We strip the path and let pytest auto-discover instead.
        """
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
        if is_npm_test and repo_path:
            pkg_path = os.path.join(repo_path, "package.json")
            try:
                with open(pkg_path, "r", encoding="utf-8") as fh:
                    pkg = json.load(fh)
                # Check scripts.test and devDependencies / dependencies for vitest
                test_script = pkg.get("scripts", {}).get("test", "")
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                uses_vitest = "vitest" in test_script or "vitest" in deps
                if uses_vitest:
                    stripped = "npx vitest --run"
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

    @staticmethod
    def _default_command(command_map: dict[str, str], language: str, label: str) -> str:
        cmd = command_map.get(language)
        if cmd is None:
            raise UnsupportedLanguageError(f"No {label} command for '{language}'")
        logger.info(f"Using default {label} command for {language}")
        return cmd

    def install_streaming(
        self, session_id: str, language: str, custom_command: str | None = None
    ) -> CommandStream:
        """Install dependencies, yielding output lines in real-time."""
        cmd = custom_command or self._default_command(self.INSTALL_COMMANDS, language, "install")
        return self.executor.stream(language, f"{cmd} 2>&1", session_id, api_settings.install_timeout)

    def test_streaming(
        self, session_id: str, language: str, custom_command: str | None = None
    ) -> CommandStream:
        """Run tests, yielding output lines in real-time."""
        if custom_command:
            repo_path = self.git_service.get_repo_path(session_id)
            cmd = self.normalize_test_command(custom_command, repo_path)
        else:
            cmd = self._default_command(self.TEST_COMMANDS, language, "test")
        return self.executor.stream(language, f"{cmd} 2>&1", session_id, api_settings.test_timeout)

    def install(self, session_id: str, language: str, custom_command: str | None = None) -> tuple[int, str]:
        """Install dependencies. Returns (exit_code, output)."""
        return drain(self.install_streaming(session_id, language, custom_command))

    def run_tests(self, session_id: str, language: str, custom_command: str | None = None) -> tuple[int, str]:
        """Run the test suite. Returns (exit_code, raw_output); 0 = all passed."""
        return drain(self.test_streaming(session_id, language, custom_command))
