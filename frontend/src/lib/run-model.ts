// The run model: everything the UI shows about a run is derived from the ordered list of
// events the AI server streams over the WebSocket (see server-ai/src/runner/streaming_runner.py).

import type { FinalResult, Fix, Language } from "@/app/dashboard/types";

export type StreamEvent =
  | { type: "log"; line: string; ts?: string }
  | { type: "step"; step: string; status: "running" | "done" | "error" }
  | { type: "iteration"; iteration: number; total: number; status: "passed" | "failed"; errors_count: number }
  | { type: "fix"; fix: Fix }
  | { type: "pr_created"; pr_url: string; repo_name?: string }
  | { type: "complete"; result: FinalResult }
  | { type: "error"; message: string; step?: string };

/** An event plus the time (ms since epoch) the browser received it. */
export type TimedEvent = StreamEvent & { at: number };

export type RunStatus = "running" | "passed" | "partial" | "failed" | "error" | "interrupted";

export interface RunRecord {
  id: string;
  number: number;
  repo: { full_name: string; html_url: string; private?: boolean; default_branch?: string };
  language: Language;
  installCommand: string;
  testCommand: string;
  maxAttempts: number;
  startedAt: number;
  endedAt?: number;
  status: RunStatus;
  events: TimedEvent[];
  result?: FinalResult | null;
  prUrl?: string | null;
  errorMessage?: string | null;
}

export type ItemKind = "setup" | "test" | "edit" | "commit" | "pr";
export type ItemStatus = "running" | "passed" | "failed" | "kept" | "reverted" | "error" | "pending" | "stopped";

export interface TimelineItem {
  id: string;
  kind: ItemKind;
  title: string;
  detail: string;
  status: ItemStatus;
  startedAt: number;
  endedAt?: number;
  /** Range of this step's lines in the run's log, [logStart, logEnd). */
  logStart: number;
  logEnd: number;
  attempt?: number;
  fix?: Fix;
}

export interface Derived {
  items: TimelineItem[];
  log: string[];
  fixes: Fix[];
  attempts: { iteration: number; total: number; status: "passed" | "failed"; errors_count: number }[];
  result: FinalResult | null;
  prUrl: string | null;
  errorMessage: string | null;
}

const TEST_HEADER = /^▶ (?:Running test suite|Re-running tests) \(iteration (\d+)\/(\d+)\)/;
const ERROR_LINE = /^Error: (\S+) in (.+?)(?: at line (\d+))?$/;
const COMMIT_HEADER = /^▶ Committing (\d+) file\(s\) to (.+?)…?$/;

function fixTitle(fix: Fix) {
  return `Edit ${fix.file}${fix.line_number ? `:${fix.line_number}` : ""}`;
}

export function fixOutcome(fix: Fix): "kept" | "reverted" | "error" {
  if (fix.status === "fixed") return "kept";
  return /reverted/i.test(fix.description ?? "") ? "reverted" : "error";
}

/** Fold the event stream into steps, log lines and the final result. */
export function derive(events: TimedEvent[], live: boolean): Derived {
  const items: TimelineItem[] = [];
  const log: string[] = [];
  const fixes: Fix[] = [];
  const attempts: Derived["attempts"] = [];
  let result: FinalResult | null = null;
  let prUrl: string | null = null;
  let errorMessage: string | null = null;

  const current = () => items[items.length - 1];
  const open = (item: Omit<TimelineItem, "id" | "logStart" | "logEnd">) => {
    const prev = current();
    if (prev && prev.endedAt === undefined) {
      prev.endedAt = item.startedAt;
      prev.logEnd = log.length;
    }
    items.push({ ...item, id: `s${items.length}`, logStart: log.length, logEnd: log.length });
  };
  const lastOfKind = (kind: ItemKind) => [...items].reverse().find((i) => i.kind === kind);

  for (const e of events) {
    switch (e.type) {
      case "log": {
        const t = e.line.trim();
        let m: RegExpMatchArray | null;
        if (t.startsWith("$ git clone") || t.startsWith("✓ Using existing session")) {
          if (!lastOfKind("setup")) open({ kind: "setup", title: "Set up workspace", detail: "Cloning the repository", status: "running", startedAt: e.at });
        } else if ((m = t.match(TEST_HEADER))) {
          const n = Number(m[1]);
          open({ kind: "test", title: `Test · attempt ${n}`, detail: "Running", status: "running", startedAt: e.at, attempt: n });
        } else if (t.startsWith("▶ Analyzing failures")) {
          open({ kind: "edit", title: "Edit", detail: "Reading the failure", status: "running", startedAt: e.at });
        } else if (t.startsWith("▶ Generating AI fix")) {
          const cur = current();
          if (cur?.kind === "edit" && !cur.fix) cur.detail = "Asking the model for an edit";
          else open({ kind: "edit", title: "Edit", detail: "Asking the model for an edit", status: "running", startedAt: e.at });
        } else if ((m = t.match(COMMIT_HEADER))) {
          open({ kind: "commit", title: "Commit and push", detail: `${m[1]} file${m[1] === "1" ? "" : "s"} to ${m[2]}`, status: "running", startedAt: e.at });
        } else if (t.startsWith("▶ Creating Pull Request")) {
          open({ kind: "pr", title: "Open pull request", detail: "Creating the pull request", status: "running", startedAt: e.at });
        } else {
          const cur = current();
          if (cur?.kind === "edit" && !cur.fix) {
            if ((m = t.match(ERROR_LINE))) cur.title = `Edit ${m[2]}${m[3] ? `:${m[3]}` : ""}`;
            else if (t.startsWith("Applying fix to ")) cur.detail = "Applying the edit";
            else if (t.startsWith("Fix written")) cur.detail = "Waiting for the next test run";
          }
        }
        log.push(e.line);
        const cur = current();
        if (cur) cur.logEnd = log.length;
        break;
      }
      case "step": {
        if (e.step === "cloning") {
          const setup = lastOfKind("setup");
          if (setup) {
            if (e.status === "done") Object.assign(setup, { status: "passed", detail: "Repository cloned" });
            if (e.status === "error") Object.assign(setup, { status: "error", detail: "Clone failed" });
          }
        } else if (e.status === "error") {
          const kind: ItemKind | null =
            e.step === "running_tests" || e.step === "verifying" ? "test"
            : e.step === "fixing" || e.step === "analyzing" ? "edit"
            : e.step === "committing" ? "commit"
            : e.step === "pr_creation" ? "pr"
            : null;
          const item = kind && lastOfKind(kind);
          if (item && item.status === "running") item.status = "error";
        } else if (e.status === "done") {
          if (e.step === "committing") {
            const c = lastOfKind("commit");
            if (c) c.status = "passed";
          }
        }
        break;
      }
      case "iteration": {
        attempts.push({ iteration: e.iteration, total: e.total, status: e.status, errors_count: e.errors_count });
        const item = items.find((i) => i.kind === "test" && i.attempt === e.iteration);
        if (item) {
          item.status = e.status;
          item.detail = e.status === "passed" ? "All tests passing" : `${e.errors_count} failing`;
        }
        break;
      }
      case "fix": {
        fixes.push(e.fix);
        let item = [...items].reverse().find((i) => i.kind === "edit" && !i.fix);
        if (!item) {
          open({ kind: "edit", title: "Edit", detail: "", status: "running", startedAt: e.at });
          item = current();
        }
        const outcome = fixOutcome(e.fix);
        item.fix = e.fix;
        item.title = fixTitle(e.fix);
        item.status = outcome;
        item.detail =
          outcome === "kept" ? "Kept: the tests confirmed it"
          : outcome === "reverted" ? "Reverted: the test still failed"
          : "Could not be applied";
        break;
      }
      case "pr_created": {
        prUrl = e.pr_url;
        const pr = lastOfKind("pr");
        const num = e.pr_url.match(/\/pull\/(\d+)/)?.[1];
        if (pr) Object.assign(pr, { status: "passed", detail: num ? `#${num} opened` : "Opened" });
        break;
      }
      case "complete": {
        result = e.result;
        break;
      }
      case "error": {
        errorMessage = e.message;
        const cur = current();
        if (cur && cur.status === "running") cur.status = "error";
        break;
      }
    }
  }

  const last = current();
  const finished = !live;
  if (last && last.endedAt === undefined && finished) {
    last.endedAt = events[events.length - 1]?.at ?? last.startedAt;
  }
  // Anything still "running" after the run ended never got an outcome
  if (finished) for (const i of items) if (i.status === "running") i.status = "stopped";

  if (live) {
    if (!lastOfKind("commit")) items.push(pendingItem("commit", "Commit and push", "Only edits the tests confirm", items.length, log.length));
    if (!lastOfKind("pr")) items.push(pendingItem("pr", "Open pull request", "Into the default branch", items.length, log.length));
  }

  return { items, log, fixes, attempts, result, prUrl, errorMessage };
}

function pendingItem(kind: ItemKind, title: string, detail: string, index: number, logAt: number): TimelineItem {
  return { id: `p${index}`, kind, title, detail, status: "pending", startedAt: 0, logStart: logAt, logEnd: logAt };
}

export function statusFromResult(result: FinalResult | null | undefined): RunStatus {
  if (!result) return "failed";
  if (result.passed) return "passed";
  return result.total_fixed > 0 ? "partial" : "failed";
}

export function formatDuration(ms: number) {
  if (ms < 1000) return "<1s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/** Colour class for one log line. */
export function logLineClass(line: string): string {
  const t = line.trimStart();
  if (t.startsWith("▶")) return "text-foreground font-medium";
  if (t.startsWith("ERROR") || t.startsWith("✗") || t.startsWith("FAIL") || / FAIL(ED)? /.test(line)) return "text-danger";
  if (t.startsWith("✓") || t.startsWith("PASS")) return "text-brand";
  if (t.startsWith("$")) return "text-code-string";
  if (t.startsWith("[install]")) return "text-foreground-lighter";
  if (t.startsWith("Calling AI") || t.startsWith("AI response") || t.startsWith("Generating fix explanation")) return "text-code-keyword";
  return "text-foreground-light";
}
