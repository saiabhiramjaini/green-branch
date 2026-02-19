"use client";

import { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  GitBranch,
  Cpu,
  Upload,
  Play,
  Activity,
  AlertTriangle,
  Clock,
  Code,
  Zap,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface TraceEntry {
  stage: string;
  iteration?: number;
  timestamp: string;
  duration_ms: number;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  summary: string;
  llm?: {
    model: string;
    prompt_chars: number;
    output_chars: number;
    duration_ms: number;
    prompt_preview: string;
    output_preview: string;
  };
}

interface AgentRunResponse {
  session_id: string;
  status: string;
  passed: boolean;
  iterations: number;
  message: string;
  run_summary: {
    repo_url: string;
    team_name: string;
    team_leader_name: string;
    branch_name: string;
    total_failures: number;
    total_fixes: number;
    final_status: string;
    time_taken_seconds: number;
  };
  score_breakdown: {
    base_score: number;
    speed_bonus: number;
    efficiency_penalty: number;
    total_commits: number;
    final_score: number;
  };
  fixes_applied: Array<{
    file: string;
    bug_type: string;
    line_number: number | null;
    commit_message: string;
    status: string;
  }>;
  ci_timeline: Array<{
    iteration: number;
    status: string;
    errors_count: number;
    fixes_applied: number;
    timestamp: string;
  }>;
  commit_hash: string | null;
  branch_name: string | null;
  errors_remaining: Array<Record<string, unknown>>;
  debug_trace: TraceEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_ICONS: Record<string, React.ReactNode> = {
  create_session: <GitBranch className="h-4 w-4" />,
  execute_tests:  <Play className="h-4 w-4" />,
  fix_code:       <Cpu className="h-4 w-4" />,
  commit_fix:     <Upload className="h-4 w-4" />,
};

const STAGE_COLORS: Record<string, string> = {
  create_session: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  execute_tests:  "text-violet-400 bg-violet-400/10 border-violet-400/30",
  fix_code:       "text-amber-400 bg-amber-400/10 border-amber-400/30",
  commit_fix:     "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
};

const STAGE_LABEL: Record<string, string> = {
  create_session: "Create Session",
  execute_tests:  "Execute Tests",
  fix_code:       "Fix Code (LLM)",
  commit_fix:     "Commit Fix",
};

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtTs(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

// ── Collapsible JSON block ────────────────────────────────────────────────────

function JsonBlock({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const json = JSON.stringify(data, null, 2);
  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 bg-secondary/50 px-3 py-2 text-left text-muted-foreground hover:bg-secondary/80 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Code className="h-3 w-3 shrink-0" />
        <span className="font-mono">{label}</span>
        <span className="ml-auto text-muted-foreground/50">{json.length} chars</span>
      </button>
      {open && (
        <pre className="overflow-x-auto bg-black/30 p-3 font-mono text-xs leading-relaxed text-foreground/80 max-h-64 overflow-y-auto">
          {json}
        </pre>
      )}
    </div>
  );
}

// ── Single trace card ─────────────────────────────────────────────────────────

function TraceCard({ entry }: { entry: TraceEntry }) {
  const [open, setOpen] = useState(false);
  const colorClass = STAGE_COLORS[entry.stage] ?? "text-gray-400 bg-gray-400/10 border-gray-400/30";
  const isError = entry.summary.startsWith("FAIL") || String(entry.response?.success) === "false";

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${isError ? "border-red-500/30" : "border-border"}`}>
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-secondary/30 transition-colors"
      >
        {/* Stage badge */}
        <span className={`mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono font-semibold ${colorClass}`}>
          {STAGE_ICONS[entry.stage] ?? <Activity className="h-3 w-3" />}
          {STAGE_LABEL[entry.stage] ?? entry.stage}
          {entry.iteration != null && <span className="opacity-60">#{entry.iteration}</span>}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${isError ? "text-red-400" : "text-foreground"}`}>
            {entry.summary}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground font-mono">
            {fmtTs(entry.timestamp)} · {formatMs(entry.duration_ms)}
          </p>
        </div>

        <span className="mt-0.5 shrink-0">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </span>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-border space-y-3 p-4">
          {/* LLM section (fix_code only) */}
          {entry.llm && (
            <div className="rounded-md border border-amber-400/20 bg-amber-400/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-400 tracking-wide uppercase">LLM Call — {entry.llm.model}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Prompt</p>
                  <p className="font-mono text-foreground">{entry.llm.prompt_chars.toLocaleString()} chars</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Output</p>
                  <p className="font-mono text-foreground">{entry.llm.output_chars.toLocaleString()} chars</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Latency</p>
                  <p className="font-mono text-foreground">{formatMs(entry.llm.duration_ms)}</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Prompt preview:</p>
                <pre className="overflow-x-auto rounded bg-black/30 p-2 text-xs font-mono text-foreground/70 whitespace-pre-wrap max-h-32 overflow-y-auto">{entry.llm.prompt_preview}</pre>
                <p className="text-xs text-muted-foreground">Output preview:</p>
                <pre className="overflow-x-auto rounded bg-black/30 p-2 text-xs font-mono text-foreground/70 whitespace-pre-wrap max-h-32 overflow-y-auto">{entry.llm.output_preview}</pre>
              </div>
            </div>
          )}

          {/* Request / Response JSON */}
          <JsonBlock label="REQUEST" data={entry.request} defaultOpen={false} />
          <JsonBlock label="RESPONSE" data={entry.response} defaultOpen />
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const SERVER_URL = process.env.NEXT_PUBLIC_AGENT_SERVER_URL ?? "http://localhost:8000";

export default function DebugPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [language, setLanguage] = useState("python");
  const [teamName, setTeamName] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [installCmd, setInstallCmd] = useState("");
  const [testCmd, setTestCmd] = useState("");
  const [maxIter, setMaxIter] = useState("5");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentRunResponse | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  async function handleRun() {
    if (!repoUrl.trim() || !teamName.trim() || !leaderName.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await axios.post<AgentRunResponse>(
        `${SERVER_URL}/api/v1/agent/run`,
        {
          repo_url: repoUrl.trim(),
          language,
          team_name: teamName.trim(),
          team_leader_name: leaderName.trim(),
          install_command: installCmd.trim() || undefined,
          test_command: testCmd.trim() || undefined,
          max_iterations: parseInt(maxIter) || 5,
        },
        { timeout: 600_000 }
      );
      setResult(data);
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.response?.data?.message ?? err.message)
        : String(err);
      setError(String(msg));
    } finally {
      setRunning(false);
    }
  }

  const passed = result?.passed ?? false;
  const score = result?.score_breakdown;
  const summary = result?.run_summary;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur px-6 py-3 flex items-center gap-3">
        <Terminal className="h-5 w-5 text-primary" />
        <span className="font-mono text-sm font-semibold">RIFT Debug Console</span>
        <Badge variant="outline" className="ml-auto font-mono text-xs">
          {SERVER_URL}
        </Badge>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">

        {/* ── Form ── */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" /> Trigger Agent Run
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs text-muted-foreground">GitHub Repo URL *</label>
              <Input
                placeholder="https://github.com/org/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="font-mono text-xs"
                disabled={running}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Team Name *</label>
              <Input
                placeholder="RIFT TEAM"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                disabled={running}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Team Leader *</label>
              <Input
                placeholder="John Doe"
                value={leaderName}
                onChange={(e) => setLeaderName(e.target.value)}
                disabled={running}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={running}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="python">Python</option>
                <option value="nodejs">Node.js</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Max Iterations</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={maxIter}
                onChange={(e) => setMaxIter(e.target.value)}
                disabled={running}
                className="font-mono"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Install Command (optional)</label>
              <Input
                placeholder="pip install -r requirements.txt"
                value={installCmd}
                onChange={(e) => setInstallCmd(e.target.value)}
                disabled={running}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">Test Command (optional)</label>
              <Input
                placeholder="pytest"
                value={testCmd}
                onChange={(e) => setTestCmd(e.target.value)}
                disabled={running}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <Button
            onClick={handleRun}
            disabled={running || !repoUrl.trim() || !teamName.trim() || !leaderName.trim()}
            className="w-full gap-2"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Agent running… (this may take a few minutes)
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run Agent
              </>
            )}
          </Button>
        </section>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
          </div>
        )}

        {/* ── Running skeleton ── */}
        {running && (
          <div className="space-y-3">
            {["Cloning repo…", "Running test suite…", "Analyzing failures…", "Fixing code with LLM…", "Committing changes…"].map((label) => (
              <div key={label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div className="space-y-6">

            {/* Status banner */}
            <div className={`flex items-center gap-3 rounded-xl border p-5 ${passed ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
              {passed
                ? <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0" />
                : <XCircle className="h-7 w-7 text-red-400 shrink-0" />}
              <div>
                <p className={`text-lg font-bold ${passed ? "text-emerald-400" : "text-red-400"}`}>
                  {result.run_summary.final_status}
                </p>
                <p className="text-sm text-muted-foreground">{result.message}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Session</p>
                <p className="font-mono text-xs text-foreground">{result.session_id.slice(0, 8)}…</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Iterations", value: result.iterations, icon: <Activity className="h-4 w-4" /> },
                { label: "Failures", value: summary?.total_failures ?? 0, icon: <XCircle className="h-4 w-4" /> },
                { label: "Fixes", value: summary?.total_fixes ?? 0, icon: <CheckCircle2 className="h-4 w-4" /> },
                { label: "Time", value: `${summary?.time_taken_seconds ?? 0}s`, icon: <Clock className="h-4 w-4" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} className="rounded-lg border border-border bg-card p-4 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {icon}
                  </div>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Score card */}
            {score && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Zap className="h-4 w-4 text-primary" /> Score Breakdown
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {[
                    { k: "Base", v: score.base_score, color: "text-foreground" },
                    { k: "Speed Bonus", v: `+${score.speed_bonus}`, color: "text-emerald-400" },
                    { k: "Efficiency Penalty", v: `-${score.efficiency_penalty}`, color: "text-red-400" },
                    { k: "Final Score", v: score.final_score, color: "text-primary font-bold text-base" },
                  ].map(({ k, v, color }) => (
                    <div key={k} className="rounded-md border border-border bg-secondary/30 p-3 text-center">
                      <p className="text-xs text-muted-foreground">{k}</p>
                      <p className={`mt-1 font-mono ${color}`}>{v}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Branch: <span className="font-mono text-foreground">{result.branch_name ?? summary?.branch_name ?? "—"}</span>
                  {result.commit_hash && (
                    <> · Commit: <span className="font-mono text-foreground">{result.commit_hash.slice(0, 8)}</span></>
                  )}
                </p>
              </div>
            )}

            {/* CI Timeline */}
            {result.ci_timeline.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> CI Timeline
                </h3>
                <div className="space-y-2">
                  {result.ci_timeline.map((entry) => (
                    <div key={entry.iteration} className="flex items-center gap-3 text-sm">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-mono font-bold ${entry.status === "passed" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {entry.iteration}
                      </span>
                      <span className={`w-16 text-xs font-semibold ${entry.status === "passed" ? "text-emerald-400" : "text-red-400"}`}>
                        {entry.status.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">{entry.errors_count} error(s) · {entry.fixes_applied} fix(es)</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{fmtTs(entry.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fixes Applied */}
            {result.fixes_applied.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Code className="h-4 w-4 text-primary" /> Fixes Applied
                </h3>
                <div className="space-y-2">
                  {result.fixes_applied.map((fix, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-secondary/20 p-3">
                      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${fix.status === "fixed" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {fix.status}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-foreground">{fix.file}{fix.line_number ? `:${fix.line_number}` : ""}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{fix.commit_message}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">{fix.bug_type}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Debug Trace ── */}
            <Separator />
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Terminal className="h-4 w-4 text-primary" />
                API Trace
                <Badge variant="outline" className="ml-1 font-mono text-xs">{result.debug_trace.length} calls</Badge>
              </h3>

              {result.debug_trace.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No trace entries. Make sure the server has debug_trace enabled.</p>
              ) : (
                <div className="space-y-2">
                  {result.debug_trace.map((entry, i) => (
                    <TraceCard key={i} entry={entry} />
                  ))}
                </div>
              )}
            </div>

            {/* Errors remaining */}
            {result.errors_remaining.length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Errors Remaining ({result.errors_remaining.length})
                </h3>
                {result.errors_remaining.map((e, i) => (
                  <div key={i} className="rounded-md border border-red-500/20 bg-red-500/5 p-3 font-mono text-xs text-red-300">
                    <p className="font-semibold">{String(e.error_type)} in {String(e.file)}{e.line ? `:${e.line}` : ""}</p>
                    <p className="mt-1 text-red-300/70">{String(e.message)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Raw JSON */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setRawOpen(!rawOpen)}
                className="flex w-full items-center gap-2 bg-secondary/50 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:bg-secondary/80 transition-colors"
              >
                {rawOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Raw Response JSON
                <span className="ml-auto text-xs text-muted-foreground/50">{JSON.stringify(result).length.toLocaleString()} chars</span>
              </button>
              {rawOpen && (
                <ScrollArea className="h-96">
                  <pre className="bg-black/40 p-4 font-mono text-xs leading-relaxed text-foreground/80">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </ScrollArea>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
