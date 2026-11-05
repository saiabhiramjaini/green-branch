import React from "react";
import { GitHubIcon } from "./GitHubIcon";
import { Lock, CheckCircle2, Globe } from "lucide-react";
import { Repo } from "../../app/dashboard/types";
import { getLangColor, timeAgo } from "../../app/dashboard/utils";

export function RepoCard({
  repo,
  onSelect,
  isSelected,
  disabled,
}: {
  repo: Repo;
  onSelect: () => void;
  isSelected: boolean;
  disabled: boolean;
}) {
  const initials = repo.name.slice(0, 2).toUpperCase();
  const langColor = repo.language ? getLangColor(repo.language) : "#8b949e";

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`group relative w-full rounded-xl border text-left transition-all duration-200 overflow-hidden ${isSelected
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30 shadow-[0_0_16px_rgba(74,222,128,0.08)]"
          : "border-border/60 bg-card hover:border-primary/30 hover:bg-accent/20 hover:shadow-[0_0_12px_rgba(74,222,128,0.06)]"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      {/* Subtle language color strip at top */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-60 transition-opacity duration-200 group-hover:opacity-100"
        style={{ backgroundColor: langColor }}
      />

      <div className="p-4 pt-5">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200 ${isSelected
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary border border-border/60 text-foreground group-hover:border-primary/20"
                }`}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {repo.name}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70 font-mono truncate">
                {repo.full_name}
              </p>
            </div>
          </div>

          {/* Selection indicator */}
          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${isSelected
                ? "border-primary bg-primary"
                : "border-border/60 group-hover:border-primary/40"
              }`}
          >
            {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
          </div>
        </div>

        {/* Description */}
        <div className="mb-3 min-h-[2rem]">
          {repo.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {repo.description}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/40 italic">No description</p>
          )}
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {repo.private ? (
              <span className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5">
                <Lock className="h-2.5 w-2.5" /> Private
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5">
                <Globe className="h-2.5 w-2.5" /> Public
              </span>
            )}
            <span className="text-muted-foreground/50">·</span>
            <span>{timeAgo(repo.updated_at)}</span>
          </div>

          {repo.language && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: langColor }}
              />
              {repo.language}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function RepoCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 pt-5 animate-pulse">
      {/* Color strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-border/40 rounded-t-xl" />
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-secondary" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-secondary" />
            <div className="h-2.5 w-32 rounded bg-secondary" />
          </div>
        </div>
        <div className="h-5 w-5 rounded-full bg-secondary" />
      </div>
      <div className="mb-3 space-y-1.5">
        <div className="h-2.5 w-full rounded bg-secondary" />
        <div className="h-2.5 w-3/4 rounded bg-secondary" />
      </div>
      <div className="flex justify-between">
        <div className="h-4 w-14 rounded-full bg-secondary" />
        <div className="h-2.5 w-12 rounded bg-secondary" />
      </div>
    </div>
  );
}
