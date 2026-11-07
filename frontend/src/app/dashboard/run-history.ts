"use client";

// Run history kept in this browser's localStorage. There is no server-side run store yet,
// so history is per device. Every access is guarded: storage can be full or unavailable.

import { useSyncExternalStore } from "react";
import type { RunRecord, TimedEvent } from "@/lib/run-model";

const KEY = "greenbranch:runs:v1";
const COUNTER_KEY = "greenbranch:run-counter:v1";
const MAX_RUNS = 40;
const MAX_LOG_EVENTS = 4000;

let cache: RunRecord[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: RunRecord[] = [];

function read(): RunRecord[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** Keep the newest log lines when a run's log is very long, plus every non-log event. */
function trimEvents(events: TimedEvent[]): TimedEvent[] {
  const logCount = events.reduce((n, e) => n + (e.type === "log" ? 1 : 0), 0);
  if (logCount <= MAX_LOG_EVENTS) return events;
  let skip = logCount - MAX_LOG_EVENTS;
  return events.filter((e) => {
    if (e.type !== "log" || skip <= 0) return true;
    skip -= 1;
    return false;
  });
}

function write(runs: RunRecord[]) {
  cache = runs;
  listeners.forEach((l) => l());
  const toStore = runs.slice(0, MAX_RUNS).map((r) => ({ ...r, events: trimEvents(r.events) }));
  for (let keep = toStore.length; keep > 0; keep = Math.floor(keep / 2)) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(toStore.slice(0, keep)));
      return;
    } catch {
      // Quota exceeded: retry with fewer runs
    }
  }
}

export const runHistory = {
  list: read,
  get(id: string) {
    return read().find((r) => r.id === id) ?? null;
  },
  upsert(run: RunRecord) {
    const runs = read().filter((r) => r.id !== run.id);
    write([run, ...runs].sort((a, b) => b.startedAt - a.startedAt));
  },
  update(id: string, patch: Partial<RunRecord>) {
    const runs = read();
    if (!runs.some((r) => r.id === id)) return;
    write(runs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  },
  nextNumber() {
    let n = 0;
    try {
      n = Number(window.localStorage.getItem(COUNTER_KEY)) || 0;
    } catch {}
    n = Math.max(n, ...read().map((r) => r.number), 0) + 1;
    try {
      window.localStorage.setItem(COUNTER_KEY, String(n));
    } catch {}
    return n;
  },
  /** Runs left "running" by a closed tab can never finish. */
  markInterrupted(exceptId: string | null) {
    const runs = read();
    if (!runs.some((r) => r.status === "running" && r.id !== exceptId)) return;
    write(runs.map((r) => (r.status === "running" && r.id !== exceptId ? { ...r, status: "interrupted" as const } : r)));
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useRunHistory(): RunRecord[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
