"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useRunHistory } from "@/app/dashboard/run-history";
import { formatDuration } from "@/lib/run-model";
import { timeAgo } from "@/app/dashboard/utils";
import { StatusIcon, toneOfRun } from "./status";
import { cn } from "@/lib/utils";

/** Searchable list of runs saved in this browser. */
export function RunsList({ selectedRunId, className }: { selectedRunId: string | null; className?: string }) {
  const runs = useRunHistory();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? runs.filter((r) => r.repo.full_name.toLowerCase().includes(q) || `#${r.number}`.includes(q)) : runs;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="px-3 pb-2 pt-3">
        <label className="flex h-[30px] items-center gap-2 rounded-md border border-border-strong bg-surface-200 px-2 focus-within:border-brand">
          <Search className="h-3.5 w-3.5 shrink-0 text-foreground-lighter" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search runs"
            aria-label="Search runs"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-foreground-muted"
          />
        </label>
      </div>
      <p className="px-4 pb-1 pt-2 text-xs text-foreground-lighter">Recent</p>

      {runs.length === 0 ? (
        <p className="px-4 py-3 text-xs leading-relaxed text-foreground-lighter">
          No runs yet. Runs you start are saved in this browser.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-3 text-xs text-foreground-lighter">No runs match “{query}”.</p>
      ) : (
        <ul className="scroll-quiet flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-3">
          {visible.map((run) => {
            const selected = run.id === selectedRunId;
            const meta =
              run.status === "running"
                ? "running"
                : run.endedAt
                  ? formatDuration(run.endedAt - run.startedAt)
                  : run.status;
            return (
              <li key={run.id}>
                <Link
                  href={`/dashboard?run=${run.id}`}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-md px-2 py-[7px] transition-colors",
                    selected ? "bg-selection" : "hover:bg-surface-200"
                  )}
                >
                  <StatusIcon tone={toneOfRun(run.status)} className="mt-[3px]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-foreground">{run.repo.full_name}</span>
                    <span className="text-xs text-foreground-lighter">
                      #{run.number} · {meta}
                    </span>
                  </span>
                  <span className="pt-px text-xs text-foreground-lighter">{timeAgo(new Date(run.startedAt).toISOString(), true)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
