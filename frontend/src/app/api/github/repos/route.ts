import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/backend";

/** List the signed-in user's repositories (one GitHub API call). */
export async function GET(req: NextRequest) {
  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });
  const repos = await res.json();

  if (!res.ok || !Array.isArray(repos)) {
    return NextResponse.json({ error: repos?.message ?? "Failed to load repositories" }, { status: res.ok ? 502 : res.status });
  }

  return NextResponse.json(
    repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description,
      updated_at: repo.updated_at,
      language: repo.language,
      default_branch: repo.default_branch,
    }))
  );
}
