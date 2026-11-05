import React from "react";
import { Badge } from "@/components/ui/badge";
import { CIRun } from "../../app/dashboard/types";

export function CITimeline({ runs, maxIterations }: { runs: CIRun[]; maxIterations: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">CI/CD Timeline</p>
          <p className="text-xs text-muted-foreground">{runs.length}/{maxIterations} iterations used</p>
        </div>
        {runs.length > 0 && (
          <Badge variant={runs[runs.length - 1].status === "passed" ? "default" : "destructive"}>
            {runs[runs.length - 1].status === "passed" ? "Passing" : "Failing"}
          </Badge>
        )}
      </div>

      <div className="relative">
        <div className="absolute left-4.75 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-4">
          {runs.map((run, idx) => {
            const isPassed = run.status === "passed";
            const isLast = idx === runs.length - 1;
            return (
              <div key={idx} className="relative flex items-start gap-4 pl-0">
                <div
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${
                    isPassed
                      ? "border-primary/30 bg-primary/10"
                      : "border-destructive/30 bg-destructive/10"
                  } ${isLast ? "ring-4 ring-background" : ""}`}
                >
                  <span className={`font-mono text-xs font-bold ${isPassed ? "text-primary" : "text-destructive"}`}>
                    #{run.iteration}
                  </span>
                </div>
                <div className="flex-1 pt-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isPassed ? "text-primary" : "text-destructive"}`}>
                      {isPassed ? "Tests Passed" : "Tests Failed"}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{run.timestamp}</span>
                  </div>
                  {run.errors_count !== undefined && !isPassed && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{run.errors_count} error(s) detected</p>
                  )}
                  {isPassed && <p className="mt-0.5 text-xs text-muted-foreground">All tests passing</p>}
                </div>
              </div>
            );
          })}

          {Array.from({ length: Math.max(0, maxIterations - runs.length) }).map((_, i) => (
            <div key={`remaining-${i}`} className="relative flex items-start gap-4 pl-0">
              <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border/30 bg-background">
                <span className="font-mono text-xs text-muted-foreground/30">#{runs.length + i + 1}</span>
              </div>
              <div className="flex-1 pt-2">
                <span className="text-xs text-muted-foreground/40">Not used</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
