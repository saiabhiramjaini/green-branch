"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatePRDialog } from "@/components/dashboard/CreatePRDialog";
import { PRSuccessAlertDialog } from "@/components/dashboard/PRSuccessDialog";
import { useRunnerContext } from "@/app/runner-context";
import { derive, fixOutcome, formatDuration, logLineClass, type RunRecord, type TimelineItem } from "@/lib/run-model";
import { failureTitle, timeAgo } from "@/app/dashboard/utils";
import { StatusIcon, toneOfItem, toneOfRun } from "./status";
import { RUN_STATUS_LABEL } from "./RecentRuns";
import { cn } from "@/lib/utils";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const STATUS_TEXT: Record<string, string> = {
  pass: "text-brand",
  fail: "text-danger",
  running: "text-warning",
  neutral: "text-foreground-lighter",
  pending: "text-foreground-lighter",
};

export function RunPage({ run, live, signedIn }: { run: RunRecord; live: boolean; signedIn: boolean }) {
  const router = useRouter();
  const runner = useRunnerContext();
  const d = useMemo(() => derive(run.events, live), [run.events, live]);
  const now = useNow(live);
  const result = run.result ?? d.result;
  const prUrl = run.prUrl ?? d.prUrl;
  const branch = result?.branch_name ?? null;
  const repoUrl = result?.repo_url || run.repo.html_url;
  const elapsed = (run.endedAt ?? now) - run.startedAt;
  const prNumber = prUrl?.match(/\/pull\/(\d+)/)?.[1];

  const steps = d.items;
  const real = steps.filter((s) => s.status !== "pending");
  const runningStep = [...real].reverse().find((s) => s.status === "running");
  const defaultOpen = live
    ? runningStep?.id
    : (real.find((s) => s.status === "kept") ?? [...real].reverse().find((s) => s.status === "failed" || s.status === "error"))?.id;
  const [openIds, setOpenIds] = useState<Set<string> | null>(null);
  const isOpen = (id: string) => (openIds ? openIds.has(id) : id === defaultOpen);
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev ?? (defaultOpen ? [defaultOpen] : []));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [showLog, setShowLog] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const kept = d.fixes.filter((f) => fixOutcome(f) === "kept").length;
  const tone = toneOfRun(run.status);
  const summary = [
    `Run #${run.number}`,
    `started ${timeAgo(new Date(run.startedAt).toISOString())}`,
    formatDuration(elapsed),
    d.attempts.length ? `${d.attempts.length} test run${d.attempts.length === 1 ? "" : "s"}` : null,
    d.fixes.length ? `${kept} of ${d.fixes.length} fix${d.fixes.length === 1 ? "" : "es"} kept` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  let statusText: string = RUN_STATUS_LABEL[run.status];
  if (run.status === "passed" && result?.total_failures === 0) statusText = "Already passing";

  const rerun = () => {
    const id = runner.start({
      repo: run.repo,
      language: run.language,
      installCommand: run.installCommand,
      testCommand: run.testCommand,
      maxAttempts: run.maxAttempts,
    });
    router.push(`/runs/${id}`);
  };

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 pb-24 pt-[6vh]">
      {/* Heading */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-[22px] font-semibold tracking-tight">
              <a href={run.repo.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:underline-offset-4">
                {run.repo.full_name}
              </a>
            </h1>
            <p className="text-[13px] text-foreground-lighter">{summary}</p>
          </div>
          <span className={cn("inline-flex items-center gap-1.5 pt-1 text-sm font-medium", STATUS_TEXT[tone])}>
            <StatusIcon tone={tone} label={statusText} />
            {statusText}
          </span>
        </div>

        {run.status === "error" && (
          <p className="text-sm text-danger">
            {failureTitle(run.errorMessage ?? "", run.events.some((e) => e.type === "step" && e.step === "cloning" && e.status === "done") ? "executing" : "cloning")}:{" "}
            <span className="text-foreground-light">{run.errorMessage?.replace(/^[🔒❌📭🌿🌐]\s*/u, "")}</span>
          </p>
        )}
        {run.status === "interrupted" && (
          <p className="text-sm text-foreground-lighter">The page closed while this run was going, so its result wasn&apos;t saved.</p>
        )}

        {!live && (
          <div className="flex flex-wrap items-center gap-2">
            {prUrl ? (
              <Button asChild>
                <a href={prUrl} target="_blank" rel="noopener noreferrer">
                  Pull request {prNumber ? `#${prNumber}` : ""} <ArrowUpRight />
                </a>
              </Button>
            ) : (
              branch && <Button onClick={() => setCreateOpen(true)}>Create pull request</Button>
            )}
            {branch && (
              <Button variant="outline" asChild>
                <a href={`${repoUrl}/tree/${branch}`} target="_blank" rel="noopener noreferrer">
                  View branch <ArrowUpRight />
                </a>
              </Button>
            )}
            <Button variant="ghost" onClick={rerun}>
              Run again
            </Button>
          </div>
        )}
      </div>

      {/* Steps */}
      <ol className="divide-y divide-border border-y border-border">
        {steps.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            log={d.log}
            now={now}
            open={step.status !== "pending" && isOpen(step.id)}
            onToggle={() => toggle(step.id)}
            live={live && step.status === "running"}
          />
        ))}
        {steps.length === 0 && <li className="py-4 text-sm text-foreground-lighter">Waiting for the server…</li>}
      </ol>

      {/* Full log */}
      {d.log.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 text-[13px]">
            <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="text-foreground-lighter hover:text-foreground">
              {showLog ? "Hide full log" : `Show full log (${d.log.length} lines)`}
            </button>
            {showLog && <LogActions log={d.log} fileName={`greenbranch-${run.repo.full_name.replace("/", "-")}-${run.number}.log`} />}
          </div>
          {showLog && <LogLines lines={d.log} start={0} follow={live} className="max-h-[560px] overflow-y-auto" />}
        </div>
      )}

      {branch && (
        <CreatePRDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          repoUrl={repoUrl}
          branchName={branch}
          baseBranch={result?.base_branch}
          commitHash={result?.commit_hash ?? undefined}
          fixes={d.fixes}
          timeTaken={result?.time_taken_seconds}
          isSignedIn={signedIn}
          onPRCreated={(url) => {
            runner.setPrUrl(run.id, url);
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
    </main>
  );
}

function StepRow({
  step,
  log,
  now,
  open,
  onToggle,
  live,
}: {
  step: TimelineItem;
  log: string[];
  now: number;
  open: boolean;
  onToggle: () => void;
  live: boolean;
}) {
  const pending = step.status === "pending";
  const dur = step.endedAt ? formatDuration(step.endedAt - step.startedAt) : step.status === "running" ? formatDuration(now - step.startedAt) : "";
  const fix = step.fix;
  const lines = log.slice(step.logStart, step.logEnd);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-expanded={pending ? undefined : open}
        className="flex w-full items-center gap-3 py-3 text-left disabled:cursor-default"
      >
        <StatusIcon tone={toneOfItem(step.status)} label={step.status} />
        <span className={cn("min-w-0 flex-1 truncate text-sm", pending ? "text-foreground-muted" : "text-foreground")}>
          {step.kind === "edit" ? <span className="font-mono text-[13px]">{step.title.replace(/^Edit /, "")}</span> : step.title}
          <span className="ml-2 text-[13px] text-foreground-lighter">{step.detail}</span>
        </span>
        <span className="font-mono text-xs text-foreground-lighter">{dur}</span>
        {!pending && <ChevronRight className={cn("h-3.5 w-3.5 text-foreground-muted transition-transform", open && "rotate-90")} aria-hidden />}
      </button>

      {open && (
        <div className="flex flex-col gap-4 pb-5 pl-[26px]">
          {fix?.error_message && <Detail label="Failing test" mono text={fix.error_message} className="text-danger-text" />}
          {fix?.explanation?.root_cause && <Detail label="Cause" text={fix.explanation.root_cause} />}
          {fix?.explanation?.changes_made && <Detail label="Change" text={fix.explanation.changes_made} />}
          {fix && fixOutcome(fix) !== "kept" && fix.description && <Detail label="Outcome" text={fix.description} />}
          {fix?.commit_message && <Detail label="Commit" mono text={fix.commit_message} />}
          {lines.length > 0 ? (
            <LogLines lines={lines} start={step.logStart} follow={live} className="max-h-80 overflow-y-auto" />
          ) : (
            <p className="text-[13px] text-foreground-lighter">No output.</p>
          )}
        </div>
      )}
    </li>
  );
}

function Detail({ label, text, mono, className }: { label: string; text: string; mono?: boolean; className?: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-4">
      <span className="text-[13px] text-foreground-lighter">{label}</span>
      <p className={cn("min-w-0 whitespace-pre-wrap break-words text-sm text-foreground-light", mono && "font-mono text-[13px]", className)}>{text}</p>
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
      className={cn("scroll-quiet rounded-md bg-surface-100 py-2 font-mono text-xs leading-[1.75]", className)}
    >
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-11 shrink-0 select-none pr-3 text-right text-foreground-muted">{start + i + 1}</span>
          <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words pr-4", logLineClass(line))}>{line || " "}</span>
        </div>
      ))}
      {follow && (
        <div className="flex">
          <span className="w-11 shrink-0" />
          <span className="animate-caret mt-1 inline-block h-3.5 w-[7px] bg-foreground/60" aria-hidden />
        </div>
      )}
    </div>
  );
}

function LogActions({ log, fileName }: { log: string[]; fileName: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-foreground-lighter hover:text-foreground"
        onClick={() =>
          navigator.clipboard.writeText(log.join("\n")).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => {}
          )
        }
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        type="button"
        className="text-foreground-lighter hover:text-foreground"
        onClick={() => {
          const url = URL.createObjectURL(new Blob([log.join("\n")], { type: "text/plain" }));
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        Download
      </button>
    </>
  );
}
