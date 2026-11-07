import { redirect } from "next/navigation";

/** Old URLs: /dashboard, /dashboard?run=<id>, /dashboard?repo=<url>. */
export default async function DashboardRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const run = typeof params.run === "string" ? params.run : null;
  const repo = typeof params.repo === "string" ? params.repo : null;
  if (run) redirect(`/runs/${encodeURIComponent(run)}`);
  redirect(repo ? `/?repo=${encodeURIComponent(repo)}` : "/");
}
