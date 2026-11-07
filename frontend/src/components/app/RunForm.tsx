"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronDown, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRunnerContext } from "@/app/runner-context";
import { useGitHubRepos } from "@/app/dashboard/useGitHubRepos";
import { LANGUAGE_LABELS, getDefaultCommands, mapLanguage, normalizeRepoUrl } from "@/app/dashboard/utils";
import type { Language, Repo } from "@/app/dashboard/types";
import { cn } from "@/lib/utils";

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
  };
}

/** Repository box with suggestions, a Run button and collapsed options. */
export function RunForm({ initialRepoUrl }: { initialRepoUrl: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const github = useGitHubRepos(!!session);
  const runner = useRunnerContext();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const initial = normalizeRepoUrl(initialRepoUrl);
  const [query, setQuery] = useState(initial ? initial.replace("https://github.com/", "") : "");
  const [picked, setPicked] = useState<Repo | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showOptions, setShowOptions] = useState(false);
  const [language, setLanguage] = useState<Language>("nodejs");
  const [install, setInstall] = useState(getDefaultCommands("nodejs").install);
  const [test, setTest] = useState(getDefaultCommands("nodejs").test);
  const [attempts, setAttempts] = useState(5);
  const [commandsEdited, setCommandsEdited] = useState(false);

  const live = runner.active?.status === "running" ? runner.active : null;

  // Focus the box on desktop only; on phones it would pop the keyboard on load
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const suggestions = useMemo(() => {
    if (!session) return [];
    const q = query.trim().toLowerCase();
    return github.repos.filter((r) => r.full_name.toLowerCase().includes(q)).slice(0, 8);
  }, [session, github.repos, query]);
  const loadingRepos = !!session && github.loading;
  const showList = open && (suggestions.length > 0 || loadingRepos);

  const applyLanguage = (lang: Language) => {
    setLanguage(lang);
    if (!commandsEdited) {
      const d = getDefaultCommands(lang);
      setInstall(d.install);
      setTest(d.test);
    }
  };

  const pick = (repo: Repo) => {
    setPicked(repo);
    setQuery(repo.full_name);
    setOpen(false);
    setError(null);
    if (repo.language) applyLanguage(mapLanguage(repo.language));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (live) return;
    const url = normalizeRepoUrl(query);
    if (!url) {
      setError("Enter a GitHub repository, like owner/repo.");
      inputRef.current?.focus();
      return;
    }
    if (!install.trim() || !test.trim()) {
      setShowOptions(true);
      setError("Install and test commands can't be empty.");
      return;
    }
    const repo =
      picked && picked.html_url.toLowerCase() === url.toLowerCase()
        ? picked
        : github.repos.find((r) => r.html_url.toLowerCase() === url.toLowerCase()) ?? repoFromUrl(url);
    const id = runner.start({
      repo: { full_name: repo.full_name, html_url: repo.html_url, private: repo.private, default_branch: repo.default_branch },
      language,
      installCommand: install.trim(),
      testCommand: test.trim(),
      maxAttempts: Math.min(10, Math.max(1, Math.round(attempts) || 5)),
    });
    router.push(`/runs/${id}`);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <div
            className={cn(
              "flex h-10 items-center rounded-md border bg-background px-3 transition-colors",
              error ? "border-danger" : "border-border-strong hover:border-border-stronger focus-within:border-foreground/40 focus-within:ring-4 focus-within:ring-foreground/5"
            )}
          >
            <span className="select-none font-mono text-base text-foreground-lighter sm:text-[13px]">github.com/</span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
                setError(null);
                setOpen(true);
                setActive(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (!showList) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, suggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && suggestions[active] && !query.includes("/")) {
                  e.preventDefault();
                  pick(suggestions[active]);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="owner/repo"
              aria-label="GitHub repository"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={showList && suggestions[active] ? `${listId}-${active}` : undefined}
              aria-invalid={!!error}
              aria-describedby={error ? `${listId}-error` : undefined}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-base text-foreground outline-none placeholder:text-foreground-muted sm:text-[13px]"
            />
          </div>

          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="scroll-quiet absolute left-0 right-0 top-[calc(100%+6px)] z-20 max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-[0_8px_30px_rgb(0_0_0/0.08)]"
            >
              {loadingRepos && suggestions.length === 0 && (
                <li className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-foreground-lighter">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading your repositories…
                </li>
              )}
              {suggestions.map((repo, i) => (
                <li key={repo.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(repo)}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px]", i === active && "bg-surface-200")}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-foreground-lighter">{repo.full_name.split("/")[0]}/</span>
                      {repo.name}
                    </span>
                    {repo.private && <Lock className="h-3 w-3 text-foreground-muted" aria-label="Private" />}
                    {repo.language && <span className="text-xs text-foreground-lighter">{repo.language}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" size="lg" disabled={!!live}>
          Run
        </Button>
      </div>

      {error && (
        <p id={`${listId}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      )}

      {live && (
        <p className="text-[13px] text-foreground-lighter">
          A run on {live.repo.full_name} is still going.{" "}
          <Link href={`/runs/${live.id}`} className="text-foreground underline underline-offset-4">
            View it
          </Link>
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          aria-expanded={showOptions}
          className="inline-flex max-w-full items-center gap-1.5 text-[13px] text-foreground-lighter hover:text-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showOptions && "-rotate-90")} aria-hidden />
          Options
          {!showOptions && (
            <span className="flex min-w-0 items-center gap-1.5 text-foreground-muted">
              <span aria-hidden>·</span>
              {LANGUAGE_LABELS[language]}
              <span aria-hidden>·</span>
              <span className="truncate font-mono text-xs">{test}</span>
            </span>
          )}
        </button>

        {showOptions && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-foreground-light">Runtime</span>
              <select
                value={language}
                onChange={(e) => applyLanguage(e.target.value as Language)}
                className="h-9 rounded-md border border-border-strong bg-background px-2.5 text-base outline-none hover:border-border-stronger focus-visible:border-foreground/40 sm:text-sm"
              >
                {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-foreground-light">Max test runs</span>
              <Input type="number" min={1} max={10} value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-foreground-light">Install command</span>
              <Input
                value={install}
                onChange={(e) => {
                  setInstall(e.target.value);
                  setCommandsEdited(true);
                }}
                spellCheck={false}
                className="font-mono sm:text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-foreground-light">Test command</span>
              <Input
                value={test}
                onChange={(e) => {
                  setTest(e.target.value);
                  setCommandsEdited(true);
                }}
                spellCheck={false}
                className="font-mono sm:text-[13px]"
              />
            </label>
          </div>
        )}
      </div>

      {!session && (
        <p className="mt-2 text-[13px] text-foreground-lighter">
          Public repositories work without an account.{" "}
          <Link href="/signin" className="text-foreground underline underline-offset-4">
            Sign in with GitHub
          </Link>{" "}
          for private ones and pull requests.
        </p>
      )}
      {session && github.error && <p className="text-[13px] text-foreground-lighter">{github.error} You can still paste a repository.</p>}
    </form>
  );
}
