"""Git operations service — clone, branch, commit, push."""

import logging
import os
import re
import shutil

from git import Actor, GitCommandError, Repo

from src.app.config import api_settings
from src.core.exceptions import (
    GitPushError,
    InvalidFilePathError,
    RepositoryCloneError,
    RepositoryNotAllowedError,
    RepositoryNotFoundError,
)

logger = logging.getLogger("ec2_agent")


def ensure_repo_allowed(repo_url: str) -> None:
    """Raise RepositoryNotAllowedError unless the repo's owner is in EC2_AGENT_ALLOWED_REPO_OWNERS.

    An empty allowlist allows every owner (only permitted with the docker executor).
    """
    allowed = api_settings.allowed_repo_owners
    if not allowed:
        return
    match = re.match(r"^https://github\.com/([^/]+)/", repo_url)
    owner = match.group(1).lower() if match else None
    if owner not in allowed:
        raise RepositoryNotAllowedError(
            f"This GreenBranch server only works on repositories owned by: {', '.join(allowed)}."
        )


def _redact(text: str, secret: str | None) -> str:
    """Remove a secret (e.g. a GitHub token embedded in a remote URL) from text."""
    return text.replace(secret, "***") if secret else text


def _authenticated_url(repo_url: str, github_token: str | None) -> str:
    """Embed a GitHub token into an https remote URL."""
    if github_token and repo_url.startswith("https://"):
        return repo_url.replace("https://", f"https://x-access-token:{github_token}@", 1)
    return repo_url


class GitService:
    """Handles all git operations for cloned repositories."""

    def __init__(self, base_path: str | None = None):
        self.base_path = base_path or api_settings.repos_base_path

    def get_repo_path(self, session_id: str) -> str:
        """Return the filesystem path for a session's repo."""
        return os.path.join(self.base_path, session_id)

    def require_repo_path(self, session_id: str) -> str:
        """Return the session's repo path, raising if it is not on disk."""
        repo_path = self.get_repo_path(session_id)
        if not os.path.isdir(repo_path):
            raise RepositoryNotFoundError(
                f"Repository for session {session_id} is no longer on disk. Please start a new session."
            )
        return repo_path

    def resolve_file_path(self, session_id: str, file_path: str) -> str:
        """Resolve a repo-relative path to an absolute path inside the session repo.

        Raises InvalidFilePathError if the path (after resolving symlinks) escapes
        the repo or points into the .git directory.
        """
        repo_path = os.path.realpath(self.require_repo_path(session_id))
        abs_path = os.path.realpath(os.path.join(repo_path, file_path))

        if abs_path == repo_path or os.path.commonpath([repo_path, abs_path]) != repo_path:
            raise InvalidFilePathError(f"Invalid file path (outside repository): {file_path}")
        if os.path.relpath(abs_path, repo_path).split(os.sep)[0] == ".git":
            raise InvalidFilePathError(f"Invalid file path (inside .git): {file_path}")

        return abs_path

    def clone_repo(
        self,
        repo_url: str,
        session_id: str,
        branch: str | None = None,
        github_token: str | None = None,
    ) -> str:
        """Clone a GitHub repo into {base_path}/{session_id}/.

        Clones *branch* if given, otherwise the repository's default branch.
        Returns the path to the cloned repo. Raises RepositoryNotAllowedError if the
        owner isn't allowed, RepositoryCloneError on failure.
        """
        ensure_repo_allowed(repo_url)
        repo_path = self.get_repo_path(session_id)

        # Clean up if session dir already exists
        if os.path.exists(repo_path):
            shutil.rmtree(repo_path)

        clone_url = _authenticated_url(repo_url, github_token)
        clone_kwargs = {"branch": branch} if branch else {}

        try:
            logger.info(f"Cloning {repo_url} (branch: {branch or 'default'}) → {repo_path}")
            repo = Repo.clone_from(clone_url, repo_path, **clone_kwargs)
            # Reset remote URL to original (don't persist token)
            if clone_url != repo_url:
                repo.remote("origin").set_url(repo_url)

            logger.info(f"Clone successful: {repo_path}")
            return repo_path
        except Exception as e:
            err_str = _redact(str(e), github_token).lower()
            logger.error(f"Clone failed: {_redact(str(e), github_token)}")

            # Clean up partial clone directory if it was created
            if os.path.exists(repo_path):
                shutil.rmtree(repo_path, ignore_errors=True)

            # Classify the error into a user-friendly message (never include the raw
            # git error: its command line can contain the authenticated URL).
            if "could not read username" in err_str or "authentication failed" in err_str or \
               "invalid username or password" in err_str or "access denied" in err_str or \
               ("remote: repository" in err_str and "not found" in err_str and not github_token):
                raise RepositoryCloneError(
                    "🔒 Repository is private. Please sign in with GitHub so GreenBranch "
                    "can access it, or make the repository public."
                )
            elif branch and ("remote branch" in err_str and "not found" in err_str):
                raise RepositoryCloneError(
                    f"🌿 Branch '{branch}' not found in this repository. "
                    "Please check the branch name."
                )
            elif "repository not found" in err_str or "does not exist" in err_str or \
                 "not found" in err_str:
                raise RepositoryCloneError(
                    "❌ Repository not found. Please check that the URL is correct and "
                    "the repository exists."
                )
            elif "could not resolve host" in err_str or "network is unreachable" in err_str or \
                 "connection refused" in err_str or "connection timed out" in err_str:
                raise RepositoryCloneError(
                    "🌐 Network error: Could not reach GitHub. Please check your connection and try again."
                )
            else:
                raise RepositoryCloneError("Failed to clone repository. Please check the URL and try again.")

    def get_current_branch(self, session_id: str) -> str:
        """Return the name of the branch currently checked out in the session repo."""
        repo = self._get_repo(self.get_repo_path(session_id))
        return repo.active_branch.name

    def create_branch(self, session_id: str, branch_name: str) -> None:
        """Check out *branch_name*, creating it from HEAD if it doesn't exist yet.

        Safe to call once per commit: later calls reuse the existing branch.
        Raises RepositoryNotFoundError if repo not cloned.
        """
        repo = self._get_repo(self.get_repo_path(session_id))

        if not repo.head.is_detached and repo.active_branch.name == branch_name:
            return

        if any(head.name == branch_name for head in repo.heads):
            logger.info(f"Checking out existing branch: {branch_name}")
            repo.heads[branch_name].checkout()
        else:
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

        # Stage the file (validated to be inside the repo)
        abs_path = self.resolve_file_path(session_id, file_path)
        repo.index.add([os.path.relpath(abs_path, os.path.realpath(repo_path))])

        # Commit with a fixed identity, so it doesn't depend on the host's git config
        author = Actor(api_settings.commit_author_name, api_settings.commit_author_email)
        commit = repo.index.commit(commit_message, author=author, committer=author)
        logger.info(f"Committed: {commit.hexsha[:8]} — {commit_message}")

        # Push with a temporarily authenticated remote URL
        origin = repo.remote("origin")
        original_url = origin.url
        auth_url = _authenticated_url(original_url, github_token)
        if auth_url != original_url:
            origin.set_url(auth_url)
            logger.info("Set authenticated remote URL for push")

        try:
            origin.push(f"refs/heads/{branch_name}:refs/heads/{branch_name}").raise_if_error()
            logger.info(f"Pushed to {branch_name}")
        except GitCommandError as e:
            message = _redact(str(e.stderr or e), github_token).strip()
            logger.error(f"Push to {branch_name} failed: {message}")
            raise GitPushError(f"Push to '{branch_name}' failed: {message}")
        finally:
            # Reset URL back to original (don't persist token in repo config)
            if auth_url != original_url:
                origin.set_url(original_url)

        return commit.hexsha

    def write_file(self, session_id: str, file_path: str, content: str) -> str:
        """Write content to a file in the cloned repo.

        Returns the absolute path of the written file.
        Raises InvalidFilePathError if the path escapes the repo.
        """
        abs_path = self.resolve_file_path(session_id, file_path)

        # Ensure parent directory exists
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        with open(abs_path, "w", encoding="utf-8") as f:
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
