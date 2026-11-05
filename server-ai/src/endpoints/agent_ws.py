"""WebSocket endpoint for real-time agent pipeline streaming."""

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status

from src.core.exceptions import PipelineAborted
from src.runner.streaming_runner import run_streaming
from src.services.run_store import run_store

logger = logging.getLogger("greenbranch")

router = APIRouter(tags=["Agent WebSocket"])


@router.websocket("/agent/ws")
async def agent_websocket(websocket: WebSocket, run_id: str = Query(...)):
    """
    Real-time pipeline streaming over WebSocket.

    Protocol
    --------
    1. The frontend's backend registers the run with ``POST /agent/runs`` (API-key
       authenticated) and receives a single-use ``run_id``.
    2. The browser connects to ``/agent/ws?run_id=…``. Unknown, used or expired
       ids are rejected with close code 1008.
    3. Server streams events back as JSON messages:
       - ``{ type: "step", step, status }``                   — pipeline step status change
       - ``{ type: "log", line, ts }``                        — build log line
       - ``{ type: "iteration", iteration, total, status }``  — iteration result
       - ``{ type: "fix", fix: {...} }``                      — fix verified or failed
       - ``{ type: "pr_created", pr_url, repo_name }``        — PR opened
       - ``{ type: "complete", result: {...} }``              — final result
       - ``{ type: "error", message, step? }``                — fatal error (no ``complete`` follows)
    4. Server closes the connection after ``complete`` or ``error``.
    """
    await websocket.accept()

    config = run_store.claim(run_id)
    if config is None:
        logger.warning("[WS] Rejected connection with unknown or expired run_id")
        await websocket.send_json({"type": "error", "message": "This run link is invalid or has expired. Please start the run again."})
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    logger.info(f"[WS] Client connected: repo_url={config.get('repo_url')}")

    async def send_event(event: dict) -> None:
        try:
            await websocket.send_json(event)
        except Exception as exc:
            logger.warning(f"[WS] send failed: {exc}")

    try:
        result = await run_streaming(log=send_event, **config)
        await websocket.send_json({"type": "complete", "result": result})
        logger.info(f"[WS] Pipeline complete: passed={result.get('passed')}")

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected")
    except PipelineAborted as exc:
        logger.info(f"[WS] Pipeline aborted at {exc.step}: {exc}")
        await send_event({"type": "error", "message": str(exc), "step": exc.step})
    except Exception as exc:
        logger.error(f"[WS] Unhandled error: {exc}", exc_info=True)
        await send_event({"type": "error", "message": getattr(exc, "detail", None) or str(exc)})
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
