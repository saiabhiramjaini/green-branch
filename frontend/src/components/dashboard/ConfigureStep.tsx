"use client";

import { CheckCircle2, GitBranch, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BuildLogTerminal } from "./build-log-terminal";
import { getBranchPreview } from "@/app/dashboard/utils";
import type { PipelineRun } from "@/app/dashboard/usePipelineRun";
import type { Repo } from "@/app/dashboard/types";

interface ConfigureStepProps {
  run: PipelineRun;
  repo: Repo;
}

/** After cloning: review the install/test commands, then start the pipeline. */
export function ConfigureStep({ run, repo }: ConfigureStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Repository cloned</h1>
          </div>
          <p className="text-sm text-muted-foreground">{repo.full_name}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button
            onClick={run.execute}
            disabled={!run.installCommand.trim() || !run.testCommand.trim()}
            className="gap-2 rounded-xl px-5 transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.3)]"
          >
            <Play className="h-4 w-4" /> Run CI
          </Button>
          <button onClick={run.reset} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Cancel
          </button>
        </div>
      </div>

      <div className="glass-card space-y-5 rounded-2xl p-6">
        <div className="flex items-center gap-2 border-b border-border/50 pb-4">
          <p className="text-sm font-medium text-foreground">Configure commands</p>
          <span className="ml-auto rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
            {run.language}
          </span>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Install command</label>
            <p className="text-xs text-muted-foreground">Install project dependencies</p>
            <Input value={run.installCommand} onChange={(e) => run.setInstallCommand(e.target.value)} placeholder="npm install" className="mt-1 font-mono text-sm bg-secondary/30" spellCheck={false} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Test command</label>
            <p className="text-xs text-muted-foreground">Run your test suite</p>
            <Input value={run.testCommand} onChange={(e) => run.setTestCommand(e.target.value)} placeholder="npm test" className="mt-1 font-mono text-sm bg-secondary/30" spellCheck={false} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">Verified fixes are committed to a new branch</p>
          <code className="text-xs font-medium text-primary">{getBranchPreview(repo.name)}</code>
        </div>
      </div>

      {run.logs.length > 0 && <BuildLogTerminal logs={run.logs} isStreaming={false} />}
    </div>
  );
}
