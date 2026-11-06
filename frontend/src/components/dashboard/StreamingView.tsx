"use client";

import { CheckCircle2, Timer, XCircle } from "lucide-react";
import { BuildLogTerminal } from "./build-log-terminal";
import { StepTracker } from "./StepTracker";
import { formatTime } from "@/app/dashboard/utils";
import type { Fix, LogLine, Repo, StepState } from "@/app/dashboard/types";

interface StreamingViewProps {
  repo: Repo;
  elapsedTime: number;
  logs: LogLine[];
  steps: StepState[];
  fixes: Fix[];
}

/** While cloning or while the pipeline runs: live log, step tracker and fixes so far. */
export function StreamingView({ repo, elapsedTime, logs, steps, fixes }: StreamingViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Deploying fixes &mdash; {repo.name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">GreenBranch is autonomously healing your repository.</p>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
          <Timer className="h-4 w-4" />
          {formatTime(elapsedTime)}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <BuildLogTerminal logs={logs} isStreaming={true} />
        </div>
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary/70">Pipeline Steps</p>
            <StepTracker steps={steps} />
          </div>
          {fixes.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Fixes ({fixes.length})</p>
              <div className="space-y-2">
                {fixes.map((fix, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="truncate font-mono text-foreground">{fix.file}</span>
                    {fix.status === "fixed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
