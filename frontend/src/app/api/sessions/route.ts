import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { forwardToBackend, getGitHubToken } from "@/lib/backend";

// Cloning large repositories can take a while
export const maxDuration = 60;

/** Clone a repository into a new runner session. */
export async function POST(req: NextRequest) {
  const { repo_url, language, branch } = await req.json();
  const session = await getServerSession(authOptions);

  return forwardToBackend("runner", "/api/v1/sessions", {
    repo_url,
    language,
    branch: branch || undefined,
    user_id: session?.user?.email ?? session?.user?.name ?? undefined,
    github_token: await getGitHubToken(req),
  });
}
