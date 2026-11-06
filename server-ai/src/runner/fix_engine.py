"""fix_engine — one fix attempt for one failing test.

An attempt: pick an error → read the failing file (and, for a test file, the code it
imports) → ask the LLM for SEARCH/REPLACE edits → apply them to the original file →
write the result via the runner without running tests. The LLM only returns the lines
it changes, so files of any length can be fixed without hitting its output-token limit.

Whether the attempt worked is only known after the next test run: ``is_resolved``
checks that, and ``revert_fix`` restores the original file when it didn't, so failed
attempts never leak into later commits.
"""

import asyncio
import difflib
import json
import logging
import posixpath
import re
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from src.core.exceptions import FixGenerationError
from src.llm.llm_client import ask_llm, clean_code_fences
from src.services.runner_client import RunnerClient

logger = logging.getLogger("greenbranch")

# How many times the same error may be attempted before moving on to the next one
MAX_ATTEMPTS_PER_ERROR = 2

# At most this many paths are tried while looking for the code a test exercises
# (each is a cheap read on the runner; most don't exist)
MAX_IMPL_CANDIDATES = 30

LineLogFn = Callable[[str], Awaitable[None]]


async def _no_log(_line: str) -> None:
    pass


@dataclass
class Edit:
    """One SEARCH/REPLACE block from the LLM."""

    search: str
    replace: str


@dataclass
class FixAttempt:
    """A fix that has been written to disk but not yet verified by a test run."""

    error: dict[str, Any]
    target_file: str          # file actually rewritten (may differ from error["file"])
    original_content: str     # content before the fix, used to revert
    fixed_code: str
    prompt: str
    llm_ms: float


# ── Error selection ─────────────────────────────────────────────────────────

def error_key(error: dict[str, Any]) -> str:
    """Identity of an error across test runs."""
    return f"{error.get('file', '')}::{error.get('message', '')}"


def pick_error(errors: list[dict[str, Any]], attempts: dict[str, int]) -> dict[str, Any] | None:
    """Return the first error that hasn't used up its attempts, or None."""
    for error in errors:
        if attempts.get(error_key(error), 0) < MAX_ATTEMPTS_PER_ERROR:
            return error
    return None


def is_resolved(attempt: FixAttempt, errors: list[dict[str, Any]], passed: bool) -> bool:
    """True if the test run after *attempt* no longer reports the targeted error."""
    if passed:
        return True
    return error_key(attempt.error) not in {error_key(e) for e in errors}


# ── Test files and the code they exercise ──────────────────────────────────

_JS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
_TEST_DIRS = {"test", "tests", "__tests__", "spec", "specs"}
# test_x.py, x_test.py, conftest.py, x.test.ts, x.spec.jsx, …
_TEST_FILE_RE = re.compile(
    r"^(test_.+\.py|.+_test\.py|conftest\.py|.+\.(test|spec)\.[cm]?[jt]sx?)$", re.IGNORECASE
)
# Relative JS/TS imports: from "./x", require("../x"), import("./x"), import "./x"
_JS_IMPORT_RE = re.compile(r"""(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*|\bimport\s+)['"](\.{1,2}/[^'"]+)['"]""")
# Python: "from a.b import c, d" / "from .a import b" / "import a.b"
_PY_FROM_RE = re.compile(r"^\s*from\s+(\.*[\w.]*)\s+import\s+\(?([\w\s,]+)", re.MULTILINE)
_PY_IMPORT_RE = re.compile(r"^\s*import\s+([\w.]+)", re.MULTILINE)


def is_test_file(path: str) -> bool:
    """True for test files by name (test_x.py, x.test.ts, …) or location (tests/, __tests__/, …)."""
    parts = [p for p in path.split("/") if p]
    if not parts:
        return False
    return bool(_TEST_FILE_RE.match(parts[-1])) or any(p.lower() in _TEST_DIRS for p in parts[:-1])


def _js_module_files(module: str, typescript: bool) -> list[str]:
    """Files a JS/TS import of *module* (repo-relative) can resolve to, likeliest first."""
    stem, ext = posixpath.splitext(module)
    if ext in _JS_EXTS:
        # TS sources are often imported with a .js extension
        return [module] + [stem + e for e in (".ts", ".tsx") if e != ext]
    ts, js = [".ts", ".tsx"], [".js", ".jsx", ".mjs", ".cjs"]
    first, second = (ts, js) if typescript else (js, ts)
    return ([module + e for e in first] + [f"{module}/index{e}" for e in first]
            + [module + e for e in second] + [f"{module}/index{e}" for e in second])


def _python_module_files(module: str, directory: str) -> list[str]:
    """Files a Python import of dotted *module* can resolve to (relative to *directory* if it starts with dots)."""
    dots = len(module) - len(module.lstrip("."))
    path = module.lstrip(".").replace(".", "/")
    if dots:
        base = directory
        for _ in range(dots - 1):
            base = posixpath.dirname(base)
        roots = [base]
    else:
        roots = ["", "src", directory]  # repo root, src/ layout, the test's own directory
    files = []
    for root in dict.fromkeys(roots):
        full = posixpath.join(root, path) if path else root
        if full:
            files += [f"{full}.py", f"{full}/__init__.py"]
    return files


def _imported_files(test_path: str, test_content: str) -> list[str]:
    """Repo files the test imports, most likely first."""
    directory = posixpath.dirname(test_path)
    files: list[str] = []
    if test_path.endswith(".py"):
        for module, names in _PY_FROM_RE.findall(test_content):
            files += _python_module_files(module, directory)
            # "from pkg import mod" may import a submodule
            for name in re.split(r"[\s,]+", names.strip()):
                if name.isidentifier():
                    files += _python_module_files(f"{module}.{name}" if module.strip(".") else module + name, directory)
        for module in _PY_IMPORT_RE.findall(test_content):
            files += _python_module_files(module, directory)
    else:
        typescript = posixpath.splitext(test_path)[1] in (".ts", ".tsx")
        for spec in _JS_IMPORT_RE.findall(test_content):
            module = posixpath.normpath(posixpath.join(directory, spec))
            if not module.startswith(".."):  # outside the repo
                files += _js_module_files(module, typescript)
    return files


def _name_guesses(test_path: str) -> list[str]:
    """Implementation files suggested by the test's name: tests/test_calc.py → calc.py, src/calc.py, …"""
    directory, name = posixpath.split(test_path)
    match = re.match(r"^test_(.+)\.py$", name) or re.match(r"^(.+)_test\.py$", name)
    if match:
        names = [f"{match.group(1)}.py"]
    else:
        match = re.match(r"^(.+)\.(?:test|spec)\.([cm]?[jt]sx?)$", name)
        if not match:
            return []
        stem, ext = match.groups()
        family = _JS_EXTS if ext in ("ts", "tsx") else (".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx")
        names = [f"{stem}.{ext}"] + [stem + e for e in family if e != f".{ext}"]

    parts = directory.split("/") if directory else []
    directories = [directory]
    for i, part in enumerate(parts):
        if part.lower() in _TEST_DIRS:  # tests/x → x, and src/x unless already under src/
            directories.append("/".join(parts[:i] + parts[i + 1:]))
            if "src" not in parts[:i]:
                directories.append("/".join(parts[:i] + ["src"] + parts[i + 1:]))
    if not parts or parts[0] != "src":
        directories.append("src")
    return [posixpath.join(d, n) for d in dict.fromkeys(directories) for n in names]


def candidate_impl_paths(test_path: str, test_content: str) -> list[str]:
    """Likely implementation files for a test, best first: its imports, then name-based guesses."""
    seen: set[str] = set()
    result: list[str] = []
    for path in _imported_files(test_path, test_content) + _name_guesses(test_path):
        path = path.removeprefix("./")
        if path in seen or path == test_path or is_test_file(path) or "node_modules/" in path:
            continue
        seen.add(path)
        result.append(path)
    return result[:MAX_IMPL_CANDIDATES]


def _repo_relative(path: str, session_id: str) -> str:
    """Strip container prefixes like /repos/<session_id>/ from traceback paths."""
    marker = f"/{session_id}/"
    if marker in path:
        return path.split(marker, 1)[1]
    return path.removeprefix("./")


# ── Edits ───────────────────────────────────────────────────────────────────

_EDIT_BLOCK_RE = re.compile(
    r"^<{7} SEARCH[ \t]*\n(?P<search>.*?)^={7}[ \t]*\n(?P<replace>.*?)^>{7} REPLACE[ \t]*$",
    re.MULTILINE | re.DOTALL,
)
_TARGET_FILE_RE = re.compile(r"^TARGET_FILE:\s*(\S+)", re.MULTILINE)


def parse_edits(answer: str) -> tuple[str | None, list[Edit]]:
    """Split an LLM answer into its TARGET_FILE (if any) and SEARCH/REPLACE edits."""
    target = _TARGET_FILE_RE.search(answer)
    edits = [Edit(m.group("search"), m.group("replace")) for m in _EDIT_BLOCK_RE.finditer(answer)]
    return (target.group(1).strip("`'\"") if target else None), edits


def _apply_edit(content: str, edit: Edit, number: int) -> str:
    label = f"Edit {number} (SEARCH starting {edit.search.strip().splitlines()[0][:60]!r})"
    count = content.count(edit.search)
    if count == 1:
        return content.replace(edit.search, edit.replace, 1)
    if count > 1:
        raise FixGenerationError(f"{label} matches {count} places; it must be unique")

    # Not found verbatim: compare lines ignoring trailing whitespace (CRLF files, stray spaces)
    file_lines = content.splitlines(keepends=True)
    stripped = [line.rstrip() for line in file_lines]
    search = [line.rstrip() for line in edit.search.splitlines()]
    n = len(search)
    matches = [i for i in range(len(stripped) - n + 1) if stripped[i:i + n] == search]
    if len(matches) != 1:
        raise FixGenerationError(f"{label} {'was not found' if not matches else 'is not unique'} in the file")

    start = matches[0]
    newline = "\r\n" if "\r\n" in content else "\n"
    replacement = "".join(line + newline for line in edit.replace.splitlines())
    if not file_lines[start + n - 1].endswith(("\n", "\r")):  # replaced the last line, which had no newline
        replacement = replacement.removesuffix(newline)
    return "".join(file_lines[:start]) + replacement + "".join(file_lines[start + n:])


def apply_edits(content: str, edits: list[Edit]) -> str:
    """Apply *edits* in order. Raises FixGenerationError if any can't be applied exactly once."""
    for number, edit in enumerate(edits, start=1):
        if not edit.search.strip():
            raise FixGenerationError(f"Edit {number} has an empty SEARCH section")
        content = _apply_edit(content, edit, number)
    return content


def _diff(path: str, before: str, after: str) -> str:
    return "".join(difflib.unified_diff(
        before.splitlines(keepends=True), after.splitlines(keepends=True),
        fromfile=f"a/{path}", tofile=f"b/{path}", n=2,
    ))


# ── Prompt ──────────────────────────────────────────────────────────────────

FIX_SYSTEM_PROMPT = (
    "You are a senior software engineer fixing CI test failures with minimal changes. "
    "You answer only with SEARCH/REPLACE edit blocks, never with whole files, explanations or markdown."
)

_ANSWER_FORMAT = """=== HOW TO ANSWER ===
Answer ONLY with edit blocks in exactly this format — nothing before or after:

TARGET_FILE: <path of the file you are changing, exactly as shown above>
<<<<<<< SEARCH
<lines copied exactly from that file>
=======
<the lines that replace them>
>>>>>>> REPLACE

Rules:
- SEARCH must match the file exactly, including indentation, and must be unique in it.
  Include a few surrounding lines if needed to make it unique.
- Keep blocks small: the changed lines plus a little context. Use several blocks for separate changes.
- To add code, SEARCH for the lines next to where it goes and repeat them in REPLACE with the new code.
- Change one file only."""


def _code_block(path: str, content: str) -> str:
    ext = path.rsplit(".", 1)[-1] if "." in path else ""
    return f"```{ext}\n{content}\n```"


def _build_prompt(
    *,
    error: dict[str, Any],
    file_path: str,
    file_content: str,
    impl_path: str,
    impl_content: str,
    raw_output: str,
    language: str,
    retry: bool,
) -> str:
    sections = [
        "CI pipeline failed. Fix the issue with a MINIMAL change.",
        "",
        "=== ERROR INFO ===",
        f"File: {file_path}",
        f"Language: {language}",
        f"Error Type: {error.get('error_type', 'LOGIC')}",
        f"Line: {error.get('line') or 'unknown'}",
        f"Message: {error.get('message', '')}",
        f"Full Trace: {error.get('full_trace') or 'None'}",
    ]

    if is_test_file(file_path):
        if impl_path:
            sections.append(
                f"\nNOTE: The failing test is in a TEST file and its assertions are correct. "
                f"The bug is in the implementation ({impl_path}). Change the implementation, not the test."
            )
        else:
            sections.append(
                "\nNOTE: The failing test is in a TEST file and its assertions are correct. "
                "The implementation it tests could not be located automatically."
            )
    if retry:
        sections.append(
            "\nNOTE: A previous fix attempt for this error did not make it go away (or its edits "
            "could not be applied) and was reverted. Take a different approach."
        )

    sections += ["", f"=== FILE: {file_path} ===", _code_block(file_path, file_content)]
    if impl_path:
        sections += ["", f"=== FILE: {impl_path} (imported by the test) ===", _code_block(impl_path, impl_content)]

    if raw_output:
        truncated = "...<truncated>" if len(raw_output) > 3000 else ""
        output_block = f"```\n{raw_output[:3000]}{truncated}\n```"
    else:
        output_block = "(no test output available)"
    sections += ["", "=== TEST OUTPUT ===", output_block, "", _ANSWER_FORMAT]
    return "\n".join(sections)


# ── Generate / apply / revert ───────────────────────────────────────────────

async def generate_fix(
    client: RunnerClient,
    session_id: str,
    error: dict[str, Any],
    *,
    raw_output: str,
    language: str,
    retry: bool = False,
    log: LineLogFn = _no_log,
) -> FixAttempt:
    """Ask the LLM for a fix for *error* and compute the fixed file. Does not touch the repo.

    Raises FixGenerationError if no usable fix can be produced, LLMError if the
    LLM call itself fails.
    """
    file_path = _repo_relative(error.get("file") or "", session_id)
    if not file_path:
        raise FixGenerationError("The error does not point to a file")

    file_content = await client.read_file(session_id, file_path)
    if file_content is None:
        raise FixGenerationError(f"Cannot read {file_path} from the repository")
    await log(f"  Reading {file_path} ({len(file_content)} chars)")

    # For a test file, find the implementation it exercises
    impl_path, impl_content = "", ""
    test_file = is_test_file(file_path)
    if test_file:
        await log("  Test file detected — locating implementation…")
        for candidate in candidate_impl_paths(file_path, file_content):
            content = await client.read_file(session_id, candidate)
            if content:
                impl_path, impl_content = candidate, content
                await log(f"  Found implementation: {candidate}")
                break
        else:
            await log("  No implementation file found — the fix may target the test file")

    prompt = _build_prompt(
        error=error,
        file_path=file_path,
        file_content=file_content,
        impl_path=impl_path,
        impl_content=impl_content,
        raw_output=raw_output,
        language=language,
        retry=retry,
    )

    await log("  Calling AI model…")
    t0 = time.monotonic()
    answer = await asyncio.to_thread(ask_llm, prompt, FIX_SYSTEM_PROMPT)  # sync SDK call — keep the event loop free
    llm_ms = (time.monotonic() - t0) * 1000
    await log(f"  AI response received ({len(answer)} chars, {llm_ms:.0f}ms)")

    target_hint, edits = parse_edits(answer)
    if not edits:
        raise FixGenerationError("The AI's answer contained no SEARCH/REPLACE edits")

    # Files the edits may apply to, in order of preference
    shown = {file_path: file_content, **({impl_path: impl_content} if impl_path else {})}
    if target_hint:
        target = _repo_relative(target_hint, session_id)
        original = shown.get(target)
        if original is None:
            original = await client.read_file(session_id, target)
        if original is None:
            raise FixGenerationError(f"AI targeted {target}, which does not exist in the repository")
        options = [(target, original)]
    else:
        options = [(impl_path, impl_content), (file_path, file_content)] if impl_path else [(file_path, file_content)]

    failure: FixGenerationError | None = None
    for target_file, original in options:
        try:
            fixed_code = apply_edits(original, edits)
            break
        except FixGenerationError as e:
            failure = e
    else:
        raise failure or FixGenerationError("The AI's edits could not be applied")

    # Assertion failures are fixed in the code under test, never by rewriting the test
    if test_file and impl_path and target_file == file_path and error.get("error_type", "LOGIC") == "LOGIC":
        raise FixGenerationError("The AI tried to change the test instead of the code under test")
    if fixed_code == original:
        raise FixGenerationError("The AI's edits don't change anything")

    diff_lines = _diff(target_file, original, fixed_code).splitlines()
    added = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))
    await log(f"  {len(edits)} edit(s) to {target_file} (+{added} −{removed} lines)")

    return FixAttempt(
        error=error,
        target_file=target_file,
        original_content=original,
        fixed_code=fixed_code,
        prompt=prompt,
        llm_ms=llm_ms,
    )


async def apply_fix(client: RunnerClient, session_id: str, attempt: FixAttempt) -> None:
    """Write the fixed file. Tests are run separately by the caller."""
    await client.apply_fix(
        session_id=session_id,
        file_path=attempt.target_file,
        fix_content=attempt.fixed_code,
        run_tests=False,
    )


async def revert_fix(client: RunnerClient, session_id: str, attempt: FixAttempt) -> None:
    """Restore the file to its content before *attempt*."""
    await client.apply_fix(
        session_id=session_id,
        file_path=attempt.target_file,
        fix_content=attempt.original_content,
        run_tests=False,
    )


# ── Descriptions ────────────────────────────────────────────────────────────

EXPLAIN_SYSTEM_PROMPT = "You are an expert code reviewer. You answer only with the JSON object you are asked for."


def _one_line(text: str, limit: int) -> str:
    return " ".join(text.split())[:limit]


async def explain_fix(attempt: FixAttempt) -> dict[str, str]:
    """Ask the LLM for a short structured explanation of a verified fix.

    Falls back to a generic description if the LLM output isn't valid JSON.
    """
    error = attempt.error
    error_message = error.get("message", "")
    diff = _diff(attempt.target_file, attempt.original_content, attempt.fixed_code)
    prompt = (
        "A CI test failure was fixed by AI. Explain the fix in EXACTLY this JSON format "
        "(no markdown, no extra text):\n\n"
        '{"root_cause": "<1-2 sentences: what was wrong in the original code>", '
        '"changes_made": "<1-2 sentences: what specific changes were made to fix it>", '
        '"impact": "<1 sentence: what tests now pass because of this fix>"}\n\n'
        f"Error type: {error.get('error_type', 'LOGIC')}\n"
        f"Error message: {error_message[:300]}\n"
        f"File fixed: {attempt.target_file}\n"
        f"Line: {error.get('line') or 'unknown'}\n\n"
        f"Diff:\n{diff[:4000]}"
    )
    try:
        raw = await asyncio.to_thread(ask_llm, prompt, EXPLAIN_SYSTEM_PROMPT)
        parsed = json.loads(clean_code_fences(raw))
        return {
            "root_cause": str(parsed.get("root_cause", ""))[:300],
            "changes_made": str(parsed.get("changes_made", ""))[:300],
            "impact": str(parsed.get("impact", ""))[:200],
        }
    except Exception as e:
        logger.warning(f"[fix_engine] Explanation generation failed: {e}")
        return {
            "root_cause": error_message[:200] or "Unknown error",
            "changes_made": f"AI applied a code fix to {attempt.target_file}",
            "impact": "Test failures resolved",
        }


def commit_message_for(attempt: FixAttempt, root_cause: str = "") -> str:
    """Single-line commit message for a verified fix."""
    if root_cause:
        return f"fix({attempt.target_file}): {_one_line(root_cause, 80)}"
    message = f"fix({attempt.target_file}): {attempt.error.get('error_type', 'LOGIC').lower()} error"
    if attempt.error.get("line"):
        message += f" at line {attempt.error['line']}"
    return message
