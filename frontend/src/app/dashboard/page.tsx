"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { RepoPicker } from "@/components/dashboard/RepoPicker";
import { ConfigureStep } from "@/components/dashboard/ConfigureStep";
import { StreamingView } from "@/components/dashboard/StreamingView";
import { FailureView } from "@/components/dashboard/FailureView";
import { ResultsView } from "@/components/dashboard/ResultsView";
import { useGitHubRepos } from "./useGitHubRepos";
import { usePipelineRun } from "./usePipelineRun";

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // A repo URL from the landing page (/dashboard?repo=…) can be run without signing in
  const sharedRepoUrl = useSearchParams().get("repo") ?? "";
  const isUrlFlow = sharedRepoUrl !== "";

  const { repos, loading: reposLoading } = useGitHubRepos(!!session);
  const run = usePipelineRun();

  useEffect(() => {
    if (status === "unauthenticated" && !isUrlFlow) router.push("/signin");
  }, [status, router, isUrlFlow]);

  if (status === "loading" && !isUrlFlow) return <Spinner />;
  if (!session && !isUrlFlow) return null;

  const { phase, repo } = run;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader session={session} elapsedTime={phase === "streaming" ? run.elapsedTime : null} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {phase === "idle" && (
          <RepoPicker
            signedIn={!!session}
            repos={repos}
            reposLoading={reposLoading}
            initialRepoUrl={sharedRepoUrl}
            onRun={run.clone}
          />
        )}

        {phase === "configure" && repo && <ConfigureStep run={run} repo={repo} />}

        {phase === "streaming" && repo && (
          <StreamingView repo={repo} elapsedTime={run.elapsedTime} logs={run.logs} steps={run.steps} fixes={run.fixes} />
        )}

        {phase === "failed" && (
          <FailureView
            repoName={repo?.full_name ?? sharedRepoUrl}
            failedStep={run.failedStep}
            errorMessage={run.errorMessage}
            logs={run.logs}
            onRetry={run.reset}
          />
        )}

        {phase === "done" && repo && <ResultsView run={run} repo={repo} signedIn={!!session} />}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  // useSearchParams needs a Suspense boundary for the page to prerender
  return (
    <Suspense fallback={<Spinner />}>
      <Dashboard />
    </Suspense>
  );
}
