"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Copy, GitPullRequest } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Fix } from "@/app/dashboard/types";

interface PRSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prUrl: string;
  repoName?: string;
  branchName?: string;
  baseBranch?: string;
  fixes: Fix[];
}

export function PRSuccessAlertDialog({
  open,
  onOpenChange,
  prUrl,
  repoName,
  branchName,
  baseBranch,
  fixes,
}: PRSuccessDialogProps) {
  const [copied, setCopied] = useState(false);
  const fixedCount = fixes.filter((f) => f.status === "fixed").length;
  const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];

  const copy = () => {
    navigator.clipboard.writeText(prUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
            <GitPullRequest className="h-5 w-5" />
          </span>
          <DialogTitle>Pull request opened</DialogTitle>
          <DialogDescription>
            {prNumber ? `#${prNumber} ` : ""}
            {repoName ? `in ${repoName} ` : ""}
            with {fixedCount} verified fix{fixedCount === 1 ? "" : "es"}
            {branchName && baseBranch ? `, from ${branchName} into ${baseBranch}` : ""}. Review and merge it on GitHub.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-200 py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">{prUrl}</span>
          <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={copied ? "Copied" : "Copy link"}>
            {copied ? <Check className="h-4 w-4 text-brand" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild>
            <a href={prUrl} target="_blank" rel="noopener noreferrer">
              View on GitHub <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
