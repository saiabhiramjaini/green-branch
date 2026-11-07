"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubIcon, Wordmark } from "@/components/brand";
import { Pill, StatusIcon } from "./status";
import { normalizeRepoUrl } from "@/app/dashboard/utils";

const EXAMPLE_STEPS: { title: string; detail: string; tone: "pass" | "fail" | "neutral"; dur: string }[] = [
  { title: "Install dependencies", detail: "npm ci", tone: "pass", dur: "21s" },
  { title: "Test · attempt 1", detail: "1 failing", tone: "fail", dur: "6s" },
  { title: "Edit src/cart.js:38", detail: "Reverted: the test still failed", tone: "neutral", dur: "8s" },
  { title: "Test · attempt 2", detail: "1 failing", tone: "fail", dur: "6s" },
  { title: "Edit src/cart.js:42", detail: "Kept: the tests confirmed it", tone: "pass", dur: "9s" },
  { title: "Test · attempt 3", detail: "All tests passing", tone: "pass", dur: "5s" },
  { title: "Open pull request", detail: "#42 opened", tone: "pass", dur: "2s" },
];

/** The signed-out entry point, shared by "/" and "/signin". */
export function FrontDoor({ mode }: { mode: "home" | "signin" }) {
  const router = useRouter();
  const { status } = useSession();
  const requested = useSearchParams().get("callbackUrl") ?? "";
  // Only same-site paths, so the query string can't redirect elsewhere
  const callbackUrl = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
  const [pending, setPending] = useState(false);
  const [repo, setRepo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl);
  }, [status, router, callbackUrl]);

  const run = (e: React.FormEvent) => {
    e.preventDefault();
    const url = normalizeRepoUrl(repo);
    if (!url) {
      setError("Enter a GitHub repository, like owner/repo.");
      return;
    }
    router.push(`/dashboard?repo=${encodeURIComponent(url)}`);
  };

  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="flex min-w-0 flex-[1_1_420px] flex-col border-border-muted bg-surface-100 px-6 py-6 sm:px-8 md:border-r">
        <Wordmark className="text-base" />

        <div className="mx-auto my-12 flex w-full max-w-[384px] flex-1 flex-col justify-center gap-7">
          <div className="space-y-2">
            <h1 className="text-[28px] font-normal leading-tight tracking-tight">{mode === "signin" ? "Sign in" : "Fix failing tests"}</h1>
            <p className="text-sm leading-relaxed text-foreground-lighter">
              GreenBranch runs your test suite and asks a model for a small edit for each failure. An edit is kept only if the tests
              pass afterwards, and kept edits go to a new branch with a pull request.
            </p>
          </div>

          <Button
            variant="outline"
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

          <div className="flex items-center gap-3 text-xs text-foreground-lighter">
            <span className="h-px flex-1 bg-border" />
            or try a public repository
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={run} noValidate className="flex flex-col gap-2">
            <label htmlFor="front-repo" className="text-[13px] text-foreground-light">
              Repository
            </label>
            <div className="flex h-[38px] items-center rounded-md border border-border-strong bg-surface-200 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
              <span className="select-none font-mono text-[13px] text-foreground-lighter">github.com/</span>
              <input
                id="front-repo"
                value={repo}
                onChange={(e) => {
                  setRepo(e.target.value);
                  setError(null);
                }}
                placeholder="owner/repo"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!!error}
                aria-describedby="front-repo-help"
                className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:text-foreground-muted"
              />
            </div>
            <Button type="submit" size="lg" className="mt-2 w-full">
              Run
            </Button>
            <p id="front-repo-help" className={error ? "text-xs text-danger" : "text-xs text-foreground-lighter"}>
              {error ?? "Node.js or Python. Opening a pull request needs a GitHub sign-in."}
            </p>
          </form>
        </div>

        <p className="text-center text-xs leading-relaxed text-foreground-lighter">
          Sign-in requests the <code className="font-mono">repo</code>, <code className="font-mono">workflow</code> and{" "}
          <code className="font-mono">read:user</code> scopes to list repositories, push the fix branch and open pull requests.{" "}
          <a href="https://github.com/saiabhiramjaini/green-branch" target="_blank" rel="noopener noreferrer" className="text-foreground-light underline underline-offset-2 hover:text-foreground">
            Source on GitHub
          </a>
        </p>
      </section>

      <section aria-label="Example run" className="hidden min-w-0 flex-[999_1_520px] items-center justify-center px-8 py-12 md:flex">
        <figure className="flex w-full max-w-[600px] flex-col gap-3">
          <div className="overflow-hidden rounded-md border border-border bg-surface-100">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="text-sm">
                acme/shop-api <span className="text-foreground-lighter">· Run #128</span>
              </span>
              <Pill tone="pass">Passed</Pill>
            </div>
            <ol>
              {EXAMPLE_STEPS.map((s) => (
                <li key={s.title} className="flex items-center gap-2.5 border-b border-border-muted px-4 py-2 last:border-b-0">
                  <StatusIcon tone={s.tone} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {s.title} <span className="text-foreground-lighter">{s.detail}</span>
                  </span>
                  <span className="font-mono text-xs text-foreground-lighter">{s.dur}</span>
                </li>
              ))}
            </ol>
            <div className="border-t border-border bg-background px-4 py-3">
              <p className="text-xs text-foreground-lighter">Root cause</p>
              <p className="mt-1 text-[13px] text-foreground-light">
                The discount was applied inside the item loop, so it compounded once per item. It now runs once, after the subtotal.
              </p>
            </div>
          </div>
          <figcaption className="text-xs text-foreground-lighter">
            Example run. The first edit was reverted because the test still failed; the second was kept and opened as a pull request.
          </figcaption>
        </figure>
      </section>
    </div>
  );
}
