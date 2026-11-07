"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Link2, Lock, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitHubIcon } from "@/components/brand";
import { TopBar } from "./AppShell";
import { StatusIcon, toneOfRun } from "./status";
import { useRunHistory } from "@/app/dashboard/run-history";
import {
  LANGUAGE_LABELS,
  getBranchPreview,
  getDefaultCommands,
  getLangColor,
  mapLanguage,
  normalizeRepoUrl,
  timeAgo,
} from "@/app/dashboard/utils";
import type { Language, Repo } from "@/app/dashboard/types";
import type { RunConfig } from "@/app/dashboard/useRunner";
import { cn } from "@/lib/utils";

interface NewRunProps {
  signedIn: boolean;
  userLabel: string;
  repos: Repo[];
  reposLoading: boolean;
  reposError: string | null;
  onRetryRepos: () => void;
  initialRepoUrl: string;
  /** A run that is still streaming; only one can run at a time. */
  liveRun: { id: string; full_name: string } | null;
  onStart: (config: RunConfig) => void;
}

function repoFromUrl(url: string): Repo {
  const fullName = url.replace("https://github.com/", "");
  return {
    id: -1,
    name: fullName.split("/").pop() || "repository",
    full_name: fullName,
    private: false,
    html_url: url,
    description: null,
    updated_at: "",
    language: null,
    default_branch: undefined,
  };
}

export function NewRun({ signedIn, userLabel, repos, reposLoading, reposError, onRetryRepos, initialRepoUrl, liveRun, onStart }: NewRunProps) {
  const initial = normalizeRepoUrl(initialRepoUrl);
  const [query, setQuery] = useState(initial ? initial.replace("https://github.com/", "") : "");
  const [selected, setSelected] = useState<Repo | null>(initial ? repoFromUrl(initial) : null);

  const urlCandidate = useMemo(() => {
    if (!query.includes("/")) return null;
    const url = normalizeRepoUrl(query);
    if (!url) return null;
    const known = repos.find((r) => r.html_url.toLowerCase() === url.toLowerCase());
    return known ?? repoFromUrl(url);
  }, [query, repos]);

  const q = query.trim().toLowerCase();
  const filtered = signedIn && !urlCandidate ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : [];

  return (
    <>
      <TopBar crumbs={[{ label: userLabel }, { label: "New run" }]} />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pb-16 pt-7 sm:px-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-normal tracking-tight">New run</h1>
          <p className="text-sm text-foreground-lighter">
            Pick a repository and check how it installs and tests. Fixes are pushed to a new branch.
          </p>
        </div>

        {liveRun && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-border bg-warning-soft px-4 py-2.5 text-sm">
            <span className="text-foreground-light">
              A run on <span className="text-foreground">{liveRun.full_name}</span> is still in progress. Start a new one when it finishes.
            </span>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard?run=${liveRun.id}`}>View run</Link>
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-start gap-4">
          {/* Repository picker */}
          <section aria-label="Repository" className="min-w-0 flex-[999_1_480px] overflow-hidden rounded-md border border-border bg-surface-100">
            <div className="border-b border-border p-3">
              <label className="flex h-9 items-center gap-2.5 rounded-md border border-border-strong bg-surface-200 px-2.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
                <Search className="h-4 w-4 shrink-0 text-foreground-lighter" aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && urlCandidate) setSelected(urlCandidate);
                  }}
                  placeholder={signedIn ? "Search your repositories, or paste a GitHub URL" : "owner/repo, or a github.com URL"}
                  aria-label="Repository"
                  autoFocus={!initial}
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
                />
              </label>
            </div>

            <div role="listbox" aria-label="Repositories">
              {urlCandidate && (
                <RepoRow repo={urlCandidate} selected={selected?.html_url === urlCandidate.html_url} onSelect={() => setSelected(urlCandidate)} fromUrl />
              )}

              {signedIn && !urlCandidate && (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_110px_90px_80px_36px] gap-3 border-b border-border bg-surface-200 px-4 py-2 text-xs text-foreground-lighter sm:grid">
                    <span>Repository</span>
                    <span>Language</span>
                    <span>Branch</span>
                    <span>Updated</span>
                    <span className="text-center">Last</span>
                  </div>
                  {reposLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 border-b border-border-muted px-4 py-3">
                        <div className="h-3.5 w-56 animate-pulse rounded bg-surface-300" />
                      </div>
                    ))
                  ) : reposError ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                      <AlertCircle className="h-5 w-5 text-danger" aria-hidden />
                      <p className="text-sm text-foreground-light">{reposError}</p>
                      <Button variant="outline" onClick={onRetryRepos}>
                        <RefreshCw /> Try again
                      </Button>
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="px-6 py-14 text-center text-sm text-foreground-lighter">
                      {q ? `No repositories match “${query}”.` : "No repositories on this GitHub account."}
                    </p>
                  ) : (
                    <div className="scroll-quiet max-h-[440px] overflow-y-auto">
                      {filtered.map((repo) => (
                        <RepoRow key={repo.id} repo={repo} selected={selected?.id === repo.id} onSelect={() => setSelected(repo)} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {!signedIn && !urlCandidate && (
                <p className="px-6 py-14 text-center text-sm text-foreground-lighter">
                  Paste a public repository, like <code className="font-mono text-foreground-light">vercel/ms</code>.
                </p>
              )}
            </div>

            <div className="border-t border-border px-4 py-2.5 text-xs text-foreground-lighter">
              {signedIn ? (
                urlCandidate ? (
                  "Using the repository from the URL."
                ) : (
                  `${filtered.length} of ${repos.length} repositories. Any public repository can be pasted as a URL.`
                )
              ) : (
                <>
                  <Link href="/signin?callbackUrl=/dashboard" className="inline-flex items-center gap-1 text-foreground-light hover:text-foreground">
                    <GitHubIcon className="h-3 w-3" /> Sign in
                  </Link>{" "}
                  to choose from your repositories and open pull requests.
                </>
              )}
            </div>
          </section>

          {/* Configuration */}
          {selected ? (
            <ConfigForm key={selected.html_url} repo={selected} onStart={onStart} disabled={!!liveRun} />
          ) : (
            <section className="flex min-h-[200px] flex-[1_1_340px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-6 py-10 text-center">
              <p className="text-sm text-foreground-light">Choose a repository</p>
              <p className="text-xs text-foreground-lighter">Its install and test commands appear here.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function RepoRow({ repo, selected, onSelect, fromUrl }: { repo: Repo; selected: boolean; onSelect: () => void; fromUrl?: boolean }) {
  const [owner, name] = repo.full_name.split("/");
  const runs = useRunHistory();
  const last = runs.find((r) => r.repo.full_name.toLowerCase() === repo.full_name.toLowerCase() && r.status !== "running");

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-muted px-4 py-2.5 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_110px_90px_80px_36px]",
        selected ? "bg-selection shadow-[inset_2px_0_0_var(--brand)]" : "hover:bg-surface-200"
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {fromUrl && <Link2 className="h-3.5 w-3.5 shrink-0 text-foreground-lighter" aria-hidden />}
        <span className="truncate text-[13px]">
          <span className="text-foreground-lighter">{owner} / </span>
          {name}
        </span>
        {repo.private && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-surface-300 px-1.5 py-px text-[11px] text-foreground-light">
            <Lock className="h-2.5 w-2.5" aria-hidden /> Private
          </span>
        )}
      </span>
      <span className="hidden items-center gap-1.5 text-[13px] text-foreground-light sm:flex">
        {repo.language ? (
          <>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getLangColor(repo.language) }} aria-hidden />
            {repo.language}
          </>
        ) : (
          <span className="text-foreground-muted">{fromUrl ? "Public URL" : "—"}</span>
        )}
      </span>
      <span className="hidden truncate font-mono text-xs text-foreground-light sm:block">{repo.default_branch ?? "—"}</span>
      <span className="hidden text-[13px] text-foreground-lighter sm:block">{repo.updated_at ? timeAgo(repo.updated_at, true) : "—"}</span>
      <span className="flex justify-center">
        {last ? <StatusIcon tone={toneOfRun(last.status)} label={`Last run: ${last.status}`} /> : <span className="text-foreground-muted">—</span>}
      </span>
    </button>
  );
}

function ConfigForm({ repo, onStart, disabled }: { repo: Repo; onStart: NewRunProps["onStart"]; disabled: boolean }) {
  const [language, setLanguage] = useState<Language>(repo.language ? mapLanguage(repo.language) : "nodejs");
  const [install, setInstall] = useState(getDefaultCommands(language).install);
  const [test, setTest] = useState(getDefaultCommands(language).test);
  const [attempts, setAttempts] = useState(5);
  const base = repo.default_branch;

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    const d = getDefaultCommands(lang);
    setInstall(d.install);
    setTest(d.test);
  };

  const canStart = !disabled && install.trim() !== "" && test.trim() !== "" && Number.isInteger(attempts) && attempts >= 1 && attempts <= 10;
  const submit = () => {
    if (!canStart) return;
    onStart({
      repo: { full_name: repo.full_name, html_url: repo.html_url, private: repo.private, default_branch: repo.default_branch },
      language,
      installCommand: install.trim(),
      testCommand: test.trim(),
      maxAttempts: attempts,
    });
  };

  return (
    <form
      aria-label="Run configuration"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
      className="min-w-0 flex-[1_1_340px] overflow-hidden rounded-md border border-border bg-surface-100"
    >
      <div className="space-y-0.5 border-b border-border px-4 py-3">
        <h2 className="truncate text-sm font-normal">{repo.full_name.replace("/", " / ")}</h2>
        <p className="text-xs text-foreground-lighter">
          {repo.private ? "Private" : "Public"} · {base ? `default branch ${base}` : "default branch detected when cloned"}
        </p>
      </div>

      <div className="flex flex-col gap-[18px] p-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] text-foreground-light">Runtime</legend>
          <div role="radiogroup" aria-label="Runtime" className="grid grid-cols-2 gap-0.5 rounded-md border border-border-strong bg-background p-0.5">
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                onClick={() => changeLanguage(l)}
                className={cn(
                  "h-7 rounded border text-[13px] transition-colors",
                  language === l ? "border-border-stronger bg-selection text-foreground" : "border-transparent text-foreground-lighter hover:text-foreground"
                )}
              >
                {LANGUAGE_LABELS[l]}
              </button>
            ))}
          </div>
          <p className="text-xs text-foreground-lighter">
            {repo.language ? `Picked from the repository's GitHub language (${repo.language}).` : "Choose how the project is built."}
          </p>
        </fieldset>

        <Field id="install" label="Install command" value={install} onChange={setInstall} />
        <Field id="test" label="Test command" value={test} onChange={setTest} hint="Must exit non-zero when a test fails." />

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="attempts" className="flex flex-col">
            <span className="text-[13px] text-foreground-light">Max test attempts</span>
            <span className="text-xs text-foreground-lighter">The first run plus one per fix, 1–10</span>
          </label>
          <Input
            id="attempts"
            type="number"
            min={1}
            max={10}
            value={attempts}
            onChange={(e) => setAttempts(Number(e.target.value))}
            className="w-16 font-mono text-[13px]"
          />
        </div>

        <div className="space-y-1.5 rounded-md border border-border bg-background p-3 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-foreground-lighter">Pushes to</span>
            <code className="truncate font-mono text-foreground">{getBranchPreview(repo.name)}</code>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-foreground-lighter">Pull request into</span>
            <code className="font-mono text-foreground">{base ?? "default branch"}</code>
          </div>
          <p className="text-foreground-lighter">{base ?? "The default branch"} is never pushed to directly.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <span className="hidden text-xs text-foreground-lighter sm:inline">
          <kbd className="rounded border border-border-strong px-1 font-mono">⌘ ↵</kbd> to start
        </span>
        <Button type="submit" disabled={!canStart} className="ml-auto">
          Start run
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] text-foreground-light">
        {label}
      </label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off" className="font-mono text-[13px]" />
      {hint && <p className="text-xs text-foreground-lighter">{hint}</p>}
    </div>
  );
}
