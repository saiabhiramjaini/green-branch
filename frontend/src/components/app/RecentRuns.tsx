"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRunHistory } from "@/app/dashboard/run-history";
import { timeAgo } from "@/app/dashboard/utils";
import type { RunStatus } from "@/lib/run-model";
import { StatusIcon, toneOfRun } from "./status";

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  passed: "Passed",
  partial: "Partly fixed",
  failed: "Failed",
  error: "Error",
  interrupted: "Interrupted",
};

const PAGE = 8;

/** Plain list of runs saved in this browser. */
export function RecentRuns() {
  const runs = useRunHistory();
  const [showAll, setShowAll] = useState(false);
  // Re-render every minute so "4m ago" stays true
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  if (runs.length === 0) return null;
  const visible = showAll ? runs : runs.slice(0, PAGE);

  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title" className="text-[13px] font-medium text-foreground-lighter">
        Recent runs
      </h2>
      <ul className="mt-2 divide-y divide-border border-t border-border">
        {visible.map((run) => (
          <li key={run.id}>
            <Link href={`/runs/${run.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-surface-100">
              <StatusIcon tone={toneOfRun(run.status)} label={RUN_STATUS_LABEL[run.status]} />
              <span className="min-w-0 flex-1 truncate text-sm">{run.repo.full_name}</span>
              <span className="hidden text-[13px] text-foreground-lighter sm:inline">{RUN_STATUS_LABEL[run.status]}</span>
              <span className="w-16 text-right text-[13px] tabular-nums text-foreground-lighter">{timeAgo(new Date(run.startedAt).toISOString())}</span>
            </Link>
          </li>
        ))}
      </ul>
      {runs.length > PAGE && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-[13px] text-foreground-lighter hover:text-foreground">
          {showAll ? "Show fewer" : `Show all ${runs.length}`}
        </button>
      )}
      <p className="mt-3 text-xs text-foreground-muted">Saved in this browser.</p>
    </section>
  );
}
