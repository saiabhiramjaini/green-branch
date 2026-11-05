import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Wrench, XCircle, ChevronDown, AlertTriangle, Zap, CheckCircle2 } from "lucide-react";
import { Fix } from "../../app/dashboard/types";

export function FixCard({ fix }: { fix: Fix }) {
  const [expanded, setExpanded] = useState(false);
  const hasExplanation = fix.explanation && (fix.explanation.root_cause || fix.explanation.changes_made);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-200 hover:border-border">
      {/* ── Header row ── */}
      <button
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
        onClick={() => hasExplanation && setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fix.status === "fixed"
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
              }`}
          >
            {fix.status === "fixed" ? (
              <Wrench className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-medium text-foreground">
                {fix.file}
              </span>
              <Badge variant="outline" className="text-[10px] font-normal uppercase tracking-wider">
                {fix.bug_type}
              </Badge>
              {fix.line_number > 0 && (
                <span className="text-xs text-muted-foreground">Line {fix.line_number}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {fix.explanation?.root_cause || fix.description || fix.error_message || fix.commit_message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant={fix.status === "fixed" ? "default" : "destructive"}
            className="text-xs"
          >
            {fix.status === "fixed" ? "Fixed" : "Failed"}
          </Badge>
          {hasExplanation && (
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""
                }`}
            />
          )}
        </div>
      </button>

      {/* ── Expanded explanation ── */}
      {expanded && hasExplanation && (
        <div className="border-t border-border/40 bg-muted/30 px-4 py-4 space-y-3">
          {fix.explanation!.root_cause && (
            <div className="flex gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-destructive/10 mt-0.5">
                <AlertTriangle className="h-3 w-3 text-destructive" />
              </div>
              <div>
                <p className="text-xs font-medium text-destructive mb-0.5">Root Cause</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {fix.explanation!.root_cause}
                </p>
              </div>
            </div>
          )}

          {fix.explanation!.changes_made && (
            <div className="flex gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 mt-0.5">
                <Zap className="h-3 w-3 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-primary mb-0.5">Changes Made</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {fix.explanation!.changes_made}
                </p>
              </div>
            </div>
          )}

          {fix.explanation!.impact && (
            <div className="flex gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10 mt-0.5">
                <CheckCircle2 className="h-3 w-3 text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-blue-400 mb-0.5">Impact</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {fix.explanation!.impact}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
