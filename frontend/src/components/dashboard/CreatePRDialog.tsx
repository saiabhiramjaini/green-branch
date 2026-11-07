"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { AlertCircle, ArrowUpRight, Check, GitPullRequest, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GitHubIcon } from "@/components/brand";
import { compareUrl, formatTime } from "@/app/dashboard/utils";
import type { Fix } from "@/app/dashboard/types";

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoUrl: string;
  branchName: string;
  baseBranch?: string;
  commitHash?: string;
  fixes: Fix[];
  timeTaken?: number;
  isSignedIn: boolean;
  onPRCreated: (prUrl: string, repoName: string) => void;
}

/** Parse `owner/repo` from a full GitHub URL. */
function parseRepoFullName(url: string): string {
  const parts = url.replace(/\.git$/, "").replace(/\/$/, "").split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

/** Markdown PR body: summary table, then each fix with the model's reasoning. */
function buildPRBody(
  fixes: Fix[],
  repoFullName: string,
  branchName: string,
  baseBranch: string,
  commitHash: string | undefined,
  timeTaken: number | undefined
): string {
  const fixed = fixes.filter((f) => f.status === "fixed");
  const failed = fixes.filter((f) => f.status === "failed");

  let body = `## Summary\n\nGreenBranch ran the test suite of \`${repoFullName}\`, applied the fixes below, and re-ran the tests to verify each one.\n\n`;
  body += `| | |\n| --- | --- |\n`;
  body += `| Fix branch | \`${branchName}\` |\n`;
  body += `| Target branch | \`${baseBranch}\` |\n`;
  if (commitHash) body += `| Last commit | \`${commitHash.slice(0, 7)}\` |\n`;
  if (timeTaken) body += `| Run time | ${formatTime(timeTaken)} |\n`;
  body += `| Files fixed | ${fixed.length} |\n\n`;

  if (fixed.length) {
    body += `## Changes\n\n`;
    fixed.forEach((fix) => {
      body += `### \`${fix.file}${fix.line_number ? `:${fix.line_number}` : ""}\`${fix.bug_type ? ` — ${fix.bug_type}` : ""}\n\n`;
      if (fix.explanation?.root_cause) body += `**Root cause.** ${fix.explanation.root_cause}\n\n`;
      if (fix.explanation?.changes_made) body += `**Change.** ${fix.explanation.changes_made}\n\n`;
      if (fix.explanation?.impact) body += `**Impact.** ${fix.explanation.impact}\n\n`;
      if (!fix.explanation && fix.description) body += `${fix.description}\n\n`;
    });
  }

  if (failed.length) {
    body += `## Not fixed\n\n`;
    failed.forEach((fix) => {
      body += `- \`${fix.file}\`${fix.bug_type ? ` (${fix.bug_type})` : ""}${fix.error_message ? ` — ${fix.error_message}` : ""}\n`;
    });
    body += `\n`;
  }

  body += `---\n\n_Opened with [GreenBranch](https://github.com/saiabhiramjaini/green-branch). Every change above was verified by re-running the test suite before it was committed._\n`;
  return body;
}

/** Concise conventional-commit style PR title. */
function buildPRTitle(fixes: Fix[], repoFullName: string): string {
  const fixed = fixes.filter((f) => f.status === "fixed");
  const repoName = repoFullName.split("/")[1];
  if (fixed.length === 1) {
    const msg = fixed[0].commit_message?.trim();
    if (msg) return (/^\w+(\([^)]*\))?!?:/.test(msg) ? msg : `fix: ${msg}`).slice(0, 80);
    return `fix: resolve ${fixed[0].bug_type || "failing test"} in ${fixed[0].file}`;
  }
  if (fixed.length > 1) return `fix: resolve ${fixed.length} failing tests in ${repoName}`;
  return `fix: automated test fixes for ${repoName}`;
}

export function CreatePRDialog({
  open,
  onOpenChange,
  repoUrl,
  branchName,
  baseBranch = "main",
  commitHash,
  fixes,
  timeTaken,
  isSignedIn,
  onPRCreated,
}: CreatePRDialogProps) {
  const repoFullName = parseRepoFullName(repoUrl);
  const fixed = fixes.filter((f) => f.status === "fixed");

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");

  // Regenerate the draft each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setPrTitle(buildPRTitle(fixes, repoFullName));
    setPrBody(buildPRBody(fixes, repoFullName, branchName, baseBranch, commitHash, timeTaken));
    setError(null);
  }, [open, fixes, repoFullName, branchName, baseBranch, commitHash, timeTaken]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const { data } = await axios.post("/api/pr", {
        repo_full_name: repoFullName,
        branch_name: branchName,
        base_branch: baseBranch,
        title: prTitle.trim(),
        body: prBody,
      });
      if (data.success) {
        onPRCreated(data.pr_url, repoFullName);
      } else {
        setError(data.message || "GitHub didn't create the pull request. Please try again.");
      }
    } catch (err: unknown) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.detail || err.response?.data?.message || err.message
        : "Unknown error";
      setError(String(message));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isCreating && onOpenChange(v)}>
      <DialogContent className="gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="space-y-2 border-b border-border px-6 pb-5 pt-6 text-left">
          <DialogTitle>Open a pull request</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[13px]">
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">{baseBranch}</span>
              <span aria-hidden>←</span>
              <span className="sr-only">from</span>
              <span className="break-all rounded-md bg-muted px-1.5 py-0.5 text-foreground">{branchName}</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {isSignedIn ? (
          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <label htmlFor="pr-title" className="text-[13px] text-foreground-light">
                Title
              </label>
              <Input id="pr-title" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="pr-body" className="text-[13px] text-foreground-light">
                Description <span className="font-normal text-foreground-lighter">· Markdown</span>
              </label>
              <Textarea
                id="pr-body"
                value={prBody}
                onChange={(e) => setPrBody(e.target.value)}
                className="scroll-quiet h-48 resize-y font-mono text-[12.5px] leading-relaxed"
              />
            </div>
            {fixed.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] text-foreground-light">
                  Includes {fixed.length} file{fixed.length === 1 ? "" : "s"}
                </p>
                <ul className="space-y-1">
                  {fixed.map((fix, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
                      <span className="truncate font-mono text-[13px] text-foreground">{fix.file}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-words">{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 px-6 py-5 text-sm leading-relaxed text-foreground-lighter">
            <p>
              The fixes are already pushed to <code className="font-mono text-[13px] text-foreground">{branchName}</code>.
              You can open the pull request on GitHub yourself — the comparison page is pre-filled.
            </p>
            <p>
              To have GreenBranch open pull requests for you,{" "}
              <Link href="/signin?callbackUrl=/dashboard" className="text-foreground underline underline-offset-4">
                sign in with GitHub
              </Link>{" "}
              before your next run.
            </p>
          </div>
        )}

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          {isSignedIn ? (
            <Button onClick={handleCreate} disabled={isCreating || !branchName || !prTitle.trim()}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitPullRequest className="h-4 w-4" />}
              {isCreating ? "Opening…" : "Create pull request"}
            </Button>
          ) : (
            <Button asChild>
              <a href={compareUrl(repoUrl, baseBranch, branchName)} target="_blank" rel="noopener noreferrer">
                <GitHubIcon className="h-4 w-4" /> Open on GitHub <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
