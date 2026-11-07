"use client";

import { useDocumentTitle } from "@/lib/use-document-title";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/app/Header";
import { RunForm } from "@/components/app/RunForm";
import { RecentRuns } from "@/components/app/RecentRuns";

function Home() {
  const repo = useSearchParams().get("repo") ?? "";
  useDocumentTitle("GreenBranch");
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-16 px-5 pb-24 pt-[10vh]">
        <div className="flex flex-col gap-8">
          <div className="space-y-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Fix failing tests</h1>
            <p className="text-pretty text-foreground-lighter">Runs your tests, keeps only the fixes that make them pass, and opens a pull request.</p>
          </div>
          <RunForm key={repo} initialRepoUrl={repo} />
        </div>
        <RecentRuns />
      </main>
    </>
  );
}

export default function HomePage() {
  // ?repo= pre-fills the form; reading it needs a Suspense boundary to prerender
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
