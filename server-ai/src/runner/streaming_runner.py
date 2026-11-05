"""streaming_runner — runs the healing pipeline with real-time WebSocket log streaming."""

import logging
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from src.app.config import api_settings
from src.core.exceptions import (
    EC2AgentError,
    EC2AgentUnreachable,
    FixGenerationError,
    LLMError,
    PipelineAborted,
)
from src.runner.fix_engine import (
    FixAttempt,
    apply_fix,
    commit_message_for,
    error_key,
    explain_fix,
    generate_fix,
    is_resolved,
    pick_error,
    revert_fix,
)
from src.services.ec2_client import EC2Client
from src.services.github import (
    GitHubAPIError,
    create_pull_request,
    default_branch_name,
    repo_full_name_from_url,
)

logger = logging.getLogger("greenbranch")

LogFn = Callable[[dict[str, Any]], Awaitable[None]]


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


def _error_detail(exc: Exception) -> str:
    """User-facing message for an exception (EC2 agent errors carry a clean ``detail``)."""
    return getattr(exc, "detail", None) or str(exc)


async def _noop(_event: dict[str, Any]) -> None:
    pass


def _looks_like_no_tests(raw_output: str) -> bool:
    """Detect "no tests collected" for pytest and jest/vitest."""
    lower = raw_output.lower()
    return (
        "collected 0 items" in raw_output
        or "no tests ran" in lower
        or "no test files found" in lower
        or ("error" in lower and "file or directory not found" in lower)
        or (raw_output.strip().endswith("0 passed") and "no tests" in lower)
    )


class _StreamingPipeline:
    """State and steps of one streaming run: heal loop → commit → PR."""

    def __init__(
        self,
        *,
        client: EC2Client,
        emit: LogFn,
        session_id: str,
        language: str,
        install_command: str | None,
        test_command: str | None,
        max_iters: int,
    ):
        self.client = client
        self.emit = emit
        self.session_id = session_id
        self.language = language
        self.install_command = install_command
        self.test_command = test_command
        self.max_iters = max_iters

        self.iteration = 0
        self.passed = False
        self.errors: list[dict[str, Any]] = []
        self.raw_output = ""
        self.total_failures = 0
        self.attempts: dict[str, int] = {}
        self.fixes_applied: list[dict[str, Any]] = []
        self.ci_timeline: list[dict[str, Any]] = []

    # ── Event helpers ────────────────────────────────────────────────────

    async def log(self, line: str) -> None:
        await self.emit({"type": "log", "line": line, "ts": _ts()})

    async def step(self, step: str, status: str) -> None:
        await self.emit({"type": "step", "step": step, "status": status})

    async def _on_stream_line(self, phase: str, line: str) -> None:
        prefix = "  " if phase == "test" else "  [install] "
        await self.log(f"{prefix}{line}")

    @property
    def fixed_count(self) -> int:
        return sum(1 for f in self.fixes_applied if f["status"] == "fixed")

    # ── Heal loop ────────────────────────────────────────────────────────

    async def heal(self) -> None:
        """Test → pick error → fix → re-test, until passing or out of iterations.

        Each fix is verified by the next test run and reverted if it didn't remove
        the error it targeted, so only verified fixes remain on disk.
        """
        pending: tuple[FixAttempt, dict[str, Any]] | None = None

        while True:
            self.iteration += 1
            first = self.iteration == 1
            step_name = "running_tests" if first else "verifying"

            await self.step(step_name, "running")
            await self.log("")
            await self.log(
                f"{'▶ Running test suite' if first else '▶ Re-running tests'} "
                f"(iteration {self.iteration}/{self.max_iters})"
            )
            if self.install_command:
                await self.log(f"  $ {self.install_command}")
            if self.test_command:
                await self.log(f"  $ {self.test_command}")

            try:
                result = await self.client.execute_tests_streaming(
                    session_id=self.session_id,
                    install_command=self.install_command,
                    test_command=self.test_command,
                    on_line=self._on_stream_line,
                )
            except (EC2AgentError, EC2AgentUnreachable) as e:
                message = _error_detail(e)
                await self.log(f"  ERROR: {message}")
                await self.step(step_name, "error")
                if pending:
                    await self._reject(*pending)
                if first:
                    raise PipelineAborted(f"Test execution failed: {message}", step=step_name)
                await self.log("  Stopping early — only verified fixes will be committed.")
                return

            errors = result.get("errors", [])
            passed = result.get("status") == "success"
            raw_output = result.get("raw_output", "")

            if first:
                if _looks_like_no_tests(raw_output):
                    await self.log("")
                    await self.log("  ✗ No test files found in this repository.")
                    await self.log("  Please make sure your test command points to the correct directory")
                    await self.log("  and that test files follow the expected naming convention")
                    await self.log("  (e.g. test_*.py for pytest, *.test.ts for jest/vitest).")
                    await self.step(step_name, "error")
                    raise PipelineAborted(
                        "No test files found. Please check your test command and make sure test files "
                        "exist (e.g. test_*.py for pytest, *.test.ts for jest/vitest).",
                        step=step_name,
                    )
                self.total_failures = len(errors)

            # Verify the fix applied in the previous iteration
            reverted = False
            if pending:
                attempt, entry = pending
                pending = None
                if is_resolved(attempt, errors, passed):
                    await self._accept(attempt, entry)
                else:
                    await self._reject(attempt, entry)
                    reverted = True

            self.ci_timeline.append({
                "iteration": self.iteration,
                "status": "passed" if passed else "failed",
                "errors_count": len(errors),
                "fixes_applied": self.fixed_count,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            await self.emit({
                "type": "iteration",
                "iteration": self.iteration,
                "total": self.max_iters,
                "status": "passed" if passed else "failed",
                "errors_count": len(errors),
            })

            # A rejected fix was reverted, so the repo is back to the previous run's state
            if not reverted:
                self.errors, self.passed, self.raw_output = errors, passed, raw_output

            if self.passed:
                await self.log("")
                await self.log("  ✓ All tests passing!")
                await self.step(step_name, "done")
                return

            await self.log(f"  ✗ {len(self.errors)} error(s) found")
            await self.step(step_name, "done")

            if self.iteration >= self.max_iters:
                await self.log(f"  Reached the iteration limit ({self.max_iters}).")
                return

            pending = await self._attempt_fix()
            if pending is None:
                return

    async def _attempt_fix(self) -> tuple[FixAttempt, dict[str, Any]] | None:
        """Generate and write a fix for the next attemptable error.

        Returns the unverified attempt, or None if there is nothing left to try.
        """
        while True:
            error = pick_error(self.errors, self.attempts)
            if error is None:
                await self.log("  No remaining errors the AI can attempt.")
                return None

            key = error_key(error)
            self.attempts[key] = self.attempts.get(key, 0) + 1
            retry = self.attempts[key] > 1

            file_path = error.get("file", "unknown")
            bug_type = error.get("error_type", "LOGIC")
            line_number = error.get("line")
            error_message = error.get("message", "")

            # ── Analyse ──
            await self.step("analyzing", "running")
            await self.log("")
            await self.log("▶ Analyzing failures…")
            loc = f" at line {line_number}" if line_number else ""
            await self.log(f"  Error: {bug_type} in {file_path}{loc}")
            if error_message:
                await self.log(f"  {error_message.splitlines()[0][:200]}")
            await self.step("analyzing", "done")

            # ── Fix ──
            await self.step("fixing", "running")
            await self.log("")
            await self.log(f"▶ Generating AI fix{' (retry)' if retry else ''}…")

            try:
                attempt = await generate_fix(
                    self.client,
                    self.session_id,
                    error,
                    raw_output=self.raw_output,
                    language=self.language,
                    retry=retry,
                    log=self.log,
                )
                await self.log(f"  Applying fix to {attempt.target_file}…")
                await apply_fix(self.client, self.session_id, attempt)
            except LLMError as e:
                # The model is unavailable — further attempts would fail the same way
                await self._record_failure(error, f"AI could not generate a fix: {e}")
                await self.step("fixing", "error")
                return None
            except (FixGenerationError, EC2AgentError) as e:
                await self._record_failure(error, f"Fix could not be applied: {_error_detail(e)}")
                await self.step("fixing", "error")
                continue

            entry = {
                "file": attempt.target_file,
                "bug_type": bug_type,
                "line_number": line_number,
                "commit_message": "",
                "status": "pending",
                "error_message": error_message,
                "description": "",
                "explanation": {"root_cause": "", "changes_made": "", "impact": ""},
            }
            await self.log("  Fix written — verifying with a fresh test run…")
            await self.step("fixing", "done")
            return attempt, entry

    async def _accept(self, attempt: FixAttempt, entry: dict[str, Any]) -> None:
        """Mark a fix as verified and describe it."""
        await self.log(f"  ✓ Fix verified — {attempt.target_file} resolved the error")
        await self.log("  Generating fix explanation…")
        explanation = await explain_fix(attempt)
        entry.update(
            status="fixed",
            explanation=explanation,
            description=explanation["root_cause"],
            commit_message=commit_message_for(attempt, explanation["root_cause"]),
        )
        self.fixes_applied.append(entry)
        await self.emit({"type": "fix", "fix": entry})

    async def _reject(self, attempt: FixAttempt, entry: dict[str, Any]) -> None:
        """Revert a fix that didn't remove its error."""
        try:
            await revert_fix(self.client, self.session_id, attempt)
            await self.log(f"  ✗ Fix did not resolve the error — reverted {attempt.target_file}")
        except Exception as e:
            logger.error(f"[Runner] Revert of {attempt.target_file} failed: {e}")
            await self.log(f"  ✗ Fix did not resolve the error, and reverting {attempt.target_file} failed: {_error_detail(e)}")
        entry.update(status="failed", description="The AI fix did not resolve the error and was reverted.")
        self.fixes_applied.append(entry)
        await self.emit({"type": "fix", "fix": entry})

    async def _record_failure(self, error: dict[str, Any], description: str) -> None:
        await self.log(f"  ✗ {description}")
        entry = {
            "file": error.get("file", "unknown"),
            "bug_type": error.get("error_type", "LOGIC"),
            "line_number": error.get("line"),
            "commit_message": "",
            "status": "failed",
            "error_message": error.get("message", ""),
            "description": description,
        }
        self.fixes_applied.append(entry)
        await self.emit({"type": "fix", "fix": entry})

    # ── Commit & PR ──────────────────────────────────────────────────────

    async def commit(self, branch_name: str, github_token: str | None) -> tuple[str | None, int]:
        """Commit each verified file to *branch_name*. Returns (last commit hash, commit count)."""
        by_file: dict[str, list[dict[str, Any]]] = {}
        for fix in self.fixes_applied:
            if fix["status"] == "fixed":
                by_file.setdefault(fix["file"], []).append(fix)
        if not by_file:
            return None, 0

        await self.step("committing", "running")
        await self.log("")
        await self.log(f"▶ Committing {len(by_file)} file(s) to {branch_name}…")

        commit_hash: str | None = None
        total_commits = 0
        for file_path, fixes in by_file.items():
            message = (
                fixes[0]["commit_message"] if len(fixes) == 1
                else f"fix({file_path}): resolve {len(fixes)} failing tests"
            )
            await self.log(f'  $ git commit -m "{message}"')
            try:
                result = await self.client.commit_fix(
                    session_id=self.session_id,
                    file_path=file_path,
                    commit_message=message,
                    branch_name=branch_name,
                    github_token=github_token,
                )
                commit_hash = result.get("commit_hash")
                total_commits += 1
                await self.log(f"  ✓ committed ({commit_hash[:8] if commit_hash else 'ok'})")
            except (EC2AgentError, EC2AgentUnreachable) as e:
                await self.log(f"  ✗ commit error: {_error_detail(e)}")

        await self.step("committing", "done" if total_commits else "error")
        return commit_hash, total_commits

    async def open_pr(self, *, repo_url: str, branch_name: str, base_branch: str, github_token: str) -> str | None:
        """Open a PR from *branch_name* into *base_branch*. Returns its URL, or None."""
        await self.step("pr_creation", "running")
        await self.log("")
        await self.log("▶ Creating Pull Request...")

        fixed = [f for f in self.fixes_applied if f["status"] == "fixed"]
        body = "## 🤖 AI Fix Summary\n\n"
        body += "The following issues were identified and fixed by the AI agent:\n\n"
        for i, fix in enumerate(fixed, start=1):
            explanation = fix.get("explanation") or {}
            body += f"### {i}. Fix in `{fix['file']}`\n"
            if explanation.get("root_cause"):
                body += f"- **Root Cause:** {explanation['root_cause']}\n"
            if explanation.get("changes_made"):
                body += f"- **Changes Made:** {explanation['changes_made']}\n"
            if explanation.get("impact"):
                body += f"- **Impact:** {explanation['impact']}\n"
            if not explanation:
                body += f"- {fix.get('description') or 'No description available.'}\n"
            body += "\n"
        body += "---\n*Generated by GreenBranch AI*"

        summary = fixed[0]["commit_message"].split(":", 1)[-1].strip() if fixed else "Automated fixes"
        title = f"AI Fix: {summary[:60]}{'…' if len(summary) > 60 else ''}"
        repo_full_name = repo_full_name_from_url(repo_url)

        try:
            result = await create_pull_request(
                repo_full_name=repo_full_name,
                head=branch_name,
                base=base_branch,
                title=title,
                body=body,
                github_token=github_token,
            )
        except GitHubAPIError as e:
            logger.error(f"PR creation error: {e}")
            await self.log(f"  ✗ PR Error: {e}")
            await self.step("pr_creation", "error")
            return None

        if not result.success:
            await self.log(f"  ✗ PR Failed: {result.message}")
            await self.step("pr_creation", "error")
            return None

        await self.log(f"  ✓ PR Created: {result.pr_url}")
        await self.emit({"type": "pr_created", "pr_url": result.pr_url, "repo_name": repo_full_name})
        await self.step("pr_creation", "done")
        return result.pr_url


async def run_streaming(
    *,
    repo_url: str,
    language: str,
    install_command: str | None = None,
    test_command: str | None = None,
    branch_name: str | None = None,
    max_iterations: int | None = None,
    session_id: str | None = None,
    github_token: str | None = None,
    log: LogFn | None = None,
) -> dict[str, Any]:
    """
    Full healing pipeline with real-time log streaming.

    ``log`` is an async callback that receives event dicts to forward to the
    WebSocket client.  If *None*, logging is silently skipped.

    Raises PipelineAborted when the run cannot proceed (clone failed, no tests,
    test infrastructure down). The session is always deleted afterwards.
    """
    emit = log or _noop
    start = time.time()
    client = EC2Client()
    max_iters = max(1, max_iterations or api_settings.max_iterations)

    # ── 1. Clone (or reuse the session the frontend already created) ─────
    try:
        if session_id:
            session = await client.get_session(session_id)
            await emit({"type": "step", "step": "cloning", "status": "done"})
            await emit({"type": "log", "line": f"  ✓ Using existing session {session_id[:8]}…", "ts": _ts()})
        else:
            await emit({"type": "step", "step": "cloning", "status": "running"})
            await emit({"type": "log", "line": f"$ git clone {repo_url}", "ts": _ts()})
            session = await client.create_session(repo_url, language, github_token=github_token)
            session_id = session["session_id"]
            await emit({"type": "log", "line": f"  Cloned into session {session_id[:8]}…", "ts": _ts()})
            await emit({"type": "step", "step": "cloning", "status": "done"})
    except (EC2AgentError, EC2AgentUnreachable) as e:
        message = _error_detail(e)
        await emit({"type": "log", "line": f"  ERROR: {message}", "ts": _ts()})
        await emit({"type": "step", "step": "cloning", "status": "error"})
        raise PipelineAborted(message, step="cloning")

    # The session is the source of truth for what was cloned
    repo_url = session.get("repo_url", repo_url)
    language = session.get("language", language)
    base_branch = session.get("branch") or "main"

    if not branch_name:
        branch_name = default_branch_name(repo_url)

    pipeline = _StreamingPipeline(
        client=client,
        emit=emit,
        session_id=session_id,
        language=language,
        install_command=install_command,
        test_command=test_command,
        max_iters=max_iters,
    )

    try:
        # ── 2. Healing loop ──
        await pipeline.heal()

        # ── 3. Commit verified fixes ──
        commit_hash, total_commits = await pipeline.commit(branch_name, github_token)

        # ── 4. Create PR ──
        pr_url = None
        if total_commits > 0 and github_token:
            pr_url = await pipeline.open_pr(
                repo_url=repo_url,
                branch_name=branch_name,
                base_branch=base_branch,
                github_token=github_token,
            )
    finally:
        try:
            await client.delete_session(session_id)
        except Exception as e:
            logger.warning(f"[Runner] Could not delete session {session_id}: {e}")

    # ── 5. Summary ──
    time_taken = time.time() - start
    await pipeline.log("")
    await pipeline.log(
        f"{'✓' if pipeline.passed else '✗'} Pipeline complete in {time_taken:.1f}s — "
        f"{pipeline.fixed_count} fix(es), {total_commits} commit(s)"
    )

    return {
        "session_id": session_id,
        "status": "passed" if pipeline.passed else ("partial_fix" if pipeline.fixed_count else "failed"),
        "passed": pipeline.passed,
        "iterations": pipeline.iteration,
        "fixes_applied": pipeline.fixes_applied,
        "ci_timeline": pipeline.ci_timeline,
        "errors_remaining": pipeline.errors,
        # Only report a branch that was actually pushed
        "branch_name": branch_name if commit_hash else None,
        "base_branch": base_branch,
        "commit_hash": commit_hash,
        "total_commits": total_commits,
        "pr_url": pr_url,
        "time_taken_seconds": round(time_taken, 2),
        "repo_url": repo_url,
        "total_failures": pipeline.total_failures,
        "total_fixed": pipeline.fixed_count,
    }
