"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubIcon, Wordmark } from "@/components/brand";

function SignIn() {
  const router = useRouter();
  const { status } = useSession();
  const requested = useSearchParams().get("callbackUrl") ?? "";
  // Only same-site paths, so the query string can't redirect elsewhere
  const callbackUrl = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
  }, [status, router, callbackUrl]);

  return (
    <>
      <header className="mx-auto flex h-16 w-full max-w-[960px] items-center px-5">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-[360px] flex-col gap-6 px-5 pt-[14vh]">
        <div className="space-y-2">
          <h1 className="text-[22px] font-semibold tracking-tight">Sign in</h1>
          <p className="text-foreground-lighter">Use GitHub to run on your own repositories and open pull requests.</p>
        </div>
        <Button
          size="lg"
          className="w-full"
          disabled={pending || status === "loading" || status === "authenticated"}
          onClick={() => {
            setPending(true);
            signIn("github", { callbackUrl });
          }}
        >
          {pending || status === "authenticated" ? <Loader2 className="animate-spin" /> : <GitHubIcon className="h-4 w-4" />}
          Continue with GitHub
        </Button>
        <p className="text-xs leading-relaxed text-foreground-lighter">
          Asks for the <code className="font-mono">repo</code>, <code className="font-mono">workflow</code> and{" "}
          <code className="font-mono">read:user</code> scopes, to list repositories, push the fix branch and open pull requests.
        </p>
        <Link href="/" className="text-[13px] text-foreground-lighter hover:text-foreground">
          Continue without signing in
        </Link>
      </main>
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
