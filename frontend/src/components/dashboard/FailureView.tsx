"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuildLogTerminal } from "./build-log-terminal";
import { failureTitle } from "@/app/dashboard/utils";
import type { FailedStep, LogLine } from "@/app/dashboard/types";

interface FailureViewProps {
  repoName: string;
  failedStep: FailedStep | null;
  errorMessage: string | null;
  logs: LogLine[];
  onRetry: () => void;
}

export function FailureView({ repoName, failedStep, errorMessage, logs, onRetry }: FailureViewProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {failedStep === "cloning" ? "Could not clone repository" : "Pipeline failed"}
        </h1>
        <p className="text-sm text-muted-foreground">{repoName}</p>
      </div>
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">{failureTitle(errorMessage ?? "", failedStep)}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {errorMessage?.replace(/^[🔒❌📭🌿🌐]\s*/u, "") ?? "An unknown error occurred."}
            </p>
          </div>
        </div>
      </div>
      {logs.length > 0 && <BuildLogTerminal logs={logs} isStreaming={false} />}
      <Button variant="outline" onClick={onRetry} className="gap-2 text-sm">
        <RefreshCw className="h-3.5 w-3.5" /> Try again
      </Button>
    </div>
  );
}
