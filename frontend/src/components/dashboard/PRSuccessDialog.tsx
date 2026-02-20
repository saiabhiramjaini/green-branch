"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  GitPullRequest,
  GitBranch,
  GitCommit,
  FileCode,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Clock,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Fix } from "@/app/dashboard/types";

interface PRSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prUrl: string;
  repoName?: string;
  branchName?: string;
  commitHash?: string;
  fixes: Fix[];
  timeTaken?: number;
  teamName?: string;
  teamLeaderName?: string;
}

export function PRSuccessAlertDialog({
  open,
  onOpenChange,
  prUrl,
  repoName,
  branchName,
  commitHash,
  fixes,
  timeTaken,
  teamName,
  teamLeaderName,
}: PRSuccessDialogProps) {
  const [copied, setCopied] = useState(false);

  const fixedCount = fixes.filter((f) => f.status === "fixed").length;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Generate PR title from fixes
  const prTitle = fixes.length > 0 && fixes[0].commit_message
    ? `AI Fix: ${fixes[0].commit_message.split(":").pop()?.trim().slice(0, 50)}...`
    : "AI Fix: Automated bug fixes";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-2xl border-primary/20 bg-card overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Decorative background */}
        <div className="absolute -top-20 -left-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

        <AlertDialogHeader className="relative">
          {/* Success Icon */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
                <GitPullRequest className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full bg-background ring-4 ring-background">
                <CheckCircle2 className="h-6 w-6 text-green-500 fill-green-500/20" />
              </div>
            </div>
          </div>

          <AlertDialogTitle className="text-2xl text-center">
            Pull Request Created Successfully!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-base">
            Your AI-generated fixes have been committed and a PR has been raised for review.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* PR Details Section */}
        <div className="space-y-4 py-4">
          {/* PR Title */}
          <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
                  PR Title
                </p>
                <p className="text-sm font-medium text-foreground leading-relaxed">
                  {prTitle}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-center">
              <div className="flex justify-center mb-1.5">
                <FileCode className="h-4 w-4 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground">{fixedCount}</p>
              <p className="text-xs text-muted-foreground">Files Fixed</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-center">
              <div className="flex justify-center mb-1.5">
                <GitCommit className="h-4 w-4 text-purple-500" />
              </div>
              <p className="text-lg font-bold text-foreground">{fixedCount}</p>
              <p className="text-xs text-muted-foreground">Commits</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-center">
              <div className="flex justify-center mb-1.5">
                <Clock className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-lg font-bold text-foreground">
                {timeTaken ? formatTime(timeTaken) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">Time Taken</p>
            </div>
          </div>

          {/* Branch & Commit Info */}
          <div className="space-y-2">
            {branchName && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Branch:</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-primary">{branchName}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(branchName)}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {commitHash && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <GitCommit className="h-4 w-4 text-purple-500" />
                  <span className="text-sm text-muted-foreground">Commit:</span>
                </div>
                <code className="text-sm font-mono text-foreground">{commitHash.slice(0, 8)}</code>
              </div>
            )}

            {repoName && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Repository:</span>
                </div>
                <span className="text-sm font-mono text-foreground">{repoName}</span>
              </div>
            )}
          </div>

          {/* Fixes Summary */}
          {fixes.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-yellow-500" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Changes Included in PR
                </p>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {fixes.filter((f) => f.status === "fixed").map((fix, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded-lg bg-background/50 px-3 py-2"
                  >
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs font-mono text-foreground">{fix.file}</code>
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {fix.bug_type}
                        </Badge>
                      </div>
                      {fix.explanation?.changes_made && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {fix.explanation.changes_made}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Info */}
          {(teamName || teamLeaderName) && (
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              {teamName && <span>Team: <span className="text-foreground font-medium">{teamName}</span></span>}
              {teamLeaderName && <span>Leader: <span className="text-foreground font-medium">{teamLeaderName}</span></span>}
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogAction
            onClick={() => onOpenChange(false)}
            className="sm:order-1 bg-secondary text-foreground hover:bg-secondary/80"
          >
            Close
          </AlertDialogAction>
          <Button
            onClick={() => window.open(prUrl, "_blank")}
            className="gap-2 sm:order-2"
          >
            <GitPullRequest className="h-4 w-4" />
            View Pull Request
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
