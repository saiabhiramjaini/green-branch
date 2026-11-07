"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowUpRight, ChevronRight, Copy, Check, Download, GitPullRequest, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TopBar } from "./AppShell";
import { Pill, StatusIcon, toneOfItem } from "./status";
import { CreatePRDialog } from "@/components/dashboard/CreatePRDialog";
import { PRSuccessAlertDialog } from "@/components/dashboard/PRSuccessDialog";
import { derive, fixOutcome, formatDuration, logLineClass, type RunRecord, type TimelineItem } from "@/lib/run-model";
import { LANGUAGE_LABELS, failureTitle, timeAgo } from "@/app/dashboard/utils";
import { cn } from "@/lib/utils";

interface RunViewProps {
  run: RunRecord;
  live: boolean;
  signedIn: boolean;
  userLabel: string;
  onRerun: () => void;
  onPrCreated: (url: string) => void;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function liveTitle(item: TimelineItem | undefined) {
  if (!item) return "Starting";
  switch (item.kind) {
    case "setup":
      return "Cloning the repository";
    case "test":
      return `Running tests, attempt ${item.attempt}`;
    case "edit":
      return item.title === "Edit" ? "Reading the failure" : `Editing ${item.title.replace(/^Edit /, "")}`;
    case "commit":
      return "Committing verified edits";
    case "pr":
      return "Opening the pull request";
  }
}

export function RunView({ run, live, signedIn, userLabel, onRerun, onPrCreated }: RunViewProps) {
  const d = useMemo(() => derive(run.events, live), [run.events, live]);
  const now = useNow(live);
  const result = run.result ?? d.result;
  const prUrl = run.prUrl ?? d.prUrl;
  const branch = result?.branch_name ?? null;
  const elapsed = (run.endedAt ?? now) - run.startedAt;

  const real = d.items.filter((i) => i.status !== "pending");
  const running = [...real].reverse().find((i) => i.status === "running");
  const defaultSelected = live
    ? running ?? real[real.length - 1]
    : real.find((i) => i.status === "kept") ?? [...real].reverse().find((i) => i.status === "failed" || i.status === "error") ?? real[real.length - 1];
  const [picked, setPicked] = useState<string | null>(null);
  const selected = d.items.find((i) => i.id === picked) ?? defaultSelected;

  const [createOpen, setCreateOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const kept = d.fixes.filter((f) => fixOutcome(f) === "kept").length;
  const notKept = d.fixes.length - kept;
  const maxAttempts = d.attempts[0]?.total ?? run.maxAttempts;

  let title: string;
  let pill: { tone: Parameters<typeof Pill>[0]["tone"]; label: string };
  if (live) {
    title = liveTitle(running);
    pill = { tone: "running", label: `Running · ${formatDuration(elapsed)}` };
  } else if (run.status === "error") {
    title = failureTitle(run.errorMessage ?? "", run.events.some((e) => e.type === "step" && e.step === "cloning" && e.status === "done") ? "executing" : "cloning");
    pill = { tone: "fail", label: "Error" };
  } else if (run.status === "interrupted") {
    title = "Run interrupted";
    pill = { tone: "neutral", label: "Interrupted" };
  } else if (result?.passed && result.total_failures === 0) {
    title = "Tests were already passing";
    pill = { tone: "pass", label: "Passed" };
  } else if (result?.passed) {
    title = `All tests passing after ${result.total_fixed} fix${result.total_fixed === 1 ? "" : "es"}`;
    pill = { tone: "pass", label: "Passed" };
  } else if (run.status === "partial") {
    title = `${result?.total_fixed} fix${result?.total_fixed === 1 ? "" : "es"} kept, tests still failing`;
    pill = { tone: "fail", label: "Partly fixed" };
  } else {
    title = "Tests still failing";
    pill = { tone: "fail", label: "Failed" };
  }

  const [owner, repoName] = run.repo.full_name.split("/");

  return (
    <>
      <TopBar
        crumbs={[{ label: userLabel }, { label: run.repo.full_name, href: `/dashboard?repo=${encodeURIComponent(run.repo.html_url)}` }, { label: `Run #${run.number}` }]}
        actions={
          <>
            <Button variant="outline" onClick={onRerun} disabled={live}>
              <RotateCcw /> Run again
            </Button>
            {branch && (
              <Button variant="outline" asChild>
                <a href={`${result?.repo_url || run.repo.html_url}/tree/${branch}`} target="_blank" rel="noopener noreferrer">
                  View branch <ArrowUpRight />
                </a>
              </Button>
            )}
            {prUrl ? (
              <Button asChild>
                <a href={prUrl} target="_blank" rel="noopener noreferrer">
                  <GitPullRequest /> Pull request {prUrl.match(/\/pull\/(\d+)/)?.[1] ? `#${prUrl.match(/\/pull\/(\d+)/)?.[1]}` : ""}
                </a>
              </Button>
            ) : (
              branch &&
              !live && (
                <Button onClick={() => setCreateOpen(true)}>
                  <GitPullRequest /> Create pull request
                </Button>
              )
            )}
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 pb-16 pt-7 sm:px-8">
        {/* Title */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-normal tracking-tight">{title}</h1>
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </div>
          <p className="text-sm text-foreground-lighter">
            <span className="text-foreground-light">{owner}</span> / <span className="text-foreground-light">{repoName}</span> · started{" "}
            {timeAgo(new Date(run.startedAt).toISOString())}
            {result?.base_branch && (
              <>
                {" "}on <code className="font-mono text-[13px] text-foreground-light">{result.base_branch}</code>
              </>
            )}{" "}
            · {LANGUAGE_LABELS[run.language]} · <code className="font-mono text-[13px] text-foreground-light">{run.installCommand}</code> then{" "}
            <code className="font-mono text-[13px] text-foreground-light">{run.testCommand}</code>
          </p>
        </div>

        {run.status === "error" && (
          <div role="alert" className="flex gap-3 rounded-md border border-danger-border bg-danger-soft px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <p className="min-w-0 break-words text-sm text-foreground-light">{run.errorMessage?.replace(/^[🔒❌📭🌿🌐]\s*/u, "")}</p>
          </div>
        )}
        {run.status === "interrupted" && (
          <div className="rounded-md border border-border-strong bg-surface-100 px-4 py-3 text-sm text-foreground-light">
            This page was closed or reloaded while the run was streaming, so its outcome wasn&apos;t recorded. Any branch it pushed is still on GitHub.
          </div>
        )}

        {/* Stats */}
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Duration" value={<span className="font-mono">{formatDuration(elapsed)}</span>} />
          <Stat
            label="Test attempts"
            value={
              <>
                {d.attempts.length} <span className="text-sm text-foreground-lighter">of {maxAttempts}</span>
              </>
            }
          />
          <Stat
            label="Edits"
            value={
              <>
                {kept} <span className="text-sm text-foreground-lighter">kept{notKept ? `, ${notKept} not kept` : ""}</span>
              </>
            }
          />
          <Stat
            label="Fix branch"
            value={branch ? <span className="block truncate font-mono text-[13px]">{branch}</span> : <span className="text-sm text-foreground-lighter">{live ? "Not yet" : "None pushed"}</span>}
          />
        </dl>

        {/* Steps + selected step */}
        <div className="flex flex-wrap items-start gap-4">
          <section aria-label="Steps" className="min-w-0 flex-[1_1_300px] overflow-hidden rounded-md border border-border bg-surface-100">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-normal">Steps</h2>
              <span className="text-xs text-foreground-lighter">{real.length} steps</span>
            </div>
            <ol>
              {d.items.map((item) => {
                const isSel = item.id === selected?.id;
                const dur = item.endedAt ? formatDuration(item.endedAt - item.startedAt) : item.status === "running" ? formatDuration(now - item.startedAt) : "";
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={item.status === "pending"}
                      onClick={() => setPicked(item.id)}
                      aria-current={isSel ? "step" : undefined}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-b border-border-muted px-4 py-2.5 text-left transition-colors disabled:cursor-default",
                        isSel ? "bg-selection shadow-[inset_2px_0_0_var(--brand)]" : "enabled:hover:bg-surface-200"
                      )}
                    >
                      <StatusIcon tone={toneOfItem(item.status)} label={item.status} className="mt-[3px]" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("truncate text-[13px]", item.status === "pending" ? "text-foreground-lighter" : "text-foreground")}>{item.title}</span>
                        <span className="text-xs text-foreground-lighter">{item.detail}</span>
                      </span>
                      <span className="font-mono text-xs text-foreground-lighter">{dur}</span>
                    </button>
                  </li>
                );
              })}
              {d.items.length === 0 && <li className="px-4 py-6 text-sm text-foreground-lighter">Waiting for the server…</li>}
            </ol>
          </section>

          {selected && <StepDetail item={selected} log={d.log} live={live && selected.status === "running"} />}
        </div>

        <FullLog items={real} log={d.log} live={live} defaultOpen={selected?.id ?? null} fileName={`greenbranch-${repoName}-run-${run.number}.log`} />
      </div>

      {branch && (
        <CreatePRDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          repoUrl={result?.repo_url || run.repo.html_url}
          branchName={branch}
          baseBranch={result?.base_branch}
          commitHash={result?.commit_hash ?? undefined}
          fixes={d.fixes}
          timeTaken={result?.time_taken_seconds}
          isSignedIn={signedIn}
          onPRCreated={(url) => {
            onPrCreated(url);
            setCreateOpen(false);
            setSuccessOpen(true);
          }}
        />
      )}
      {prUrl && (
        <PRSuccessAlertDialog
          open={successOpen}
          onOpenChange={setSuccessOpen}
          prUrl={prUrl}
          repoName={run.repo.full_name}
          branchName={branch ?? undefined}
          baseBranch={result?.base_branch}
          fixes={d.fixes}
        />
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-100 px-4 py-3.5">
      <dt className="text-xs text-foreground-lighter">{label}</dt>
      <dd className="mt-1.5 min-w-0 text-xl">{value}</dd>
    </div>
  );
}

function StepDetail({ item, log, live }: { item: TimelineItem; log: string[]; live: boolean }) {
  const fix = item.fix;
  const outcome = fix ? fixOutcome(fix) : null;
  const lines = log.slice(item.logStart, item.logEnd);

  return (
    <section aria-label="Selected step" className="min-w-0 flex-[999_1_480px] overflow-hidden rounded-md border border-border bg-surface-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className={cn("truncate text-sm font-normal", item.kind === "edit" && "font-mono")}>{item.kind === "edit" ? item.title.replace(/^Edit /, "") : item.title}</h2>
          {fix?.bug_type && <Pill tone="neutral">{fix.bug_type}</Pill>}
          {outcome && <Pill tone={outcome === "kept" ? "pass" : outcome === "reverted" ? "neutral" : "fail"}>{outcome === "kept" ? "Kept" : outcome === "reverted" ? "Reverted" : "Not applied"}</Pill>}
        </div>
        <span className="text-xs text-foreground-lighter">{item.detail}</span>
      </div>

      <div className="flex flex-col gap-[18px] p-4">
        {item.status === "pending" && <p className="text-sm text-foreground-lighter">Runs after the earlier steps finish.</p>}

        {fix && (
          <>
            {fix.error_message && (
              <Block label="Failing test">
                <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-background px-3 py-2.5 font-mono text-xs leading-relaxed text-danger-text">
                  {fix.error_message}
                </pre>
              </Block>
            )}
            {fix.explanation?.root_cause && <Block label="Root cause"><p className="max-w-[68ch] text-sm text-foreground-light">{fix.explanation.root_cause}</p></Block>}
            {fix.explanation?.changes_made && <Block label="Change"><p className="max-w-[68ch] text-sm text-foreground-light">{fix.explanation.changes_made}</p></Block>}
            {fix.explanation?.impact && <Block label="Impact"><p className="max-w-[68ch] text-sm text-foreground-light">{fix.explanation.impact}</p></Block>}
            {outcome !== "kept" && fix.description && <Block label="Outcome"><p className="max-w-[68ch] text-sm text-foreground-light">{fix.description}</p></Block>}
            {fix.commit_message && (
              <Block label="Commit message">
                <code className="font-mono text-[13px] text-foreground-light">{fix.commit_message}</code>
              </Block>
            )}
          </>
        )}

        {item.status !== "pending" && (
          <Block label={live ? "Output (live)" : "Output"}>
            {lines.length ? (
              <LogLines lines={lines} start={item.logStart} follow={live} className="max-h-[360px] overflow-y-auto rounded-md border border-border" />
            ) : (
              <p className="text-sm text-foreground-lighter">No output for this step.</p>
            )}
          </Block>
        )}
      </div>
    </section>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-normal text-foreground-lighter">{label}</h3>
      {children}
    </div>
  );
}

function LogLines({ lines, start, follow, className }: { lines: string[]; start: number; follow?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (follow && el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines, follow]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={cn("scroll-quiet bg-background py-1.5 font-mono text-xs leading-[1.8]", className)}
    >
      {lines.map((line, i) => (
        <div key={i} className="flex hover:bg-surface-100">
          <span className="w-12 shrink-0 select-none pr-3 text-right text-foreground-muted">{start + i + 1}</span>
          <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words pr-4", logLineClass(line))}>{line || " "}</span>
        </div>
      ))}
      {follow && (
        <div className="flex">
          <span className="w-12 shrink-0" />
          <span className="animate-caret mt-1 inline-block h-3.5 w-[7px] bg-brand" aria-hidden />
        </div>
      )}
    </div>
  );
}

function FullLog({ items, log, live, defaultOpen, fileName }: { items: TimelineItem[]; log: string[]; live: boolean; defaultOpen: string | null; fileName: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen ? [defaultOpen] : []));
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const q = query.trim().toLowerCase();

  const copy = () => {
    navigator.clipboard.writeText(log.join("\n")).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {}
    );
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([log.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label="Log" className="overflow-hidden rounded-md border border-border bg-surface-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 pl-4 pr-3">
        <h2 className="text-sm font-normal">Log</h2>
        <div className="flex items-center gap-1.5">
          <label className="flex h-[26px] items-center gap-1.5 rounded-md border border-border-strong bg-surface-200 px-2 focus-within:border-brand">
            <Search className="h-3 w-3 text-foreground-lighter" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search log"
              aria-label="Search log"
              className="w-32 bg-transparent text-xs text-foreground outline-none placeholder:text-foreground-muted"
            />
          </label>
          <Button variant="outline" size="sm" onClick={copy} disabled={!log.length}>
            {copied ? <Check className="text-brand" /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" onClick={download} disabled={!log.length || live}>
            <Download /> Download
          </Button>
        </div>
      </div>

      {q ? (
        (() => {
          const hits = log.map((line, i) => ({ line, i })).filter((h) => h.line.toLowerCase().includes(q));
          return hits.length ? (
            <div className="bg-background py-1.5 font-mono text-xs leading-[1.8]">
              {hits.map((h) => (
                <div key={h.i} className="flex">
                  <span className="w-12 shrink-0 select-none pr-3 text-right text-foreground-muted">{h.i + 1}</span>
                  <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words pr-4", logLineClass(h.line))}>{h.line}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-foreground-lighter">No lines match “{query}”.</p>
          );
        })()
      ) : (
        <div className="bg-background py-1">
          {items.map((item) => {
            const isOpen = open.has(item.id);
            const dur = item.endedAt ? formatDuration(item.endedAt - item.startedAt) : "";
            return (
              <div key={item.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggle(item.id)}
                  className="flex w-full items-center gap-2 px-4 py-1 text-left font-mono text-xs hover:bg-surface-100"
                >
                  <ChevronRight className={cn("h-3 w-3 text-foreground-lighter transition-transform", isOpen && "rotate-90")} aria-hidden />
                  <StatusIcon tone={toneOfItem(item.status)} className="h-3 w-3" />
                  <span className="flex-1 truncate text-foreground">{item.title}</span>
                  <span className="text-foreground-lighter">{item.logEnd - item.logStart} lines{dur ? ` · ${dur}` : ""}</span>
                </button>
                {isOpen && <LogLines lines={log.slice(item.logStart, item.logEnd)} start={item.logStart} className="border-y border-border-muted" />}
              </div>
            );
          })}
          {items.length === 0 && <p className="px-4 py-3 font-mono text-xs text-foreground-lighter">Waiting for output…</p>}
        </div>
      )}
    </section>
  );
}
