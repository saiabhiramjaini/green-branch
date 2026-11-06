"use client";

import { useState } from "react";
import { ChevronRight, GitBranch, Link as LinkIcon, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitHubIcon } from "./GitHubIcon";
import { RepoCard, RepoCardSkeleton } from "./RepoCard";
import { getBranchPreview, mapLanguage } from "@/app/dashboard/utils";
import type { Language, Repo } from "@/app/dashboard/types";

interface RepoPickerProps {
  signedIn: boolean;
  repos: Repo[];
  reposLoading: boolean;
  /** Pre-filled URL (from the landing page); opens the picker in URL mode. */
  initialRepoUrl: string;
  onRun: (repo: Repo, language: Language) => void;
}

/** A repo stand-in for a pasted URL (its default branch is detected by the backend). */
function repoFromUrl(url: string): Repo {
  return {
    id: Date.now(),
    name: url.split("/").pop() || "repository",
    full_name: url.replace("https://github.com/", ""),
    private: false,
    html_url: url,
    description: null,
    updated_at: new Date().toISOString(),
    language: null,
    default_branch: undefined,
  };
}

/** Idle screen: pick one of your repos, or paste a GitHub URL. */
export function RepoPicker({ signedIn, repos, reposLoading, initialRepoUrl, onRun }: RepoPickerProps) {
  const [inputMode, setInputMode] = useState<"select" | "url">(initialRepoUrl || !signedIn ? "url" : "select");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const [urlLanguage, setUrlLanguage] = useState<Language>("nodejs");

  const query = searchQuery.toLowerCase();
  const filteredRepos = repos.filter(
    (r) => r.name.toLowerCase().includes(query) || r.full_name.toLowerCase().includes(query)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground">Pick a repository or paste its URL to start the AI healing pipeline.</p>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-border/50 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <LinkIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Repository</p>
            <p className="text-xs text-muted-foreground">Paste the full GitHub URL to analyze</p>
          </div>
          {/* GitHub repos toggle — only for signed-in users */}
          {signedIn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInputMode(inputMode === "select" ? "url" : "select")}
              className="gap-2 h-8 text-xs border border-border/60 hover:border-primary/40 hover:bg-primary/5"
            >
              <GitHubIcon className="h-3.5 w-3.5" />
              {inputMode === "select" ? "Enter URL" : "My Repos"}
            </Button>
          )}
        </div>

        {inputMode === "select" ? (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search repositories…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-secondary/30 pl-9"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 max-h-96 overflow-y-auto pr-1">
              {reposLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="animate-pulse"><RepoCardSkeleton /></div>
                ))
              ) : filteredRepos.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No repositories match your search" : "No repositories found"}
                </div>
              ) : (
                filteredRepos.map((repo) => (
                  <RepoCard
                    key={repo.id}
                    repo={repo}
                    onSelect={() => setSelectedRepo(selectedRepo?.id === repo.id ? null : repo)}
                    isSelected={selectedRepo?.id === repo.id}
                    disabled={false}
                  />
                ))
              )}
            </div>
            {selectedRepo && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex-1 min-w-0">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <code className="text-xs font-medium text-primary truncate">
                    {getBranchPreview(selectedRepo.name)}
                  </code>
                </div>
                <Button
                  onClick={() => onRun(selectedRepo, mapLanguage(selectedRepo.language))}
                  className="gap-2 shrink-0 rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.2)]"
                >
                  Run GreenBranch <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="https://github.com/username/repository"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="bg-secondary/30 font-mono text-sm pl-10 pr-3"
                  spellCheck={false}
                />
              </div>
              <Button
                onClick={() => onRun(repoFromUrl(repoUrl.trim()), urlLanguage)}
                disabled={!repoUrl.trim()}
                className="shrink-0 gap-2 rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.2)] whitespace-nowrap"
              >
                <Play className="h-4 w-4" /> Run GreenBranch
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Project Language</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={urlLanguage === "nodejs" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUrlLanguage("nodejs")}
                  className="flex-1 text-xs"
                >
                  JavaScript / TypeScript
                </Button>
                <Button
                  type="button"
                  variant={urlLanguage === "python" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUrlLanguage("python")}
                  className="flex-1 text-xs"
                >
                  Python
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
