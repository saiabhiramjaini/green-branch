import React from "react";
import { CheckCircle2, Loader2, XCircle, Circle } from "lucide-react";
import { StepState, StepStatus, PipelineStep } from "../../app/dashboard/types";

const ALL_STEPS: { key: PipelineStep; label: string }[] = [
  { key: "cloning", label: "Cloning repository" },
  { key: "running_tests", label: "Running tests" },
  { key: "analyzing", label: "Analyzing failures" },
  { key: "fixing", label: "Applying fixes" },
  { key: "verifying", label: "Verifying changes" },
  { key: "committing", label: "Committing to branch" },
];

export function StepTracker({ steps }: { steps: StepState[] }) {
  return (
    <div className="space-y-1">
      {ALL_STEPS.map((def) => {
        const state = steps.find((s) => s.step === def.key);
        const st: StepStatus = state?.status ?? "pending";

        return (
          <div
            key={def.key}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              st === "running"
                ? "bg-primary/5 text-foreground"
                : st === "done"
                  ? "text-muted-foreground"
                  : st === "error"
                    ? "text-destructive"
                    : "text-muted-foreground/40"
            }`}
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center">
              {st === "done" && <CheckCircle2 className="h-4 w-4 text-primary" />}
              {st === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {st === "error" && <XCircle className="h-4 w-4 text-destructive" />}
              {st === "pending" && <Circle className="h-3 w-3 text-muted-foreground/30" />}
            </div>
            <span className={st === "done" ? "line-through decoration-muted-foreground/30" : ""}>
              {def.label}
            </span>
            {st === "running" && (
              <span className="ml-auto text-xs text-primary">running</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
