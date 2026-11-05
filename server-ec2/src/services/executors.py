"""Command executors — where install/test commands for a cloned repo actually run.

docker: inside the long-running language containers (isolated; the default on a server).
local:  as plain processes on this machine, for hosts without Docker such as an
        Android phone. There is no sandbox, so local mode only accepts repos from
        EC2_AGENT_ALLOWED_REPO_OWNERS (enforced when sessions are created).

Both stream output line by line and stop a command once its timeout is reached.
"""

import functools
import logging
import os
import posixpath
import queue
import shutil
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Generator, Iterable, Iterator
from typing import Protocol

from src.app.config import api_settings
from src.core.exceptions import ExecutorUnavailableError, UnsupportedLanguageError
from src.services.git_service import GitService

logger = logging.getLogger("ec2_agent")

# Set for every command: makes jest/vitest/npm non-interactive, so they never wait in watch mode
COMMON_ENV = {"CI": "true"}

SUPPORTED_LANGUAGES = ("python", "nodejs")

# A command's output: yields lines, returns (exit_code, full_output). exit_code -1 = timed out.
CommandStream = Generator[str, None, tuple[int, str]]


class CommandExecutor(Protocol):
    kind: str

    def check(self) -> dict:
        """Verify the executor can run commands. Raises if it can't; returns details for /health."""
        ...

    def check_language(self, language: str) -> None:
        """Raise if *language* projects can't be run right now."""
        ...

    def stream(self, language: str, command: str, session_id: str, timeout_seconds: int) -> CommandStream:
        """Run *command* in the session's repo, yielding output lines as they are produced."""
        ...


def _require_supported(language: str) -> None:
    if language not in SUPPORTED_LANGUAGES:
        raise UnsupportedLanguageError(
            f"Language '{language}' is not supported. Supported: {list(SUPPORTED_LANGUAGES)}"
        )


def _pump(lines: Iterable[str], timeout_seconds: int, command: str) -> Generator[str, None, tuple[bool, list[str]]]:
    """Yield lines from *lines* until it ends or *timeout_seconds* pass.

    Reading happens in a daemon thread so a silent, hung process can't block us
    past the deadline. Returns (timed_out, all_output_lines).
    """
    line_queue: queue.Queue[str | None] = queue.Queue()

    def _producer() -> None:
        try:
            for line in lines:
                line_queue.put(line)
        except Exception as e:  # e.g. the stream was closed after a timeout
            logger.debug(f"[exec] output reader stopped: {e}")
        finally:
            line_queue.put(None)  # sentinel — end of output

    threading.Thread(target=_producer, daemon=True).start()

    output: list[str] = []
    deadline = time.monotonic() + timeout_seconds

    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            logger.warning(f"[exec] Command timed out after {timeout_seconds}s: {command[:80]}")
            message = (
                f"[timeout] Command exceeded {timeout_seconds}s limit and was stopped. "
                "If you are using a test framework in watch mode (e.g. vitest, jest --watch), "
                "add '--run' or '--watchAll=false' to make it exit after one pass."
            )
            output.append(message)
            yield message
            return True, output
        try:
            # Poll with a short timeout so the deadline is re-checked regularly
            item = line_queue.get(timeout=min(remaining, 2.0))
        except queue.Empty:
            continue
        if item is None:
            return False, output
        output.append(item)
        yield item


# ── Docker ───────────────────────────────────────────────────────────────────

def _split_lines(chunks: Iterable[bytes]) -> Iterator[str]:
    buffer = ""
    for chunk in chunks:
        buffer += chunk.decode("utf-8", errors="replace")
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            yield line
    if buffer.strip():
        yield buffer


class DockerExecutor:
    """Run commands in the pre-running executor containers via ``docker exec``."""

    kind = "docker"

    def __init__(self):
        from src.core.docker_manager import DockerManager  # only needed in docker mode

        self.docker_manager = DockerManager()
        self.containers = {
            "python": api_settings.python_container,
            "nodejs": api_settings.node_container,
        }

    def check(self) -> dict:
        self.docker_manager.ping()
        return {"executor": self.kind, "docker": "connected"}

    def _container(self, language: str):
        _require_supported(language)
        return self.docker_manager.get_container(self.containers[language])

    def check_language(self, language: str) -> None:
        self._container(language)  # raises DockerContainerNotFoundError if not running

    def stream(self, language: str, command: str, session_id: str, timeout_seconds: int) -> CommandStream:
        container = self._container(language)
        workdir = posixpath.join(api_settings.container_repos_path, session_id)
        logger.info(f"[exec:docker] {container.name} ({workdir}): {command[:100]}")

        # argv list + workdir: the command is never spliced into another quoted shell string
        api = container.client.api
        exec_id = api.exec_create(
            container.id, ["bash", "-c", command],
            stdout=True, stderr=True, workdir=workdir, environment=dict(COMMON_ENV),
        )
        chunks = api.exec_start(exec_id, stream=True)
        # On timeout the exec keeps running inside the container; we only stop waiting for it.
        timed_out, output = yield from _pump(_split_lines(chunks), timeout_seconds, command)

        exit_code = -1
        if not timed_out:
            exit_code = self._exit_code(api, exec_id)
        logger.info(f"[exec:docker] exit_code={exit_code} lines={len(output)} timed_out={timed_out}")
        return exit_code, "\n".join(output)

    @staticmethod
    def _exit_code(api, exec_id: str) -> int:
        """Exit code of a finished exec (its state can lag the end of the stream briefly)."""
        for _ in range(20):
            try:
                info = api.exec_inspect(exec_id)
            except Exception:
                return -1
            if not info.get("Running") and info.get("ExitCode") is not None:
                return info["ExitCode"]
            time.sleep(0.1)
        return -1


# ── Local ────────────────────────────────────────────────────────────────────

# Environment variables passed through to commands. Everything else — including this
# server's API key and any tokens — is left out, so the repo's code can't read them
# from its environment.
_PASSTHROUGH_ENV = (
    "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "TMPDIR",
    # Termux / Android: binaries need these to start
    "PREFIX", "LD_PRELOAD", "ANDROID_DATA", "ANDROID_ROOT",
)

# Per-repo virtualenv for Python projects. Dot-directories are skipped by pytest's discovery.
PYTHON_VENV_DIR = ".greenbranch-venv"

# How long a finished command's leftover background processes may keep its output open
_ORPHAN_GRACE_SECONDS = 2


def _command_path() -> str:
    """This process's PATH without our own virtualenv, so repo commands use system tools."""
    entries = os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin").split(os.pathsep)
    if sys.prefix != sys.base_prefix:  # running from a venv
        venv = os.path.realpath(sys.prefix)
        entries = [p for p in entries if not os.path.realpath(p).startswith(venv + os.sep)]
    return os.pathsep.join(entries)


def _kill_group(proc: subprocess.Popen) -> None:
    """Kill the command and everything it started (it runs in its own process group)."""
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass


def _reap_orphans(proc: subprocess.Popen) -> None:
    """Once the command exits, kill processes it left running (e.g. a test server).

    They would otherwise hold its output pipe open and stall the stream until the timeout.
    """
    proc.wait()
    time.sleep(_ORPHAN_GRACE_SECONDS)
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


class LocalExecutor:
    """Run commands as subprocesses of this server, in the session's repo directory."""

    kind = "local"
    REQUIRED_TOOLS = {"python": "python3", "nodejs": "npm"}

    def __init__(self):
        self.git_service = GitService()

    def _which(self, tool: str) -> str | None:
        return shutil.which(tool, path=_command_path())

    def check(self) -> dict:
        if not self._which("bash"):
            raise ExecutorUnavailableError("bash is not installed, so commands can't be run")
        tools = {tool: bool(self._which(tool)) for tool in ("git", "node", "npm", "python3")}
        return {"executor": self.kind, "tools": tools}

    def check_language(self, language: str) -> None:
        _require_supported(language)
        tool = self.REQUIRED_TOOLS[language]
        if not self._which(tool):
            raise ExecutorUnavailableError(
                f"'{tool}' is not installed on this server, so {language} projects can't be tested."
            )

    def _env(self) -> dict[str, str]:
        env = {key: os.environ[key] for key in _PASSTHROUGH_ENV if key in os.environ}
        env["PATH"] = _command_path()
        env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
        env.update(COMMON_ENV)
        return env

    def stream(self, language: str, command: str, session_id: str, timeout_seconds: int) -> CommandStream:
        self.check_language(language)
        cwd = self.git_service.require_repo_path(session_id)
        env = self._env()

        script = command
        if language == "python":
            # Install into a per-repo venv, never into this server's environment or the system Python
            venv = os.path.join(cwd, PYTHON_VENV_DIR)
            env["VIRTUAL_ENV"] = venv
            env["PATH"] = os.path.join(venv, "bin") + os.pathsep + env["PATH"]
            script = (
                f"[ -x {PYTHON_VENV_DIR}/bin/python ] || python3 -m venv {PYTHON_VENV_DIR} || exit 1\n"
                f"{command}"
            )

        logger.info(f"[exec:local] ({cwd}): {command[:100]}")
        try:
            proc = subprocess.Popen(
                ["bash", "-c", script],
                cwd=cwd,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                start_new_session=True,  # own process group, so the whole tree can be killed
            )
        except OSError as e:
            raise ExecutorUnavailableError(f"Could not start command: {e}") from e

        threading.Thread(target=_reap_orphans, args=(proc,), daemon=True).start()
        lines = (raw.decode("utf-8", errors="replace").rstrip("\r\n") for raw in proc.stdout)

        try:
            timed_out, output = yield from _pump(lines, timeout_seconds, command)
            exit_code = -1
            if not timed_out:
                try:
                    exit_code = proc.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    pass
        finally:
            # Also runs when the caller stops reading early (client disconnected)
            _kill_group(proc)

        logger.info(f"[exec:local] exit_code={exit_code} lines={len(output)} timed_out={timed_out}")
        return exit_code, "\n".join(output)


@functools.cache
def get_executor() -> CommandExecutor:
    """The executor selected by EC2_AGENT_EXECUTOR (one instance per process)."""
    if api_settings.executor == "local":
        return LocalExecutor()
    return DockerExecutor()
