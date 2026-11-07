import { NextRequest } from "next/server";
import { forwardToBackend, getGitHubToken } from "@/lib/backend";

/**
 * Register a healing run with the AI server. The server clones the repository itself as
 * part of the stream. Returns a single-use `run_id` that the browser uses to open the
 * WebSocket; the user's GitHub token is attached here and never reaches the browser.
 */
export async function POST(req: NextRequest) {
  const { repo_url, language, install_command, test_command, max_iterations } = await req.json();
  const attempts = Number(max_iterations);

  return forwardToBackend("agent", "/api/v1/agent/runs", {
    repo_url,
    language,
    install_command: install_command || undefined,
    test_command: test_command || undefined,
    max_iterations: Number.isInteger(attempts) && attempts >= 1 && attempts <= 10 ? attempts : undefined,
    github_token: await getGitHubToken(req),
  });
}
