"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getDefaultCommands, logTimestamp } from "./utils";
import type {
  CIRun,
  FailedStep,
  FinalResult,
  Fix,
  Language,
  LogLine,
  Phase,
  PipelineStep,
  Repo,
  StepState,
  StepStatus,
} from "./types";

function errorDetail(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  return String(err.response?.data?.detail ?? err.response?.data?.message ?? err.message);
}

/**
 * State and actions for one GreenBranch run: clone → configure → stream the
 * pipeline over the WebSocket → results (and the PR dialogs).
 */
export function usePipelineRun() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [language, setLanguage] = useState<Language>("nodejs");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [baseBranch, setBaseBranch] = useState("main"); // branch that was cloned; PRs target it
  const [installCommand, setInstallCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");

  const [logs, setLogs] = useState<LogLine[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [ciRuns, setCIRuns] = useState<CIRun[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [maxIterations, setMaxIterations] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<FailedStep | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);

  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prRepoName, setPrRepoName] = useState<string | undefined>(undefined);
  const [showPrDialog, setShowPrDialog] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const prCreatedRef = useRef(false); // set when the server opened the PR itself

  // Elapsed-time counter while the pipeline streams
  useEffect(() => {
    if (phase !== "streaming") return;
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Close the WebSocket when leaving the page
  useEffect(() => () => wsRef.current?.close(), []);

  const updateStep = useCallback((step: PipelineStep, status: StepStatus) => {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.step === step);
      if (index < 0) return [...prev, { step, status }];
      const updated = [...prev];
      updated[index] = { step, status };
      return updated;
    });
  }, []);

  const fail = (step: FailedStep, message: string) => {
    setErrorMessage(message);
    setFailedStep(step);
    setPhase("failed");
  };

  /** Clone *target* on the server, then move to the configure step. */
  const clone = async (target: Repo, lang: Language) => {
    setRepo(target);
    setLanguage(lang);
    setPhase("streaming");
    setSteps([]);
    setFixes([]);
    setCIRuns([]);
    setElapsedTime(0);
    setFinalResult(null);
    setErrorMessage(null);
    prCreatedRef.current = false;

    updateStep("cloning", "running");
    setLogs([{ line: `$ git clone ${target.html_url}`, ts: logTimestamp() }]);

    try {
      // Cloned server-side so the GitHub token and backend API key never reach the browser.
      // A pasted URL has no known default branch, so the backend detects it.
      const { data } = await axios.post("/api/sessions", {
        repo_url: target.html_url,
        language: lang,
        branch: target.default_branch,
      });
      const sid = data.session_id as string;
      setSessionId(sid);
      setBaseBranch(data.branch || "main");
      updateStep("cloning", "done");
      setLogs((prev) => [
        ...prev,
        { line: `  Cloned into session ${sid.slice(0, 8)}...`, ts: logTimestamp() },
        { line: "  ✓ Repository cloned successfully", ts: logTimestamp() },
      ]);

      const defaults = getDefaultCommands(lang);
      setInstallCommand(defaults.install);
      setTestCommand(defaults.test);
      setPhase("configure");
    } catch (err) {
      updateStep("cloning", "error");
      fail("cloning", errorDetail(err, "Unexpected error during cloning."));
    }
  };

  const handleEvent = (data: { type: string; [key: string]: unknown }) => {
    switch (data.type) {
      case "log":
        setLogs((prev) => [...prev, { line: String(data.line ?? ""), ts: String(data.ts ?? "") }]);
        break;
      case "step":
        updateStep(data.step as PipelineStep, data.status as StepStatus);
        break;
      case "iteration":
        setCIRuns((prev) => [
          ...prev,
          {
            iteration: data.iteration as number,
            status: data.status as CIRun["status"],
            errors_count: data.errors_count as number,
            timestamp: logTimestamp(),
          },
        ]);
        setMaxIterations((data.total as number) || 5);
        break;
      case "fix":
        setFixes((prev) => [...prev, data.fix as Fix]);
        break;
      case "pr_created":
        setPrUrl(data.pr_url as string);
        setPrRepoName(data.repo_name as string);
        prCreatedRef.current = true;
        break;
      case "complete": {
        const result = data.result as FinalResult;
        setFinalResult(result);
        setPhase("done");
        // Only offer a PR when fixes were actually pushed (branch_name is null otherwise).
        // The delay lets a `pr_created` event from the same WebSocket flush land first.
        if (result?.passed && result.commit_hash && result.branch_name) {
          setTimeout(() => {
            if (prCreatedRef.current) setShowPrDialog(true); // the server opened the PR
            else setShowCreatePRDialog(true); // e.g. signed out, or auto-PR failed
          }, 300);
        }
        break;
      }
      case "error":
        fail(data.step === "cloning" ? "cloning" : "executing", String(data.message));
        break;
    }
  };

  /** Register the run server-side (which attaches the GitHub token) and stream it. */
  const execute = async () => {
    if (!repo) return;

    const serverWsUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL;
    if (!serverWsUrl) {
      fail("executing", "NEXT_PUBLIC_SERVER_WS_URL is not configured.");
      return;
    }

    setPhase("streaming");
    setElapsedTime(0);
    setFixes([]);
    setCIRuns([]);
    setFinalResult(null);
    setErrorMessage(null);
    setPrUrl(null);
    prCreatedRef.current = false;

    let runId: string;
    try {
      const { data } = await axios.post("/api/runs", {
        session_id: sessionId || undefined,
        repo_url: repo.html_url,
        language,
        install_command: installCommand.trim(),
        test_command: testCommand.trim(),
      });
      runId = data.run_id;
    } catch (err) {
      fail("executing", errorDetail(err, "Could not start the run."));
      return;
    }

    const ws = new WebSocket(`${serverWsUrl}/agent/ws?run_id=${encodeURIComponent(runId)}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        handleEvent(JSON.parse(event.data));
      } catch {
        // ignore malformed messages
      }
    };
    ws.onerror = () => {
      setErrorMessage("WebSocket connection error. Is the server running?");
      setPhase("failed");
    };
    ws.onclose = () => {
      setPhase((current) => {
        if (current !== "streaming") return current;
        setErrorMessage("Connection closed unexpectedly");
        return "failed";
      });
    };
  };

  const reset = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setPhase("idle");
    setRepo(null);
    setLogs([]);
    setSteps([]);
    setFixes([]);
    setCIRuns([]);
    setElapsedTime(0);
    setSessionId(null);
    setBaseBranch("main");
    setInstallCommand("");
    setTestCommand("");
    setFinalResult(null);
    setErrorMessage(null);
    setFailedStep(null);
    setPrUrl(null);
    setShowCreatePRDialog(false);
    prCreatedRef.current = false;
  };

  const onPRCreated = (url: string, repoName: string) => {
    setPrUrl(url);
    setPrRepoName(repoName);
    setShowCreatePRDialog(false);
    setShowPrDialog(true);
  };

  return {
    phase,
    repo,
    language,
    baseBranch,
    installCommand,
    setInstallCommand,
    testCommand,
    setTestCommand,
    logs,
    steps,
    fixes,
    ciRuns,
    elapsedTime,
    maxIterations,
    errorMessage,
    failedStep,
    finalResult,
    prUrl,
    prRepoName,
    showPrDialog,
    setShowPrDialog,
    showCreatePRDialog,
    setShowCreatePRDialog,
    clone,
    execute,
    reset,
    onPRCreated,
  };
}

export type PipelineRun = ReturnType<typeof usePipelineRun>;
