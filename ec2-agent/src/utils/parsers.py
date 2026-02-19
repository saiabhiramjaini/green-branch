"""Parsers for test output — extract structured errors from raw text."""

import re

from src.models.execution import TestError


def parse_test_output(output: str, language: str) -> list[TestError]:
    """Parse test output based on language.

    Returns a list of TestError objects.
    """
    if language == "python":
        return _parse_pytest_output(output)
    elif language == "nodejs":
        return _parse_jest_output(output)
    return []


def _parse_pytest_output(output: str) -> list[TestError]:
    """Parse pytest -v --tb=short output.

    Looks for patterns like:
        FAILED tests/test_utils.py::test_add - AssertionError: ...
        E       assert 3 == 4
    """
    errors: list[TestError] = []
    lines = output.splitlines()

    for i, line in enumerate(lines):
        # Match: FAILED path/to/test.py::test_name - ErrorType: message
        match = re.match(r"FAILED\s+(.+?)::(\S+)\s*[-–]\s*(.*)", line)
        if match:
            file_path = match.group(1)
            test_name = match.group(2)
            message = match.group(3).strip()

            error_type = _classify_error(message)
            line_num = _extract_line_number(lines, i, file_path)

            errors.append(
                TestError(
                    file=file_path,
                    line=line_num,
                    error_type=error_type,
                    message=f"{test_name}: {message}",
                )
            )

        # Also match: E       SyntaxError: invalid syntax
        if line.strip().startswith("E ") and "Error" in line:
            message = line.strip().removeprefix("E").strip()
            error_type = _classify_error(message)
            # Try to find file context
            file_path = _find_file_in_context(lines, i)
            line_num = _extract_line_from_trace(lines, i)

            if file_path and not any(e.message == message for e in errors):
                errors.append(
                    TestError(
                        file=file_path,
                        line=line_num,
                        error_type=error_type,
                        message=message,
                    )
                )

    return errors


def _parse_jest_output(output: str) -> list[TestError]:
    """Parse Jest/npm test output.

    Looks for patterns like:
        FAIL src/utils.test.js
        ● test_name
          Expected: 5, Received: 4
    """
    errors: list[TestError] = []
    lines = output.splitlines()

    current_file = ""
    for i, line in enumerate(lines):
        # Match: FAIL src/utils.test.js
        fail_match = re.match(r"\s*FAIL\s+(.+)", line)
        if fail_match:
            current_file = fail_match.group(1).strip()

        # Match: ● test name
        test_match = re.match(r"\s*●\s+(.+)", line)
        if test_match and current_file:
            test_name = test_match.group(1).strip()
            message = _get_jest_error_message(lines, i)
            error_type = _classify_error(message)
            line_num = _extract_jest_line(lines, i)

            errors.append(
                TestError(
                    file=current_file,
                    line=line_num,
                    error_type=error_type,
                    message=f"{test_name}: {message}",
                )
            )

    return errors


def _classify_error(message: str) -> str:
    """Classify an error message into a bug type."""
    msg_lower = message.lower()

    if any(w in msg_lower for w in ("unused import", "imported but unused", "no-unused", "lint")):
        return "LINTING"
    if any(w in msg_lower for w in ("syntaxerror", "syntax error", "unexpected token", "missing colon")):
        return "SYNTAX"
    if any(w in msg_lower for w in ("typeerror", "type error", "not callable", "undefined is not")):
        return "TYPE_ERROR"
    if any(w in msg_lower for w in ("importerror", "modulenotfounderror", "cannot find module", "no module named")):
        return "IMPORT"
    if any(w in msg_lower for w in ("indentationerror", "unexpected indent", "indentation")):
        return "INDENTATION"
    if any(w in msg_lower for w in ("assert", "expected", "not equal", "to equal", "to be")):
        return "LOGIC"

    return "LOGIC"


def _extract_line_number(lines: list[str], current_idx: int, file_path: str) -> int | None:
    """Try to extract a line number from nearby traceback lines."""
    # Look around the current line for something like "file.py:15"
    search_range = lines[max(0, current_idx - 5): current_idx + 5]
    for line in search_range:
        match = re.search(rf"{re.escape(file_path)}:(\d+)", line)
        if match:
            return int(match.group(1))
    return None


def _extract_line_from_trace(lines: list[str], current_idx: int) -> int | None:
    """Extract line number from Python traceback."""
    search_range = lines[max(0, current_idx - 10): current_idx]
    for line in search_range:
        match = re.search(r"line (\d+)", line)
        if match:
            return int(match.group(1))
    return None


def _find_file_in_context(lines: list[str], current_idx: int) -> str | None:
    """Find a file path in surrounding lines."""
    search_range = lines[max(0, current_idx - 10): current_idx]
    for line in search_range:
        match = re.search(r'File "(.+?)"', line)
        if match:
            return match.group(1)
    return None


def _get_jest_error_message(lines: list[str], current_idx: int) -> str:
    """Get error message from lines following a Jest ● marker."""
    for line in lines[current_idx + 1: current_idx + 5]:
        stripped = line.strip()
        if stripped and not stripped.startswith("●"):
            return stripped
    return "Test failed"


def _extract_jest_line(lines: list[str], current_idx: int) -> int | None:
    """Extract line number from Jest error output."""
    for line in lines[current_idx: current_idx + 10]:
        match = re.search(r":(\d+):\d+", line)
        if match:
            return int(match.group(1))
    return None