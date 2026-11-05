import { NextRequest } from "next/server";
import { forwardToBackend, getGitHubToken } from "@/lib/backend";

/**
 * Register a healing run with the AI server. Returns a single-use `run_id` that the
 * browser uses to open the streaming WebSocket; the GitHub token is attached here.
 */
export async function POST(req: NextRequest) {
  const { session_id, repo_url, language, install_command, test_command, branch_name } = await req.json();

  return forwardToBackend("agent", "/api/v1/agent/runs", {
    session_id,
    repo_url,
    language,
    install_command: install_command || undefined,
    test_command: test_command || undefined,
    branch_name: branch_name || undefined,
    github_token: await getGitHubToken(req),
  });
}
