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

    def clone_repo(self, repo_url: str, session_id: str, branch: str = "main", github_token: str | None = None) -> str:
        """Clone a GitHub repo into /repos/{session_id}/.

        Returns the path to the cloned repo.
        Raises RepositoryCloneError on failure.
        """
        repo_path = self.get_repo_path(session_id)

        # Clean up if session dir already exists
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)

        # Use authenticated URL for private repos
        clone_url = repo_url
        if github_token and repo_url.startswith("https://"):
            clone_url = repo_url.replace("https://", f"https://x-access-token:{github_token}@")

        try:
            logger.info(f"Cloning {repo_url} (branch: {branch}) → {repo_path}")
            Repo.clone_from(
                clone_url,
                repo_path,
                branch=branch,
            )
            # Reset remote URL to original (don't persist token)
            if github_token and clone_url != repo_url:
                repo = self._get_repo(repo_path)
                repo.remote("origin").set_url(repo_url)

            logger.info(f"Clone successful: {repo_path}")
            return repo_path
        except Exception as e:
            err_str = str(e).lower()
            logger.error(f"Clone failed: {e}")

            # Clean up partial clone directory if it was created
            if os.path.exists(repo_path):
                try:
                    shutil.rmtree(repo_path)
                except Exception:
                    pass

            # Classify the error into a user-friendly message
            if "could not read username" in err_str or "authentication failed" in err_str or \
               "invalid username or password" in err_str or "access denied" in err_str or \
               ("remote: repository" in err_str and "not found" in err_str and not github_token):
                raise RepositoryCloneError(
                    "🔒 Repository is private. Please sign in with GitHub so GreenBranch "
                    "can access it, or make the repository public."
                )
            elif "repository not found" in err_str or "does not exist" in err_str or \
                 "not found" in err_str:
                raise RepositoryCloneError(
                    "❌ Repository not found. Please check that the URL is correct and "
                    "the repository exists."
                )
            elif "remote: repository" in err_str and "empty" in err_str or \
                 "nothing to commit" in err_str:
                raise RepositoryCloneError(
                    "📭 Repository is empty. Please push at least one commit before running GreenBranch."
                )
            elif "did not match any file(s) known" in err_str or \
                 "remote branch" in err_str and "not found" in err_str:
                raise RepositoryCloneError(
                    f"🌿 Branch 'main' not found in this repository. "
                    "Please ensure the repository has a 'main' branch, or rename the default branch."
                )
            elif "could not resolve host" in err_str or "network is unreachable" in err_str or \
                 "connection refused" in err_str or "connection timed out" in err_str:
                raise RepositoryCloneError(
                    "🌐 Network error: Could not reach GitHub. Please check your connection and try again."
                )
            else:
                raise RepositoryCloneError(
                    f"Failed to clone repository: {e}"
                )

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
        github_token: str | None = None,
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

        # Set authenticated remote URL if token is provided
        origin = repo.remote("origin")
        if github_token:
            original_url = origin.url
            # Convert https://github.com/owner/repo.git → https://<token>@github.com/owner/repo.git
            if original_url.startswith("https://"):
                auth_url = original_url.replace("https://", f"https://x-access-token:{github_token}@")
                origin.set_url(auth_url)
                logger.info("Set authenticated remote URL for push")

        # Push
        try:
            origin.push(branch_name)
            logger.info(f"Pushed to {branch_name}")
        finally:
            # Reset URL back to original (don't persist token in repo config)
            if github_token:
                origin.set_url(original_url)

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