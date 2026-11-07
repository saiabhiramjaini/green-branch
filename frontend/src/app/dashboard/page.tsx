"use client";

import { Suspense, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell, TopBar } from "@/components/console/AppShell";
import { NewRun } from "@/components/console/NewRun";
import { RunView } from "@/components/console/RunView";
import { RunsList } from "@/components/console/RunsList";
import { useGitHubRepos } from "./useGitHubRepos";
import { useRunHistory } from "./run-history";
import { useRunner } from "./useRunner";

const noop = () => () => {};

function Console() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const github = useGitHubRepos(!!session);
  const runner = useRunner();
  const history = useRunHistory();
  // Run history lives in localStorage, which only exists after hydration
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const runId = params.get("run");
  const view = params.get("view");
  const repoParam = params.get("repo") ?? "";
  const signedIn = !!session;
  const userLabel = session?.user?.name || (status === "loading" ? "…" : "Guest");

  const run = runId ? (runner.active?.id === runId ? runner.active : history.find((r) => r.id === runId) ?? null) : null;
  const live = !!run && run.status === "running" && runner.active?.id === run.id;
  const liveRun = runner.active?.status === "running" ? { id: runner.active.id, full_name: runner.active.repo.full_name } : null;

  const start = (config: Parameters<typeof runner.start>[0]) => {
    const id = runner.start(config);
    router.push(`/dashboard?run=${id}`);
  };

  let content: React.ReactNode;
  if (!mounted) {
    content = (
      <div className="flex flex-1 items-center justify-center py-32">
        <Loader2 className="h-5 w-5 animate-spin text-foreground-lighter" aria-label="Loading" />
      </div>
    );
  } else if (view === "runs") {
    content = (
      <>
        <TopBar crumbs={[{ label: userLabel }, { label: "Runs" }]} />
        <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-2 pt-2">
          <RunsList selectedRunId={null} />
        </div>
      </>
    );
  } else if (runId && run) {
    content = (
      <RunView
        key={run.id}
        run={run}
        live={live}
        signedIn={signedIn}
        userLabel={userLabel}
        onRerun={() =>
          start({
            repo: run.repo,
            language: run.language,
            installCommand: run.installCommand,
            testCommand: run.testCommand,
            maxAttempts: run.maxAttempts,
          })
        }
        onPrCreated={(url) => runner.setPrUrl(run.id, url)}
      />
    );
  } else if (runId) {
    content = (
      <>
        <TopBar crumbs={[{ label: userLabel }, { label: "Run not found" }]} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-32 text-center">
          <p className="text-base">This run isn&apos;t in this browser</p>
          <p className="max-w-sm text-sm text-foreground-lighter">Runs are saved on the device that started them. It may have been started elsewhere, or browser data was cleared.</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Start a new run</Link>
          </Button>
        </div>
      </>
    );
  } else {
    content = (
      <NewRun
        key={repoParam}
        signedIn={signedIn}
        userLabel={userLabel}
        repos={github.repos}
        reposLoading={github.loading}
        reposError={github.error}
        onRetryRepos={github.retry}
        initialRepoUrl={repoParam}
        liveRun={liveRun}
        onStart={start}
      />
    );
  }

  return (
    <AppShell section={runId || view === "runs" ? "runs" : "new"} selectedRunId={runId}>
      {content}
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Console />
    </Suspense>
  );
}
