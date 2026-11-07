"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { runHistory } from "./run-history";
import { statusFromResult, type RunRecord, type StreamEvent, type TimedEvent } from "@/lib/run-model";
import type { Language } from "./types";

export interface RunConfig {
  repo: RunRecord["repo"];
  language: Language;
  installCommand: string;
  testCommand: string;
  maxAttempts: number;
}

function errorDetail(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  return String(err.response?.data?.detail ?? err.response?.data?.message ?? err.message);
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Starts runs and streams their events. Only one run is live at a time; it is kept in
 * memory while it streams and written to run history when it starts and when it ends.
 */
export function useRunner() {
  const [active, setActive] = useState<RunRecord | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bufferRef = useRef<TimedEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const runRef = useRef<RunRecord | null>(null);

  // A tab closed mid-run leaves a "running" record that can never finish
  useEffect(() => runHistory.markInterrupted(null), []);
  useEffect(() => () => wsRef.current?.close(), []);

  const commit = useCallback((next: RunRecord, persist: boolean) => {
    runRef.current = next;
    setActive(next);
    if (persist) runHistory.upsert(next);
  }, []);

  const finish = useCallback(
    (id: string, patch: Partial<RunRecord>) => {
      const run = runRef.current;
      if (!run || run.id !== id || run.status !== "running") return;
      wsRef.current?.close();
      wsRef.current = null;
      commit({ ...run, events: [...run.events, ...bufferRef.current], ...patch, endedAt: Date.now() }, true);
      bufferRef.current = [];
    },
    [commit]
  );

  // Batch incoming events into one render per animation frame
  const flush = useCallback(() => {
    frameRef.current = null;
    const run = runRef.current;
    if (!run || bufferRef.current.length === 0) return;
    const events = [...run.events, ...bufferRef.current];
    bufferRef.current = [];
    commit({ ...run, events }, false);
  }, [commit]);

  const onEvent = useCallback(
    (id: string, event: StreamEvent) => {
      if (runRef.current?.id !== id) return;
      const timed = { ...event, at: Date.now() } as TimedEvent;
      if (event.type === "complete") {
        bufferRef.current.push(timed);
        const prUrl = [...(runRef.current?.events ?? []), ...bufferRef.current].find((e) => e.type === "pr_created");
        finish(id, {
          status: statusFromResult(event.result),
          result: event.result,
          prUrl: prUrl && prUrl.type === "pr_created" ? prUrl.pr_url : null,
        });
        return;
      }
      if (event.type === "error") {
        bufferRef.current.push(timed);
        finish(id, { status: "error", errorMessage: event.message });
        return;
      }
      bufferRef.current.push(timed);
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
    },
    [finish, flush]
  );

  /** Start a run and return its id (the run page can be shown right away). */
  const start = useCallback(
    (config: RunConfig): string => {
      const previous = runRef.current;
      if (previous?.status === "running") {
        // Only one live run at a time: the previous one can no longer be followed
        wsRef.current?.close();
        runHistory.update(previous.id, { status: "interrupted", endedAt: Date.now() });
      }
      const run: RunRecord = {
        id: newId(),
        number: runHistory.nextNumber(),
        repo: config.repo,
        language: config.language,
        installCommand: config.installCommand,
        testCommand: config.testCommand,
        maxAttempts: config.maxAttempts,
        startedAt: Date.now(),
        status: "running",
        events: [],
      };
      bufferRef.current = [];
      commit(run, true);

      (async () => {
        const wsBase = process.env.NEXT_PUBLIC_SERVER_WS_URL;
        if (!wsBase) {
          finish(run.id, { status: "error", errorMessage: "NEXT_PUBLIC_SERVER_WS_URL is not configured." });
          return;
        }
        let runId: string;
        try {
          const { data } = await axios.post("/api/runs", {
            repo_url: config.repo.html_url,
            language: config.language,
            install_command: config.installCommand.trim(),
            test_command: config.testCommand.trim(),
            max_iterations: config.maxAttempts,
          });
          runId = data.run_id;
        } catch (err) {
          finish(run.id, { status: "error", errorMessage: errorDetail(err, "Could not start the run.") });
          return;
        }
        if (runRef.current?.id !== run.id) return; // superseded by another run

        const ws = new WebSocket(`${wsBase}/agent/ws?run_id=${encodeURIComponent(runId)}`);
        wsRef.current = ws;
        ws.onmessage = (msg) => {
          try {
            onEvent(run.id, JSON.parse(msg.data) as StreamEvent);
          } catch {
            // ignore malformed frames
          }
        };
        ws.onerror = () => finish(run.id, { status: "error", errorMessage: "Lost the connection to the GreenBranch server." });
        ws.onclose = () => finish(run.id, { status: "error", errorMessage: "The connection closed before the run finished." });
      })();

      return run.id;
    },
    [commit, finish, onEvent]
  );

  /** Record a pull request opened from the results page. */
  const setPrUrl = useCallback((id: string, prUrl: string) => {
    runHistory.update(id, { prUrl });
    if (runRef.current?.id === id) {
      const next = { ...runRef.current, prUrl };
      runRef.current = next;
      setActive(next);
    }
  }, []);

  return { active, start, setPrUrl };
}

export type Runner = ReturnType<typeof useRunner>;
