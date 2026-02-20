"""streaming_runner — runs the healing pipeline with real-time WebSocket log streaming."""

import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from src.app.config import api_settings
from src.endpoints.pr import CreatePRRequest, create_pull_request
from src.llm.llm_client import ask_llm, clean_code_fences
from src.services.ec2_client import EC2Client

logger = logging.getLogger("rift_server")

LogFn = Callable[[dict[str, Any]], Awaitable[None]]


def _branch_name_from(repo_name: str) -> str:
    """Derive branch name from repo name: REPO_NAME_AI_Fix."""
    clean = re.sub(r"[^A-Z0-9_]", "", repo_name.upper().replace("-", "_").replace(" ", "_"))
    return f"{clean}_AI_Fix"


def _ts() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


async def _noop(_event: dict[str, Any]) -> None:
    pass


async def run_streaming(
    *,
    repo_url: str,
    language: str,
    install_command: str | None = None,
    test_command: str | None = None,
    branch: str = "main",
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
    """
    emit = log or _noop
    start = time.time()
    client = EC2Client()
    max_iters = max_iterations or api_settings.max_iterations

    if not branch_name:
        repo_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
        branch_name = _branch_name_from(repo_name)

    fixes_applied: list[dict[str, Any]] = []
    ci_timeline: list[dict[str, Any]] = []
    fixed_files: list[str] = []

    # ── 1. Clone (skip if session_id already provided) ────────────────────
    if session_id:
        # Client already cloned — skip cloning step
        await emit({"type": "step", "step": "cloning", "status": "done"})
        await emit({"type": "log", "line": f"  ✓ Using existing session {session_id[:8]}…", "ts": _ts()})
    else:
        await emit({"type": "step", "step": "cloning", "status": "running"})
        await emit({"type": "log", "line": f"$ git clone {repo_url}", "ts": _ts()})

        try:
            session = await client.create_session(repo_url, language)
            session_id = session["session_id"]
            await emit({"type": "log", "line": f"  Cloned into session {session_id[:8]}…", "ts": _ts()})
            await emit({"type": "step", "step": "cloning", "status": "done"})
        except Exception as e:
            # Unwrap the EC2 agent error wrapper so users see only the clean message
            # e.g. "EC2 agent [create_session] 500: 🔒 Repository is private…"
            #      ↓ becomes just: "🔒 Repository is private…"
            raw = str(e)
            clean_msg = raw
            if "]: " in raw:
                clean_msg = raw.split("]: ", 1)[-1].strip()
            await emit({"type": "log", "line": f"  ERROR: {clean_msg}", "ts": _ts()})
            await emit({"type": "step", "step": "cloning", "status": "error"})
            await emit({"type": "error", "message": clean_msg, "step": "cloning"})
            return _build_result(
                session_id="", passed=False, iteration=0,
                fixes_applied=[], ci_timeline=[], errors_remaining=[],
                branch_name=branch_name, commit_hash=None,
                time_taken=time.time() - start, repo_url=repo_url,
            )

    # ── 2. Healing loop ──────────────────────────────────────────────────
    iteration = 0
    passed = False
    errors: list[dict] = []
    raw_output = ""
    total_failures = 0

    while iteration < max_iters:
        iteration += 1
        is_first = iteration == 1
        step_name = "running_tests" if is_first else "verifying"

        await emit({"type": "step", "step": step_name, "status": "running"})
        await emit({"type": "log", "line": "", "ts": _ts()})
        await emit({
            "type": "log",
            "line": f"{'▶ Running test suite' if is_first else '▶ Re-running tests'} (iteration {iteration}/{max_iters})",
            "ts": _ts(),
        })

        if install_command:
            await emit({"type": "log", "line": f"  $ {install_command}", "ts": _ts()})
        if test_command:
            await emit({"type": "log", "line": f"  $ {test_command}", "ts": _ts()})

        # Real-time streaming callback — forwards each Docker output line to WebSocket
        async def _on_stream_line(phase: str, line: str) -> None:
            prefix = "  " if phase == "test" else "  [install] "
            await emit({"type": "log", "line": f"{prefix}{line}", "ts": _ts()})

        try:
            result = await client.execute_tests_streaming(
                session_id=session_id,
                install_command=install_command,
                test_command=test_command,
                branch=branch,
                on_line=_on_stream_line,
            )
        except Exception as e:
            await emit({"type": "log", "line": f"  ERROR: {e}", "ts": _ts()})
            await emit({"type": "step", "step": step_name, "status": "error"})
            await emit({"type": "error", "message": f"Test execution failed: {e}"})
            break

        errors = result.get("errors", [])
        passed = result.get("status") == "success"
        raw_output = result.get("raw_output", "")

        # ── Detect "no tests collected" early and abort with a clear error ──
        # Covers pytest ("collected 0 items", "no tests ran") and
        # jest/vitest ("0 tests", "no test files found")
        if is_first:
            no_tests = (
                "collected 0 items" in raw_output
                or "no tests ran" in raw_output.lower()
                or "no test files found" in raw_output.lower()
                or ("error" in raw_output.lower() and "file or directory not found" in raw_output.lower())
                or (raw_output.strip().endswith("0 passed") and "no tests" in raw_output.lower())
            )
            if no_tests:
                await emit({"type": "log", "line": "", "ts": _ts()})
                await emit({
                    "type": "log",
                    "line": "  ✗ No test files found in this repository.",
                    "ts": _ts(),
                })
                await emit({
                    "type": "log",
                    "line": "  Please make sure your test command points to the correct directory",
                    "ts": _ts(),
                })
                await emit({"type": "log", "line": "  and that test files follow the expected naming convention", "ts": _ts()})
                await emit({"type": "log", "line": "  (e.g. test_*.py for pytest, *.test.ts for jest/vitest).", "ts": _ts()})
                await emit({
                    "type": "error",
                    "message": (
                        "No test files found. Please check your test command and make sure test files "
                        "exist (e.g. test_*.py for pytest, *.test.ts for jest/vitest)."
                    ),
                })
                return _build_result(
                    session_id=session_id, passed=False, iteration=iteration,
                    fixes_applied=[], ci_timeline=ci_timeline, errors_remaining=[],
                    branch_name=None, commit_hash=None,
                    time_taken=time.time() - start, repo_url=repo_url,
                )

        if is_first:
            total_failures = len(errors)

        ts_iso = datetime.now(timezone.utc).isoformat()
        ci_timeline.append({
            "iteration": iteration,
            "status": "passed" if passed else "failed",
            "errors_count": len(errors),
            "fixes_applied": len(fixes_applied),
            "timestamp": ts_iso,
        })

        await emit({
            "type": "iteration",
            "iteration": iteration,
            "total": max_iters,
            "status": "passed" if passed else "failed",
            "errors_count": len(errors),
        })

        if passed:
            await emit({"type": "log", "line": "", "ts": _ts()})
            await emit({"type": "log", "line": "  ✓ All tests passing!", "ts": _ts()})
            await emit({"type": "step", "step": step_name, "status": "done"})
            break

        await emit({"type": "log", "line": f"  ✗ {len(errors)} error(s) found", "ts": _ts()})
        await emit({"type": "step", "step": step_name, "status": "done"})

        if not errors:
            break

        # ── Analyse ───────────────────────────────────────────────────────
        await emit({"type": "step", "step": "analyzing", "status": "running"})
        await emit({"type": "log", "line": "", "ts": _ts()})
        await emit({"type": "log", "line": "▶ Analyzing failures…", "ts": _ts()})

        current_error = errors[0]
        file_path = current_error.get("file", "unknown")
        bug_type = current_error.get("error_type", "LOGIC")
        line_number = current_error.get("line")
        error_message = current_error.get("message", "")

        loc = f" at line {line_number}" if line_number else ""
        await emit({"type": "log", "line": f"  Error: {bug_type} in {file_path}{loc}", "ts": _ts()})
        if error_message:
            await emit({"type": "log", "line": f"  {error_message.split(chr(10))[0][:200]}", "ts": _ts()})

        await emit({"type": "step", "step": "analyzing", "status": "done"})

        # ── Fix ───────────────────────────────────────────────────────────
        await emit({"type": "step", "step": "fixing", "status": "running"})
        await emit({"type": "log", "line": "", "ts": _ts()})
        await emit({"type": "log", "line": "▶ Generating AI fix…", "ts": _ts()})

        current_content = await client.read_file(session_id, file_path)
        await emit({"type": "log", "line": f"  Reading {file_path} ({len(current_content)} chars)", "ts": _ts()})

        is_test = any(x in file_path.lower() for x in ("test", "spec", "__test__"))
        ext = file_path.rsplit(".", 1)[-1] if "." in file_path else ""
        file_block = f"```{ext}\n{current_content}\n```" if current_content else "(unavailable)"

        # Attempt to locate the implementation file when the error is in a test
        impl_content = ""
        impl_path = ""
        if is_test:
            await emit({"type": "log", "line": "  Test file detected — locating implementation…", "ts": _ts()})
            possible: list[str] = []
            if current_content:
                if "../index" in current_content:
                    possible.extend(["src/index.ts", "src/index.js"])
                try:
                    for cline in current_content.split("\n"):
                        if 'from "' in cline and "../" in cline:
                            imp = cline.split('from "')[1].split('"')[0]
                            if imp.startswith("../"):
                                rel = imp.replace("../", "src/")
                                possible.extend([rel + ".ts", rel + ".js"])
                except (IndexError, ValueError):
                    pass
            guess = (
                file_path
                .replace("/tests/", "/")
                .replace(".test.", ".")
                .replace(".spec.", ".")
            )
            if guess != file_path:
                possible.append(guess)
            for p in possible:
                content = await client.read_file(session_id, p)
                if content:
                    impl_content, impl_path = content, p
                    await emit({"type": "log", "line": f"  Found implementation: {p}", "ts": _ts()})
                    break

        impl_block = ""
        if impl_content and impl_path:
            iext = impl_path.rsplit(".", 1)[-1] if "." in impl_path else ""
            impl_block = (
                f"\n\n=== IMPLEMENTATION FILE ({impl_path}) ===\n"
                f"```{iext}\n{impl_content}\n```"
            )

        output_block = (
            f"```\n{raw_output[:3000]}{'…<truncated>' if len(raw_output) > 3000 else ''}\n```"
            if raw_output
            else "(no output)"
        )

        test_hint = (
            "\nNOTE: The file reported in the error is a TEST file. "
            "The test assertions are CORRECT. The bug is in the IMPLEMENTATION file.\n"
            "You must fix the IMPLEMENTATION file and return its full corrected contents.\n"
            "Output EXACTLY one line first: TARGET_FILE: <path/to/impl/file>\n"
            "then output the complete corrected implementation file contents.\n"
            "Do NOT modify the test file. Do NOT wrap code in markdown fences."
            if is_test
            else ""
        )

        prompt = (
            "CI pipeline failed. Fix the issue with a MINIMAL change.\n\n"
            f"=== ERROR INFO ===\nFile: {file_path}\nLanguage: {language}\n"
            f"Error Type: {bug_type}\nLine: {line_number or 'unknown'}\n"
            f"Message: {error_message}\n"
            f"Full Trace: {current_error.get('full_trace') or 'None'}\n"
            f"{test_hint}\n"
            f"=== TEST FILE CONTENTS ({file_path}) ===\n{file_block}{impl_block}\n\n"
            f"=== FULL TEST OUTPUT ===\n{output_block}\n\n"
            "Return ONLY the complete corrected file contents with no explanation, "
            "no markdown fences, no commentary."
        )

        await emit({"type": "log", "line": "  Calling AI model…", "ts": _ts()})
        t_llm = time.monotonic()

        try:
            raw_fixed = ask_llm(prompt)
        except Exception as e:
            await emit({"type": "log", "line": f"  ERROR: LLM failed — {e}", "ts": _ts()})
            fixes_applied.append({
                "file": file_path, "bug_type": bug_type,
                "line_number": line_number, "commit_message": "",
                "status": "failed",
                "error_message": error_message,
                "description": f"AI could not generate a fix: {e}",
            })
            await emit({"type": "step", "step": "fixing", "status": "error"})
            break

        llm_ms = (time.monotonic() - t_llm) * 1000
        await emit({
            "type": "log",
            "line": f"  AI response received ({len(raw_fixed)} chars, {llm_ms:.0f}ms)",
            "ts": _ts(),
        })

        # Handle TARGET_FILE redirect for test-file errors
        fixed_code = raw_fixed
        actual_file = file_path
        if is_test and "TARGET_FILE:" in raw_fixed[:100]:
            lines = raw_fixed.split("\n", 1)
            first = lines[0].strip()
            if first.startswith("TARGET_FILE:"):
                suggested = first.replace("TARGET_FILE:", "").strip()
                if suggested:
                    actual_file = suggested
                    fixed_code = lines[1] if len(lines) > 1 else ""
                    fixed_code = clean_code_fences(fixed_code)
                    await emit({"type": "log", "line": f"  Redirected fix → {actual_file}", "ts": _ts()})

        await emit({"type": "log", "line": f"  Applying fix to {actual_file}…", "ts": _ts()})

        try:
            fix_result = await client.apply_fix(
                session_id=session_id,
                file_path=actual_file,
                fix_content=fixed_code,
                install_command=install_command,
                test_command=test_command,
            )
            fix_ok = fix_result.get("success", False)
        except Exception as e:
            fix_ok = False
            await emit({"type": "log", "line": f"  ERROR: apply failed — {e}", "ts": _ts()})

        # ── Generate structured explanation ──────────────────────────────
        explanation = {
            "root_cause": "",
            "changes_made": "",
            "impact": "",
        }

        if fix_ok:
            await emit({"type": "log", "line": "  Generating fix explanation…", "ts": _ts()})
            try:
                explain_prompt = (
                    "You are an expert code reviewer. A CI test failure was fixed by AI. "
                    "Provide a clear, concise explanation in EXACTLY this JSON format (no markdown, no extra text):\n\n"
                    '{"root_cause": "<1-2 sentences: what was wrong in the original code>", '
                    '"changes_made": "<1-2 sentences: what specific changes were made to fix it>", '
                    '"impact": "<1 sentence: what tests now pass because of this fix>"}\n\n'
                    f"Error type: {bug_type}\n"
                    f"Error message: {error_message[:300]}\n"
                    f"File fixed: {actual_file}\n"
                    f"Line: {line_number or 'unknown'}\n\n"
                    f"Original code (first 1500 chars):\n{current_content[:1500]}\n\n"
                    f"Fixed code (first 1500 chars):\n{fixed_code[:1500]}"
                )
                raw_explain = ask_llm(explain_prompt)
                # Try to parse JSON from the response
                import json as _json
                # Strip any markdown fences
                cleaned = raw_explain.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                parsed = _json.loads(cleaned)
                explanation["root_cause"] = parsed.get("root_cause", "")[:300]
                explanation["changes_made"] = parsed.get("changes_made", "")[:300]
                explanation["impact"] = parsed.get("impact", "")[:200]
                await emit({"type": "log", "line": "  ✓ Explanation generated", "ts": _ts()})
            except Exception as e:
                logger.warning(f"[Runner] Explanation generation failed: {e}")
                # Fall back to generic description
                explanation["root_cause"] = error_message[:200] if error_message else "Unknown error"
                explanation["changes_made"] = f"AI applied a code fix to {actual_file}"
                explanation["impact"] = "Test failures resolved"

        # Build commit message from explanation
        commit_msg = f"fix({actual_file}): {explanation['root_cause'][:80]}" if explanation["root_cause"] else f"[AI-AGENT] Fix {bug_type} in {actual_file}"
        if line_number and not explanation["root_cause"]:
            commit_msg += f" at line {line_number}"

        # Build human-readable description
        desc = explanation["root_cause"] or (
            f"{bug_type} error in {actual_file}: {error_message[:120]}. AI applied a fix."
        )

        fix_entry: dict[str, Any] = {
            "file": actual_file,
            "bug_type": bug_type,
            "line_number": line_number,
            "commit_message": commit_msg,
            "status": "fixed" if fix_ok else "failed",
            "error_message": error_message,
            "description": desc,
            "explanation": explanation,
        }
        fixes_applied.append(fix_entry)

        if actual_file not in fixed_files:
            fixed_files.append(actual_file)

        await emit({"type": "fix", "fix": fix_entry})

        status_word = "✓ Fix applied" if fix_ok else "✗ Fix failed"
        await emit({"type": "log", "line": f"  {status_word}", "ts": _ts()})
        await emit({"type": "step", "step": "fixing", "status": "done"})

    # ── 3. Commit ─────────────────────────────────────────────────────────
    commit_hash: str | None = None
    total_commits = 0

    if fixed_files:
        await emit({"type": "step", "step": "committing", "status": "running"})
        await emit({"type": "log", "line": "", "ts": _ts()})
        await emit({
            "type": "log",
            "line": f"▶ Committing {len(fixed_files)} file(s) to {branch_name}…",
            "ts": _ts(),
        })

        for fix in fixes_applied:
            if fix.get("status") != "fixed":
                continue
            fp = fix["file"]
            cm = fix.get("commit_message", f"[AI-AGENT] Fix {fp}")
            await emit({"type": "log", "line": f"  $ git commit -m \"{cm}\"", "ts": _ts()})
            try:
                commit_result = await client.commit_fix(
                    session_id=session_id,
                    file_path=fp,
                    commit_message=cm,
                    branch_name=branch_name,
                    github_token=github_token,
                )
                if commit_result.get("success"):
                    commit_hash = commit_result.get("commit_hash")
                    total_commits += 1
                    short = commit_hash[:8] if commit_hash else "ok"
                    await emit({"type": "log", "line": f"  ✓ committed ({short})", "ts": _ts()})
                else:
                    await emit({"type": "log", "line": "  ✗ commit failed", "ts": _ts()})
            except Exception as e:
                await emit({"type": "log", "line": f"  ✗ commit error: {e}", "ts": _ts()})

        await emit({"type": "step", "step": "committing", "status": "done"})

    # ── 4. Create PR ──────────────────────────────────────────────────────
    pr_created_url = None
    if total_commits > 0 and github_token:
        await emit({"type": "step", "step": "pr_creation", "status": "running"})
        await emit({"type": "log", "line": "", "ts": _ts()})
        await emit({"type": "log", "line": "▶ Creating Pull Request...", "ts": _ts()})

        try:
            # Parse repo owner/name from URL
            # e.g., https://github.com/owner/repo.git -> owner/repo
            clean_url = repo_url.rstrip("/")
            if clean_url.endswith(".git"):
                clean_url = clean_url[:-4]
            repo_full_name = "/".join(clean_url.split("/")[-2:])

            # Build PR body from explanations
            pr_body = "## 🤖 AI Fix Summary\n\n"
            pr_body += "The following issues were identified and fixed by the AI agent:\n\n"
            
            first_commit_msg = "Automated Fixes"
            
            for i, fix in enumerate(fixes_applied):
                if fix.get("status") != "fixed": continue
                
                if i == 0:
                    first_commit_msg = fix.get("commit_message", "").split(":", 1)[-1].strip()
                
                explanation = fix.get("explanation", {})
                file_path = fix.get("file", "unknown file")
                
                pr_body += f"### {i+1}. Fix in `{file_path}`\n"
                if explanation:
                    if explanation.get("root_cause"):
                        pr_body += f"- **Root Cause:** {explanation['root_cause']}\n"
                    if explanation.get("changes_made"):
                        pr_body += f"- **Changes Made:** {explanation['changes_made']}\n"
                    if explanation.get("impact"):
                        pr_body += f"- **Impact:** {explanation['impact']}\n"
                else:
                    pr_body += f"- {fix.get('description', 'No description available.')}\n"
                pr_body += "\n"

            pr_body += "---\n*Generated by GreenBranch AI*"

            # Create PR
            pr_req = CreatePRRequest(
                repo_full_name=repo_full_name,
                branch_name=branch_name,
                base_branch=branch,
                title=f"AI Fix: {first_commit_msg[:60]}...",
                body=pr_body,
                github_token=github_token
            )
            
            pr_resp = await create_pull_request(pr_req)
            
            if pr_resp.success:
                pr_created_url = pr_resp.pr_url
                await emit({"type": "log", "line": f"  ✓ PR Created: {pr_created_url}", "ts": _ts()})
                await emit({"type": "pr_created", "pr_url": pr_created_url, "repo_name": repo_full_name})
                await emit({"type": "step", "step": "pr_creation", "status": "done"})
            else:
                await emit({"type": "log", "line": f"  ✗ PR Failed: {pr_resp.message}", "ts": _ts()})
                await emit({"type": "step", "step": "pr_creation", "status": "error"})

        except Exception as e:
            logger.error(f"PR creation error: {e}")
            await emit({"type": "log", "line": f"  ✗ PR Error: {e}", "ts": _ts()})
            await emit({"type": "step", "step": "pr_creation", "status": "error"})

    # ── 4. Summary ────────────────────────────────────────────────────────
    time_taken = time.time() - start
    total_fixed = len([f for f in fixes_applied if f["status"] == "fixed"])

    await emit({"type": "log", "line": "", "ts": _ts()})
    await emit({
        "type": "log",
        "line": (
            f"{'✓' if passed else '✗'} Pipeline complete in {time_taken:.1f}s — "
            f"{total_fixed} fix(es), {total_commits} commit(s)"
        ),
        "ts": _ts(),
    })

    return _build_result(
        session_id=session_id,
        passed=passed,
        iteration=iteration,
        fixes_applied=fixes_applied,
        ci_timeline=ci_timeline,
        errors_remaining=errors,
        branch_name=branch_name,  # always carry the branch name — commit_hash may be None on partial failures but the branch still exists
        commit_hash=commit_hash,
        time_taken=time_taken,
        repo_url=repo_url,
        total_failures=total_failures,
        total_fixed=total_fixed,
    )


def _build_result(
    *,
    session_id: str,
    passed: bool,
    iteration: int,
    fixes_applied: list,
    ci_timeline: list,
    errors_remaining: list,
    branch_name: str | None,
    commit_hash: str | None,
    time_taken: float,
    repo_url: str,
    total_failures: int = 0,
    total_fixed: int = 0,
) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "status": "passed" if passed else ("partial_fix" if total_fixed > 0 else "failed"),
        "passed": passed,
        "iterations": iteration,
        "fixes_applied": fixes_applied,
        "ci_timeline": ci_timeline,
        "errors_remaining": errors_remaining,
        "branch_name": branch_name,
        "commit_hash": commit_hash,
        "time_taken_seconds": round(time_taken, 2),
        "repo_url": repo_url,
        "total_failures": total_failures,
        "total_fixed": total_fixed,
    }
