// Server-only helpers for route handlers that talk to GitHub and the GreenBranch backends.
// Backend API keys and the user's GitHub token stay on the server; the browser never sees them.

import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

/** The signed-in user's GitHub OAuth token, read from the encrypted session cookie. */
export async function getGitHubToken(req: NextRequest): Promise<string | undefined> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return token?.accessToken;
}

const BACKENDS = {
  agent: { url: process.env.AGENT_SERVER_URL, key: process.env.AGENT_SERVER_API_KEY, name: "AGENT_SERVER_URL" },
} as const;

/** Turn a FastAPI error body ({detail: string | validation errors[]}) into one message. */
function errorMessage(data: unknown, fallback: string): string {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { loc?: unknown[]; msg?: string }) => `${d.loc?.slice(-1)[0] ?? "request"}: ${d.msg}`).join("; ");
  }
  return fallback;
}

/** POST a JSON body to a backend with its API key and relay the response to the browser. */
export async function forwardToBackend(backend: keyof typeof BACKENDS, path: string, body: unknown) {
  const { url, key, name } = BACKENDS[backend];
  if (!url) {
    return NextResponse.json({ detail: `${name} is not configured.` }, { status: 500 });
  }

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key ?? "" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "GreenBranch backend is unreachable. Please try again later." }, { status: 502 });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json({ detail: errorMessage(data, res.statusText) }, { status: res.status });
  }
  return NextResponse.json(data, { status: res.status });
}
