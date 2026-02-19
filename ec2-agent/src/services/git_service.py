"""Git operations service — clone, branch, commit, push."""

import logging
import os
import shutil

from git import Repo

from src.app.config import api_settings
from src.core.exceptions import RepositoryCloneError, RepositoryNotFoundError

logger = logging.getLogger("ec2_agent")


class GitService:
    """Handles all git operations for cloned repositories."""

    def __init__(self, base_path: str | None = None):
        self.base_path = base_path or api_settings.repos_base_path

    def get_repo_path(self, session_id: str) -> str:
        """Return the filesystem path for a session's repo."""
        return os.path.join(self.base_path, session_id)

    def clone_repo(self, repo_url: str, session_id: str, branch: str = "main") -> str:
        """Clone a GitHub repo into /repos/{session_id}/.

        Returns the path to the cloned repo.
        Raises RepositoryCloneError on failure.
        """
        repo_path = self.get_repo_path(session_id)

        # Clean up if session dir already exists
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)

        try:
            logger.info(f"Cloning {repo_url} (branch: {branch}) → {repo_path}")
            Repo.clone_from(
                repo_url,
                repo_path,
                branch=branch,
            )
            logger.info(f"Clone successful: {repo_path}")
            return repo_path
        except Exception as e:
            logger.error(f"Clone failed: {e}")
            raise RepositoryCloneError(f"Failed to clone {repo_url}: {e}")

    def create_branch(self, session_id: str, branch_name: str) -> None:
        """Create and checkout a new branch.

        Raises RepositoryNotFoundError if repo not cloned.
        """
        repo_path = self.get_repo_path(session_id)
        repo = self._get_repo(repo_path)

        logger.info(f"Creating branch: {branch_name}")
        repo.git.checkout("-b", branch_name)

    def commit_and_push(
        self,
        session_id: str,
        file_path: str,
        commit_message: str,
        branch_name: str,
    ) -> str:
        """Stage a file, commit, and push to remote.

        Returns the commit hash.
        """
        repo_path = self.get_repo_path(session_id)
        repo = self._get_repo(repo_path)

        # Stage the file
        repo.index.add([file_path])

        # Commit
        commit = repo.index.commit(commit_message)
        logger.info(f"Committed: {commit.hexsha[:8]} — {commit_message}")

        # Push
        origin = repo.remote("origin")
        origin.push(branch_name)
        logger.info(f"Pushed to {branch_name}")

        return commit.hexsha

    def write_file(self, session_id: str, file_path: str, content: str) -> str:
        """Write content to a file in the cloned repo.

        Returns the absolute path of the written file.
        """
        repo_path = self.get_repo_path(session_id)
        abs_path = os.path.join(repo_path, file_path)

        # Ensure parent directory exists
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        with open(abs_path, "w") as f:
            f.write(content)

        logger.info(f"Wrote fix to {file_path}")
        return abs_path

    def cleanup_session(self, session_id: str) -> None:
        """Delete a session's cloned repo directory."""
        repo_path = self.get_repo_path(session_id)
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)
            logger.info(f"Cleaned up session: {session_id}")

    def _get_repo(self, repo_path: str) -> Repo:
        """Get a Repo object, raise if path doesn't exist."""
        if not os.path.exists(repo_path):
            raise RepositoryNotFoundError(f"Repo path not found: {repo_path}")
        return Repo(repo_path)