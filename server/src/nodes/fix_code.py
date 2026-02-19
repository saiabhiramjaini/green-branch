"""fix_code node — asks the LLM to repair a failing file and applies it via EC2 agent."""

import logging
import time
from datetime import datetime, timezone

from src.state.graph_state import GraphState
from src.llm.llm_client import ask_llm, clean_code_fences
from src.services.ec2_client import EC2Client

logger = logging.getLogger("rift_server")


async def fix_code(state: GraphState) -> GraphState:
    """Generate a fix with the LLM, apply it, and record in fixes_applied."""

    if state["passed"]:
        return state

    error = state["current_error"]
    file_path = error.get("file", "unknown")
    bug_type = error.get("error_type", "LOGIC")
    line_number = error.get("line")
    error_message = error.get("message", "")
    iteration = state.get("iteration", 0)

    logger.info(f"\n{'~'*60}")
    logger.info(f"[GRAPH] fix_code  iteration={iteration}")
    logger.info(f"[GRAPH] target: {file_path}  bug_type={bug_type}  line={line_number}")
    logger.info(f"[GRAPH] error message: {error_message}")
    logger.info(f"{'~'*60}")

    client = EC2Client()

    # ── Read current file content from the repo (gives LLM full context) ──
    current_file_content = await client.read_file(state["session_id"], file_path)
    raw_output = state.get("raw_output", "")
    language = state.get("language", "")

    # Determine file extension hint
    ext = file_path.rsplit(".", 1)[-1] if "." in file_path else ""
    is_test_file = any(x in file_path.lower() for x in ("test", "spec", "__test__"))

    file_block = f"```{ext}\n{current_file_content}\n```" if current_file_content else "(file content unavailable)"

    # For test files, try to find and read the implementation file
    impl_file_content = ""
    impl_file_path = ""
    if is_test_file:
        # Common patterns: src/tests/foo.test.ts -> src/foo.ts or src/index.ts
        # Extract possible impl paths from the test file imports
        possible_impl_paths = []
        if "../index" in current_file_content:
            possible_impl_paths.append("src/index.ts")
            possible_impl_paths.append("src/index.js")
        
        # Try to extract import paths from the file
        try:
            if 'from "' in current_file_content:
                # Extract imports like: import { app } from "../index"
                for line in current_file_content.split("\n"):
                    if 'from "' in line and "../" in line:
                        import_part = line.split('from "')[1].split('"')[0]
                        if import_part.startswith("../"):
                            rel_path = import_part.replace("../", "src/")
                            possible_impl_paths.append(rel_path + ".ts")
                            possible_impl_paths.append(rel_path + ".js")
        except (IndexError, ValueError):
            pass  # Skip if parsing fails
        
        # Also try removing test/spec from path
        impl_guess = file_path.replace("/tests/", "/").replace(".test.", ".").replace(".spec.", ".")
        if impl_guess != file_path:
            possible_impl_paths.append(impl_guess)
        
        # Try to read each possible implementation file
        for impl_path in possible_impl_paths:
            content = await client.read_file(state["session_id"], impl_path)
            if content:
                impl_file_content = content
                impl_file_path = impl_path
                logger.info(f"[GRAPH] Found implementation file: {impl_path}")
                break

    impl_block = ""
    if impl_file_content and impl_file_path:
        impl_ext = impl_file_path.rsplit(".", 1)[-1] if "." in impl_file_path else ""
        impl_block = f"\n\n=== IMPLEMENTATION FILE ({impl_file_path}) ===\n```{impl_ext}\n{impl_file_content}\n```"

    test_output_block = f"```\n{raw_output[:3000]}{'...<truncated>' if len(raw_output) > 3000 else ''}\n```" if raw_output else "(no test output available)"

    test_file_hint = (
        "\nNOTE: The file reported in the error is a TEST file. "
        "The test assertions are CORRECT. The bug is in the IMPLEMENTATION file.\n"
        "You must fix the IMPLEMENTATION file and return its full corrected contents.\n"
        "Output EXACTLY one line first: TARGET_FILE: <path/to/impl/file>\n"
        "then output the complete corrected implementation file contents on the next lines.\n"
        "Do NOT modify the test file. Do NOT wrap code in markdown fences."
        if is_test_file else ""
    )

    prompt = f"""CI pipeline failed. Fix the issue with a MINIMAL change.

=== ERROR INFO ===
File: {file_path}
Language: {language}
Error Type: {bug_type}
Line: {line_number or 'unknown'}
Message: {error_message}
Full Trace: {error.get('full_trace') or 'None'}
{test_file_hint}
=== TEST FILE CONTENTS ({file_path}) ===
{file_block}{impl_block}

=== FULL TEST OUTPUT ===
{test_output_block}

Return ONLY the complete corrected file contents with no explanation, no markdown fences, no commentary."""

    # ── LLM call ──
    t_llm = time.monotonic()
    raw_fixed = ask_llm(prompt)
    llm_ms = (time.monotonic() - t_llm) * 1000

    # Check if LLM redirected to a different file (for test-file errors)
    fixed_code = raw_fixed
    actual_file_path = file_path
    if is_test_file and "TARGET_FILE:" in raw_fixed[:100]:
        lines = raw_fixed.split("\n", 1)
        first_line = lines[0].strip()
        if first_line.startswith("TARGET_FILE:"):
            suggested_path = first_line.replace("TARGET_FILE:", "").strip()
            if suggested_path:
                actual_file_path = suggested_path
                fixed_code = lines[1] if len(lines) > 1 else ""
                # Strip markdown fences that LLM often adds after TARGET_FILE:
                fixed_code = clean_code_fences(fixed_code)
                logger.info(f"[GRAPH] LLM redirected fix → {actual_file_path}")

    logger.info(f"[GRAPH] LLM returned {len(fixed_code)} chars in {llm_ms:.0f}ms  (target: {actual_file_path})")

    # ── Apply fix via EC2 agent ──
    apply_request = {
        "session_id": state["session_id"],
        "file_path": actual_file_path,
        "fix_content": f"<{len(fixed_code)} chars>",
        "install_command": state.get("install_command"),
        "test_command": state.get("test_command"),
    }

    t_apply = time.monotonic()
    result = await client.apply_fix(
        session_id=state["session_id"],
        file_path=actual_file_path,
        fix_content=fixed_code,
        install_command=state.get("install_command"),
        test_command=state.get("test_command"),
    )
    apply_ms = (time.monotonic() - t_apply) * 1000
    fix_success = result.get("success", False)

    logger.info(f"[GRAPH] apply_fix: success={fix_success}  file_updated={result.get('file_updated')}  ({apply_ms:.0f}ms)")
    logger.info(f"[GRAPH] apply_fix message: {result.get('message','')}")

    # Build commit message
    commit_msg = f"[AI-AGENT] Fix {bug_type} in {actual_file_path}"
    if line_number:
        commit_msg += f" at line {line_number}"

    # Record in fixes_applied
    fixes: list = state.get("fixes_applied", [])
    fixes.append({
        "file": actual_file_path,
        "bug_type": bug_type,
        "line_number": line_number,
        "commit_message": commit_msg,
        "status": "fixed" if fix_success else "failed",
    })
    state["fixes_applied"] = fixes

    # Track unique fixed files
    fixed_files: list[str] = state.get("fixed_files", [])
    if actual_file_path not in fixed_files:
        fixed_files.append(actual_file_path)
    state["fixed_files"] = fixed_files

    # Append to debug trace
    ts = datetime.now(timezone.utc).isoformat()
    trace: list = state.get("debug_trace", [])
    trace.append({
        "stage": "fix_code",
        "iteration": iteration,
        "timestamp": ts,
        "duration_ms": round(llm_ms + apply_ms),
        "llm": {
            "model": "llama-3.3-70b-versatile",
            "prompt_chars": len(prompt),
            "output_chars": len(fixed_code),
            "duration_ms": round(llm_ms),
            "prompt_preview": prompt[:400],
            "output_preview": fixed_code[:400],
        },
        "request": apply_request,
        "response": {
            "success": fix_success,
            "file_updated": result.get("file_updated"),
            "message": result.get("message"),
            "test_result": result.get("test_result", {}),
        },
        "summary": f"{'OK' if fix_success else 'FAILED'} — fixed {actual_file_path} ({bug_type})",
    })
    state["debug_trace"] = trace

    return state
