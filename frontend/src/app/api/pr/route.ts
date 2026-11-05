import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/backend";

const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Open a pull request from the AI fix branch, as the signed-in user. */
export async function POST(req: NextRequest) {
  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json({ success: false, message: "Sign in with GitHub to create a Pull Request." }, { status: 401 });
  }

  const { repo_full_name, branch_name, base_branch, title, body } = await req.json();
  if (typeof repo_full_name !== "string" || !REPO_FULL_NAME.test(repo_full_name) || !branch_name || !title) {
    return NextResponse.json({ success: false, message: "Invalid pull request details." }, { status: 400 });
  }

  const res = await fetch(`https://api.github.com/repos/${repo_full_name}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ title, body: body ?? "", head: branch_name, base: base_branch || "main" }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 201) {
    return NextResponse.json({
      success: true,
      pr_url: data.html_url,
      pr_number: data.number,
      message: `Pull request #${data.number} created successfully`,
    });
  }

  // 422 usually means the PR already exists or there is no diff
  const message = data.errors?.[0]?.message ?? data.message ?? res.statusText;
  return NextResponse.json(
    { success: false, message: `Cannot create PR: ${message}` },
    { status: res.status === 422 ? 200 : res.status }
  );
}
