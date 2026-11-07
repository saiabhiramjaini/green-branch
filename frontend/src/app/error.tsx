"use client";

import { useDocumentTitle } from "@/lib/use-document-title";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useDocumentTitle("Something went wrong · GreenBranch");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-[960px] items-center px-5">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-5 pt-[10vh]">
        <h1 className="text-[22px] font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-foreground-lighter">This page hit an unexpected error. Your saved runs are not affected.</p>
        {error.digest && <p className="font-mono text-xs text-foreground-muted">Reference {error.digest}</p>}
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button variant="ghost" asChild>
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </main>
    </>
  );
}
