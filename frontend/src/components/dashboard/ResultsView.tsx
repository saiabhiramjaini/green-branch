"use client";

import type { ReactNode } from "react";
import { AlertCircle, ArrowUpRight, CheckCircle2, ExternalLink, GitBranch, GitPullRequest, RefreshCw, Timer, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BuildLogTerminal } from "./build-log-terminal";
import { CITimeline } from "./CITimeline";
import { CreatePRDialog } from "./CreatePRDialog";
import { FixesTable } from "./FixesTable";
import { GitHubIcon } from "./GitHubIcon";
import { PRSuccessAlertDialog } from "./PRSuccessDialog";
import { formatTime } from "@/app/dashboard/utils";
import type { PipelineRun } from "@/app/dashboard/usePipelineRun";
import type { Repo } from "@/app/dashboard/types";

interface ResultsViewProps {
  run: PipelineRun;
  repo: Repo;
  signedIn: boolean;
}

function StatCard({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-2xl font-bold text-foreground">{value}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Pipeline finished: summary, stats, fixes, CI timeline and the PR dialogs. */
export function ResultsView({ run, repo, signedIn }: ResultsViewProps) {
  const result = run.finalResult;
  const timeTaken = result?.time_taken_seconds ? formatTime(Math.round(result.time_taken_seconds)) : "0:00";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pipeline complete</h1>
          <p className="text-sm text-muted-foreground">{repo.full_name}</p>
        </div>
        <Badge variant={result?.passed ? "default" : "destructive"} className="text-sm px-3 py-1">
          {result?.passed ? (
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />All Tests Passing</span>
          ) : (
            <span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" />Tests Failing</span>
          )}
        </Badge>
      </div>

      {/* Run Summary */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border/50 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <GitHubIcon className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Run Summary</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Repository</span>
              <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono text-xs truncate max-w-[200px]">
                {repo.full_name}
              </a>
            </div>
          </div>
          <div className="space-y-3">
            {result?.branch_name && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Branch Created</span>
                <code className="text-primary text-xs font-mono truncate max-w-[200px]">{result.branch_name}</code>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Time Taken</span>
              <span className="text-foreground font-mono">{timeTaken}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">CI/CD Status</span>
              <Badge variant={result?.passed ? "default" : "destructive"} className="text-xs">
                {result?.passed ? "PASSED" : "FAILED"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20"><AlertCircle className="h-4 w-4 text-destructive" /></div>}
          value={result?.total_failures ?? 0}
          label="Failures detected"
        />
        <StatCard
          icon={<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20"><CheckCircle2 className="h-4 w-4 text-primary" /></div>}
          value={result?.total_fixed ?? 0}
          label="Fixes applied"
        />
        <StatCard
          icon={<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20"><RefreshCw className="h-4 w-4 text-primary" /></div>}
          value={result?.iterations ?? 0}
          label="Iterations used"
        />
        <StatCard
          icon={<div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/50 border border-border/50"><Timer className="h-4 w-4 text-muted-foreground" /></div>}
          value={timeTaken}
          label="Time taken"
        />
      </div>

      {result?.branch_name && (
        <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5 backdrop-blur-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Branch created</p>
            <code className="truncate text-xs font-medium text-primary">{result.branch_name}</code>
          </div>
          {result.commit_hash && (
            <span className="ml-auto font-mono text-xs text-muted-foreground">{result.commit_hash.slice(0, 8)}</span>
          )}
        </div>
      )}

      <BuildLogTerminal logs={run.logs} isStreaming={false} />

      {run.fixes.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Fixes Applied</h2>
            <p className="text-xs text-muted-foreground">What failed and how AI resolved each issue</p>
          </div>
          <FixesTable fixes={run.fixes} />
        </div>
      )}

      {run.ciRuns.length > 0 && <CITimeline runs={run.ciRuns} maxIterations={run.maxIterations} />}

      <CreatePRDialog
        open={run.showCreatePRDialog}
        onOpenChange={run.setShowCreatePRDialog}
        repoUrl={repo.html_url}
        branchName={result?.branch_name || ""}
        baseBranch={result?.base_branch ?? run.baseBranch}
        commitHash={result?.commit_hash || undefined}
        fixes={run.fixes}
        timeTaken={result?.time_taken_seconds}
        isSignedIn={signedIn}
        onPRCreated={run.onPRCreated}
      />

      <PRSuccessAlertDialog
        open={run.showPrDialog}
        onOpenChange={run.setShowPrDialog}
        prUrl={run.prUrl || ""}
        repoName={run.prRepoName}
        branchName={result?.branch_name || undefined}
        commitHash={result?.commit_hash || undefined}
        fixes={run.fixes}
        timeTaken={result?.time_taken_seconds}
      />

      {/* Persistent "View PR" button once a PR exists */}
      {result?.passed && run.prUrl && (
        <div className="flex justify-center mt-6">
          <Button asChild className="gap-2 shadow-lg hover:shadow-primary/20 transition-all">
            <a href={run.prUrl} target="_blank" rel="noopener noreferrer">
              <GitPullRequest className="h-4 w-4" />
              View Pull Request
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Button variant="outline" onClick={run.reset} className="gap-2 text-sm">
          <RefreshCw className="h-3.5 w-3.5" /> Run another analysis
        </Button>
        {result?.branch_name && (
          <Button asChild className="gap-2 text-sm">
            <a href={`${result.repo_url}/tree/${result.branch_name}`} target="_blank" rel="noopener noreferrer">
              <GitHubIcon className="h-3.5 w-3.5" />
              View branch on GitHub
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
