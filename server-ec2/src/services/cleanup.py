"""Background cleanup of cloned repos whose Redis session has expired."""

import asyncio
import logging
import os
import shutil
import time

from src.app.config import api_settings
from src.services.session_store import session_store

logger = logging.getLogger("ec2_agent")


def sweep_orphaned_repos() -> int:
    """Delete repo directories with no live session. Returns the number removed.

    Directories modified within the last ``session_ttl`` seconds are kept, so a
    clone that is still in progress (session not yet written) is never removed.
    """
    cutoff = time.time() - api_settings.session_ttl
    removed = 0

    try:
        entries = list(os.scandir(api_settings.repos_base_path))
    except FileNotFoundError:
        return 0

    for entry in entries:
        if not entry.is_dir(follow_symlinks=False):
            continue
        if entry.stat(follow_symlinks=False).st_mtime > cutoff:
            continue
        if session_store.exists(entry.name):
            continue
        shutil.rmtree(entry.path, ignore_errors=True)
        removed += 1
        logger.info(f"Removed orphaned repo: {entry.name}")

    return removed


async def run_cleanup_loop() -> None:
    """Sweep orphaned repos every ``cleanup_interval`` seconds until cancelled."""
    while True:
        try:
            removed = await asyncio.to_thread(sweep_orphaned_repos)
            if removed:
                logger.info(f"Cleanup sweep removed {removed} orphaned repo(s)")
        except Exception as e:
            logger.error(f"Cleanup sweep failed: {e}")
        await asyncio.sleep(api_settings.cleanup_interval)
