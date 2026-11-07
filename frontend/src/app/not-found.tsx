import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-[960px] items-center px-5">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-5 pt-[10vh]">
        <p className="font-mono text-[13px] text-foreground-lighter">404</p>
        <h1 className="text-[22px] font-semibold tracking-tight">Page not found</h1>
        <p className="text-foreground-lighter">The link may be old, or the address has a typo.</p>
        <Link href="/" className="mt-2 w-fit text-sm underline underline-offset-4">
          Go to GreenBranch
        </Link>
      </main>
    </>
  );
}
