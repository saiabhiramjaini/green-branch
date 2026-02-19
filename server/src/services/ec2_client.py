"""HTTP client for talking to the EC2 agent service."""

import json
import logging
import time

import httpx

from src.app.config import api_settings
from src.core.exceptions import EC2AgentError, EC2AgentUnreachable

logger = logging.getLogger("rift_server")


def _log_request(method: str, url: str, payload: dict | None = None, params: dict | None = None) -> None:
    """Log outgoing EC2 agent request."""
    logger.info("\n" + "="*60)
    logger.info(f"[EC2-REQ] {method} {url}")
    if params:
        logger.info(f"[EC2-REQ] PARAMS: {json.dumps(params, indent=2)}")
    if payload:
        logger.info(f"[EC2-REQ] BODY: {json.dumps(payload, indent=2, default=str)}")
    logger.info("="*60)


def _log_response(operation: str, status: int, body: dict | str, duration_ms: float) -> None:
    """Log incoming EC2 agent response."""
    logger.info("\n" + "-"*60)
    logger.info(f"[EC2-RES] {operation} → HTTP {status} ({duration_ms:.0f}ms)")
    body_str = json.dumps(body, indent=2, default=str) if isinstance(body, dict) else str(body)[:2000]
    logger.info(f"[EC2-RES] BODY:\n{body_str}")
    logger.info("-"*60)


class EC2Client:
    """
    Async HTTP client wrapping all ec2-agent API calls.

    All methods raise EC2AgentError on non-2xx responses,
    or EC2AgentUnreachable if the agent cannot be reached.
    """

    def __init__(self):
        self.base_url = api_settings.ec2_agent_url.rstrip("/")
        self.headers = {}
        if api_settings.ec2_agent_api_key:
            self.headers["X-API-Key"] = api_settings.ec2_agent_api_key

    def _client(self) -> httpx.AsyncClient:
        """Create an async HTTP client with shared config."""
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=300.0,  # Long timeout — Docker test runs can take time
        )

    async def ping(self) -> bool:
        """Check ec2-agent health. Raises EC2AgentUnreachable on failure."""
        url = f"{self.base_url}/api/v1/health"
        _log_request("GET", url)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.get("/api/v1/health")
                response.raise_for_status()
                body = response.json()
                _log_response("ping", response.status_code, body, (time.monotonic()-t0)*1000)
                return True
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(
                f"Cannot reach EC2 agent at {self.base_url}: {e}"
            )

    async def create_session(
        self,
        repo_url: str,
        language: str,
        user_id: str | None = None,
    ) -> dict:
        """POST /api/v1/sessions — clone repo and create a session."""
        params = {"repo_url": repo_url, "language": language}
        if user_id:
            params["user_id"] = user_id
        url = f"{self.base_url}/api/v1/sessions"
        _log_request("POST", url, params=params)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.post("/api/v1/sessions", params=params)
                self._raise_for_status(response, "create_session")
                body = response.json()
                _log_response("create_session", response.status_code, body, (time.monotonic()-t0)*1000)
                return body
        except (EC2AgentError, EC2AgentUnreachable):
            raise
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(str(e))

    async def execute_tests(
        self,
        session_id: str,
        install_command: str | None = None,
        test_command: str | None = None,
        branch: str = "main",
    ) -> dict:
        """POST /api/v1/execute — run tests for a session."""
        payload: dict = {"session_id": session_id, "branch": branch}
        if install_command:
            payload["install_command"] = install_command
        if test_command:
            payload["test_command"] = test_command

        url = f"{self.base_url}/api/v1/execute"
        _log_request("POST", url, payload=payload)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.post("/api/v1/execute", json=payload)
                self._raise_for_status(response, "execute_tests")
                body = response.json()
                _log_response("execute_tests", response.status_code, body, (time.monotonic()-t0)*1000)
                return body
        except (EC2AgentError, EC2AgentUnreachable):
            raise
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(str(e))

    async def apply_fix(
        self,
        session_id: str,
        file_path: str,
        fix_content: str,
        install_command: str | None = None,
        test_command: str | None = None,
    ) -> dict:
        """POST /api/v1/fix — write fixed file and run tests."""
        payload: dict = {
            "session_id": session_id,
            "file_path": file_path,
            # Truncate fix_content in logs (can be hundreds of lines)
            "fix_content": fix_content,
        }
        if install_command:
            payload["install_command"] = install_command
        if test_command:
            payload["test_command"] = test_command

        # Log with truncated fix_content to keep logs readable
        log_payload = dict(payload)
        log_payload["fix_content"] = f"<{len(fix_content)} chars>"
        url = f"{self.base_url}/api/v1/fix"
        _log_request("POST", url, payload=log_payload)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.post("/api/v1/fix", json=payload)
                self._raise_for_status(response, "apply_fix")
                body = response.json()
                _log_response("apply_fix", response.status_code, body, (time.monotonic()-t0)*1000)
                return body
        except (EC2AgentError, EC2AgentUnreachable):
            raise
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(str(e))

    async def commit_fix(
        self,
        session_id: str,
        file_path: str,
        commit_message: str,
        branch_name: str = "AI_Fix",
    ) -> dict:
        """POST /api/v1/commit — create branch, commit, push."""
        payload = {
            "session_id": session_id,
            "file_path": file_path,
            "commit_message": commit_message,
            "branch_name": branch_name,
        }
        url = f"{self.base_url}/api/v1/commit"
        _log_request("POST", url, payload=payload)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.post("/api/v1/commit", json=payload)
                self._raise_for_status(response, "commit_fix")
                body = response.json()
                _log_response("commit_fix", response.status_code, body, (time.monotonic()-t0)*1000)
                return body
        except (EC2AgentError, EC2AgentUnreachable):
            raise
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(str(e))

    async def delete_session(self, session_id: str) -> dict:
        """DELETE /api/v1/sessions/{session_id} — clean up session."""
        url = f"{self.base_url}/api/v1/sessions/{session_id}"
        _log_request("DELETE", url)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.delete(f"/api/v1/sessions/{session_id}")
                self._raise_for_status(response, "delete_session")
                body = response.json()
                _log_response("delete_session", response.status_code, body, (time.monotonic()-t0)*1000)
                return body
        except (EC2AgentError, EC2AgentUnreachable):
            raise
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(str(e))

    async def get_session(self, session_id: str) -> dict:
        """GET /api/v1/sessions/{session_id}."""
        url = f"{self.base_url}/api/v1/sessions/{session_id}"
        _log_request("GET", url)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.get(f"/api/v1/sessions/{session_id}")
                self._raise_for_status(response, "get_session")
                body = response.json()
                _log_response("get_session", response.status_code, body, (time.monotonic()-t0)*1000)
                return body
        except (EC2AgentError, EC2AgentUnreachable):
            raise
        except httpx.ConnectError as e:
            raise EC2AgentUnreachable(str(e))

    async def read_file(self, session_id: str, file_path: str) -> str:
        """GET /api/v1/files — read a file from the cloned session repo.

        Returns the file content as a string, or empty string on failure.
        """
        url = f"{self.base_url}/api/v1/files"
        params = {"session_id": session_id, "file_path": file_path}
        _log_request("GET", url, params=params)
        t0 = time.monotonic()
        try:
            async with self._client() as client:
                response = await client.get("/api/v1/files", params=params)
                body = response.json()
                _log_response("read_file", response.status_code, body, (time.monotonic()-t0)*1000)
                if response.is_success:
                    return body.get("content", "")
                return ""
        except Exception as exc:
            logger.warning(f"[EC2-RES] read_file failed (non-fatal): {exc}")
            return ""

    # ── Internal ──────────────────────────────────────────

    def _raise_for_status(self, response: httpx.Response, operation: str) -> None:
        """Raise EC2AgentError for non-2xx responses with context."""
        if response.is_success:
            return
        try:
            detail = response.json().get("detail", response.text)
        except Exception:
            detail = response.text
        raise EC2AgentError(
            f"EC2 agent [{operation}] {response.status_code}: {detail}"
        )
