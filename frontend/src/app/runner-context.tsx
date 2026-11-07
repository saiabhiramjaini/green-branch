"use client";

import { createContext, useContext } from "react";
import { useRunner, type Runner } from "./dashboard/useRunner";

const RunnerContext = createContext<Runner | null>(null);

/** Keeps the live run (and its WebSocket) alive while the user moves between pages. */
export function RunnerProvider({ children }: { children: React.ReactNode }) {
  const runner = useRunner();
  return <RunnerContext.Provider value={runner}>{children}</RunnerContext.Provider>;
}

export function useRunnerContext(): Runner {
  const ctx = useContext(RunnerContext);
  if (!ctx) throw new Error("useRunnerContext must be used inside RunnerProvider");
  return ctx;
}
