"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Header } from "@/components/app/Header";
import { useDocumentTitle } from "@/lib/use-document-title";
import { RunPage } from "@/components/app/RunPage";
import { useRunnerContext } from "@/app/runner-context";
import { useRunHistory } from "@/app/dashboard/run-history";

const noop = () => () => {};

export default function RunRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const runner = useRunnerContext();
  const history = useRunHistory();
  // Run history lives in localStorage, which only exists after hydration
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  const run = runner.active?.id === id ? runner.active : history.find((r) => r.id === id) ?? null;
  const live = !!run && run.status === "running" && runner.active?.id === run.id;
  useDocumentTitle(run ? `${run.repo.full_name} · Run #${run.number} · GreenBranch` : mounted ? "Run not found · GreenBranch" : "GreenBranch");

  return (
    <>
      <Header />
      {!mounted ? null : run ? (
        <RunPage key={run.id} run={run} live={live} signedIn={!!session} />
      ) : (
        <main className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-5 pt-[10vh]">
          <h1 className="text-[22px] font-semibold tracking-tight">Run not found</h1>
          <p className="text-foreground-lighter">Runs are saved in the browser that started them. This one isn&apos;t here.</p>
          <Link href="/" className="mt-2 w-fit text-sm underline underline-offset-4">
            Start a new run
          </Link>
        </main>
      )}
    </>
  );
}
