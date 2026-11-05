"""select_error node — picks the next error the agent hasn't given up on."""

from src.runner.fix_engine import pick_error
from src.state.graph_state import GraphState


async def select_error(state: GraphState) -> GraphState:
    """Set current_error to the first error with attempts left (None if there is none)."""

    if state["passed"]:
        state["current_error"] = None
        return state

    state["current_error"] = pick_error(state["errors"], state.get("attempts", {}))
    return state
