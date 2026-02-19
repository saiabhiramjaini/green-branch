"""GraphState — shared state flowing through the LangGraph healing pipeline."""

from typing import TypedDict, Any


class GraphState(TypedDict):
    """State schema for the healing graph."""

    # ── Session ──
    session_id: str
    repo_url: str
    language: str
    branch: str

    # ── Team ──
    team_name: str
    team_leader_name: str
    branch_name: str  # TEAM_NAME_LEADER_AI_Fix

    # ── Test execution ──
    install_command: str | None
    test_command: str | None
    errors: list[dict[str, Any]]
    passed: bool

    # ── Iteration control ──
    current_error: dict[str, Any] | None
    iteration: int
    max_iterations: int

    # ── Tracking (for dashboard) ──
    fixes_applied: list[dict[str, Any]]      # FixApplied dicts
    ci_timeline: list[dict[str, Any]]        # CITimelineEntry dicts
    total_failures_detected: int             # Total unique failures found
    fixed_files: list[str]
    commit_hash: str | None

    # ── Last test run output (for LLM context) ──
    raw_output: str                          # Full raw output from last test run

    # ── Debug trace (full API call log) ──
    debug_trace: list[dict[str, Any]]        # Every API request+response captured
