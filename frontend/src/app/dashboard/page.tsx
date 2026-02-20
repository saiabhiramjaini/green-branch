"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, CheckCircle2, XCircle, Loader2, GitBranch, LogOut, User, ChevronRight, Timer, RefreshCw, ArrowUpRight, Play, AlertCircle, GitPullRequest, ExternalLink, Link as LinkIcon, Users, UserCircle } from "lucide-react";
import { PRSuccessAlertDialog } from "../../components/dashboard/PRSuccessDialog";
import { CreatePRDialog } from "../../components/dashboard/CreatePRDialog";
import { BuildLogTerminal } from "../../components/dashboard/build-log-terminal";
import { StepTracker } from "../../components/dashboard/StepTracker";
import { FixesTable } from "../../components/dashboard/FixesTable";
import { CITimeline } from "../../components/dashboard/CITimeline";
import { RepoCard, RepoCardSkeleton } from "../../components/dashboard/RepoCard";
import { GitHubIcon } from "../../components/dashboard/GitHubIcon";
import { ScoreBreakdown } from "../../components/dashboard/ScoreBreakdown";
import { getDefaultCommands, formatTime, mapLanguage, getBranchName, getTeamBranchName } from "./utils";
import { Repo, Fix, CIRun, LogLine, PipelineStep, StepStatus, StepState, Phase } from "./types";


// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Team info and direct URL input
  const [teamName, setTeamName] = useState("");
  const [teamLeaderName, setTeamLeaderName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [inputMode, setInputMode] = useState<"select" | "url">("select");
  const [isUrlFlow, setIsUrlFlow] = useState(false); // Track if coming from URL flow (no auth needed)
  const [selectedLanguage, setSelectedLanguage] = useState<"nodejs" | "python">("nodejs"); // Language for URL input mode

  const [installCommand, setInstallCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [ciRuns, setCIRuns] = useState<CIRun[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [maxIterations, setMaxIterations] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);

  // PR creation state
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);
  const [showPrDialog, setShowPrDialog] = useState(false);
  const [showCreatePRDialog, setShowCreatePRDialog] = useState(false);
  const [prRepoName, setPrRepoName] = useState<string | undefined>(undefined);

  const [finalResult, setFinalResult] = useState<{
    passed: boolean;
    branch_name: string | null;
    commit_hash: string | null;
    time_taken_seconds: number;
    total_fixed: number;
    total_failures: number;
    iterations: number;
    repo_url: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prCreatedRef = useRef<boolean>(false); // Track if PR was auto-created

  // Load pre-filled values from localStorage FIRST (from landing page modal)
  // This must run before auth check to detect URL flow
  useEffect(() => {
    const savedRepoUrl = localStorage.getItem("greenbranch_repo_url");
    const savedTeamName = localStorage.getItem("greenbranch_team_name");
    const savedTeamLeader = localStorage.getItem("greenbranch_team_leader");

    if (savedRepoUrl) {
      setRepoUrl(savedRepoUrl);
      setInputMode("url");
      setIsUrlFlow(true); // Mark as URL flow - no auth needed
      localStorage.removeItem("greenbranch_repo_url");
    }
    if (savedTeamName) {
      setTeamName(savedTeamName);
      localStorage.removeItem("greenbranch_team_name");
    }
    if (savedTeamLeader) {
      setTeamLeaderName(savedTeamLeader);
      localStorage.removeItem("greenbranch_team_leader");
    }
  }, []);

  // Only redirect to signin if NOT in URL flow mode
  useEffect(() => {
    if (status === "unauthenticated" && !isUrlFlow) {
      router.push("/signin");
    }
  }, [status, router, isUrlFlow]);

  useEffect(() => {
    if (!session) return;
    axios
      .get<Repo[]>("/api/github/repos")
      .then(({ data }) => setRepos(Array.isArray(data) ? data : []))
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (phase === "streaming") {
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const updateStep = useCallback(
    (step: PipelineStep, stepStatus: StepStatus) => {
      setSteps((prev) => {
        const existing = prev.findIndex((s) => s.step === step);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { step, status: stepStatus };
          return updated;
        }
        return [...prev, { step, status: stepStatus }];
      });
    },
    []
  );

  // ── Clone ─────────────────────────────────────────────────────────────
  const handleClone = async () => {
    // Support both URL input mode and repo selection mode
    const repoUrlToUse = inputMode === "url" ? repoUrl.trim() : selectedRepo?.html_url;
    if (!repoUrlToUse) return;

    // Create a temporary repo object for URL mode
    const effectiveRepo = inputMode === "url"
      ? {
        id: Date.now(),
        name: repoUrl.split("/").pop() || "repository",
        full_name: repoUrl.replace("https://github.com/", ""),
        private: false,
        html_url: repoUrl.trim(),
        description: null,
        updated_at: new Date().toISOString(),
        language: null,
      }
      : selectedRepo;

    if (!effectiveRepo) return;

    // Set the effective repo as selected for the rest of the flow
    if (inputMode === "url") {
      setSelectedRepo(effectiveRepo);
    }

    const agentUrl = process.env.NEXT_PUBLIC_EC2_AGENT_URL;
    const userId = session?.user?.email ?? session?.user?.name ?? "anonymous";
    // Use selectedLanguage for URL mode, otherwise detect from repo
    const language = inputMode === "url" ? selectedLanguage : mapLanguage(effectiveRepo.language);

    setPhase("streaming");
    setLogs([]);
    setSteps([]);
    setFixes([]);
    setCIRuns([]);
    setElapsedTime(0);
    setFinalResult(null);
    setErrorMessage(null);
    prCreatedRef.current = false; // Reset PR created flag

    updateStep("cloning", "running");
    setLogs([{ line: `$ git clone ${effectiveRepo.html_url}`, ts: new Date().toLocaleTimeString("en-GB", { hour12: false }) }]);

    try {
      const token = (session as any)?.accessToken;
      const { data: sessionData } = await axios.post(
        `${agentUrl}/api/v1/sessions`,
        null,
        { params: { repo_url: effectiveRepo.html_url, language, user_id: userId, github_token: token || undefined } }
      );

      const sid = sessionData.session_id as string;
      setSessionId(sid);
      updateStep("cloning", "done");

      const ts = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
      setLogs((prev) => [
        ...prev,
        { line: `  Cloned into session ${sid.slice(0, 8)}...`, ts: ts() },
        { line: "  \u2713 Repository cloned successfully", ts: ts() },
      ]);

      const defaults = getDefaultCommands(language);
      setInstallCommand(defaults.install);
      setTestCommand(defaults.test);
      setPhase("configure");
    } catch (err) {
      updateStep("cloning", "error");
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.response?.data?.message ?? err.message)
        : "Unexpected error during cloning.";
      setErrorMessage(String(msg));
      setFailedStep("cloning");
      setPhase("failed");
    }
  };

  // ── Execute via WebSocket ─────────────────────────────────────────────
  const handleExecute = () => {
    if (!selectedRepo) return;

    const serverWsUrl = process.env.NEXT_PUBLIC_SERVER_WS_URL;
    if (!serverWsUrl) {
      setErrorMessage("NEXT_PUBLIC_SERVER_WS_URL is not configured.");
      setPhase("failed");
      return;
    }

    setPhase("streaming");
    setElapsedTime(0);
    setFixes([]);
    setCIRuns([]);
    setFinalResult(null);
    setErrorMessage(null);
    prCreatedRef.current = false; // Reset PR created flag
    setPrUrl(null); // Reset PR URL

    const branchName = teamName && teamLeaderName
      ? getTeamBranchName(teamName, teamLeaderName)
      : getBranchName(selectedRepo.name);
    const ws = new WebSocket(`${serverWsUrl}/agent/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          repo_url: selectedRepo.html_url,
          language: inputMode === "url" ? selectedLanguage : mapLanguage(selectedRepo.language),
          install_command: installCommand.trim() || undefined,
          test_command: testCommand.trim() || undefined,
          branch: "main",
          branch_name: branchName,
          session_id: sessionId || undefined,
          github_token: (session as any)?.accessToken || undefined,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "log":
            setLogs((prev) => [...prev, { line: data.line ?? "", ts: data.ts ?? "" }]);
            break;
          case "step":
            updateStep(data.step as PipelineStep, data.status as StepStatus);
            break;
          case "iteration":
            setCIRuns((prev) => [
              ...prev,
              {
                iteration: data.iteration,
                status: data.status,
                errors_count: data.errors_count,
                timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
              },
            ]);
            setMaxIterations(data.total || 5);
            break;
          case "fix":
            setFixes((prev) => [...prev, data.fix]);
            break;
          case "complete":
            setFinalResult(data.result);
            setPhase("done");
            // Use setTimeout to allow any in-flight `pr_created` event that
            // arrived in the same WebSocket flush to be processed first.
            if (data.result?.passed && data.result?.branch_name) {
              setTimeout(() => {
                if (prCreatedRef.current) {
                  // Backend already auto-created a PR — show the success dialog
                  setShowPrDialog(true);
                } else {
                  // No auto PR (e.g. unauthenticated flow or it failed) —
                  // let the user create the PR manually
                  setShowCreatePRDialog(true);
                }
              }, 300);
            }
            break;
          case "error":
            setErrorMessage(data.message);
            setFailedStep(data.step === "cloning" ? "cloning" : "executing");
            setPhase("failed");
            break;
          case "pr_created":
            // PR was auto-created by backend - store URL
            setPrUrl(data.pr_url);
            setPrRepoName(data.repo_name);
            prCreatedRef.current = true; // Mark that PR was created
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setErrorMessage("WebSocket connection error. Is the server running?");
      setPhase("failed");
    };

    ws.onclose = () => {
      setPhase((current) => {
        if (current === "streaming") {
          setErrorMessage("Connection closed unexpectedly");
          return "failed";
        }
        return current;
      });
    };
  };

  const resetAnalysis = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setPhase("idle");
    setSelectedRepo(null);
    setLogs([]);
    setSteps([]);
    setFixes([]);
    setCIRuns([]);
    setElapsedTime(0);
    setSessionId(null);
    setInstallCommand("");
    setTestCommand("");
    setFinalResult(null);
    setErrorMessage(null);
    setFailedStep(null);
    setPrUrl(null);
    setPrLoading(false);
    setPrError(null);
    setRepoUrl("");
    setInputMode("select");
    setSelectedLanguage("nodejs");
    setShowCreatePRDialog(false);
    prCreatedRef.current = false;
  };

  // Handler for when PR is successfully created
  const handlePRCreated = (prUrlResult: string, repoName: string) => {
    setPrUrl(prUrlResult);
    setPrRepoName(repoName);
    setShowCreatePRDialog(false);
    setShowPrDialog(true);
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show loading only if not in URL flow and auth is loading
  if (status === "loading" && !isUrlFlow) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Allow URL flow to proceed without session
  if (!session && !isUrlFlow) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 glass-nav">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <Image src="/logo.png" alt="GreenBranch" width={28} height={28} className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
            <span className="text-sm font-semibold text-foreground">GreenBranch</span>
          </Link>

          <div className="flex items-center gap-3">
            {phase === "streaming" && (
              <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <span className="font-mono text-xs text-primary">{formatTime(elapsedTime)}</span>
              </div>
            )}

            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                    <Avatar className="h-8 w-8 ring-2 ring-primary/20 ring-offset-1 ring-offset-background transition-all hover:ring-primary/40">
                      <AvatarImage src={session.user?.image || ""} alt={session.user?.name || "User"} />
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        {session.user?.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-card rounded-xl border-border/50 overflow-hidden">
                  <div className="px-3 py-3 bg-primary/5 border-b border-border/50">
                    <p className="text-sm font-semibold text-foreground leading-tight">{session.user?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.user?.email}</p>
                  </div>
                  <div className="p-1">
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="flex items-center gap-2 rounded-lg">
                        <User className="h-3.5 w-3.5" /> Dashboard
                      </Link>
                    </DropdownMenuItem>
                  </div>
                  <div className="p-1 pt-0">
                    <DropdownMenuItem
                      onClick={() => signOut({ callbackUrl: "/" })}
                      className="flex items-center gap-2 rounded-lg font-medium bg-destructive/10 text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/signin">
                <Button variant="outline" size="sm" className="gap-2">
                  <GitHubIcon className="h-4 w-4" /> Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* ─────────── IDLE ─────────── */}
        {phase === "idle" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
                <p className="text-sm text-muted-foreground">Enter your repository URL and team details to start the AI healing pipeline.</p>
              </div>
            </div>

            {/* Team Info Input Section */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-border/50 pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Team Information</p>
                  <p className="text-xs text-muted-foreground">Required for branch naming convention</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Team Name
                  </label>
                  <Input
                    placeholder="e.g., RIFT ORGANISERS"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="bg-secondary/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <UserCircle className="h-3 w-3" /> Team Leader Name
                  </label>
                  <Input
                    placeholder="e.g., Saiyam Kumar"
                    value={teamLeaderName}
                    onChange={(e) => setTeamLeaderName(e.target.value)}
                    className="bg-secondary/30"
                  />
                </div>
              </div>

              {teamName && teamLeaderName && (
                <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <GitBranch className="h-3.5 w-3.5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">Branch will be named</p>
                    <code className="text-xs font-medium text-primary">{getTeamBranchName(teamName, teamLeaderName)}</code>
                  </div>
                </div>
              )}
            </div>

            {/* Repository URL Input — always visible (URL mode is the primary flow) */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <div className="flex items-center gap-2 border-b border-border/50 pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <LinkIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Repository</p>
                  <p className="text-xs text-muted-foreground">Paste the full GitHub URL to analyze</p>
                </div>
                {/* GitHub repos toggle — only for authenticated users */}
                {session && (
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
                /* GitHub repos picker */
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
                    {loading ? (
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
                          {teamName && teamLeaderName
                            ? getTeamBranchName(teamName, teamLeaderName)
                            : getBranchName(selectedRepo.name)}
                        </code>
                      </div>
                      <Button
                        onClick={handleClone}
                        disabled={!selectedRepo || !teamName.trim() || !teamLeaderName.trim()}
                        className="gap-2 shrink-0 rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.2)]"
                      >
                        Run GreenBranch <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {selectedRepo && (!teamName.trim() || !teamLeaderName.trim()) && (
                    <p className="text-xs text-amber-500 flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" /> Please fill in team name and leader name above
                    </p>
                  )}
                </div>
              ) : (
                /* URL input mode */
                <div className="space-y-4">
                  {/* URL + Run button on same row */}
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
                      onClick={handleClone}
                      disabled={!repoUrl.trim() || !teamName.trim() || !teamLeaderName.trim()}
                      className="shrink-0 gap-2 rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.2)] whitespace-nowrap"
                    >
                      <Play className="h-4 w-4" /> Run GreenBranch
                    </Button>
                  </div>

                  {/* Language Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Project Language</label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={selectedLanguage === "nodejs" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedLanguage("nodejs")}
                        className="flex-1 text-xs"
                      >
                        JavaScript / TypeScript
                      </Button>
                      <Button
                        type="button"
                        variant={selectedLanguage === "python" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedLanguage("python")}
                        className="flex-1 text-xs"
                      >
                        Python
                      </Button>
                    </div>
                  </div>

                  {(!teamName.trim() || !teamLeaderName.trim()) && repoUrl.trim() && (
                    <p className="text-xs text-amber-500 flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" /> Fill in team name and leader name to continue
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────── CONFIGURE ─────────── */}
        {phase === "configure" && selectedRepo && (
          <div className="space-y-6">
            {/* Header: title + Run CI button top-right */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">Repository cloned</h1>
                </div>
                <p className="text-sm text-muted-foreground">{selectedRepo.full_name}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Button
                  onClick={handleExecute}
                  disabled={!installCommand.trim() || !testCommand.trim()}
                  className="gap-2 rounded-xl px-5 transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.3)]"
                >
                  <Play className="h-4 w-4" /> Run CI
                </Button>
                <button onClick={resetAnalysis} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Cancel
                </button>
              </div>
            </div>

            <div className="glass-card space-y-5 rounded-2xl p-6">
              <div className="flex items-center gap-2 border-b border-border/50 pb-4">
                <p className="text-sm font-medium text-foreground">Configure commands</p>
                <span className="ml-auto rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
                  {inputMode === "url" ? selectedLanguage : mapLanguage(selectedRepo.language ?? null)}
                </span>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Install command</label>
                  <p className="text-xs text-muted-foreground">Install project dependencies</p>
                  <Input value={installCommand} onChange={(e) => setInstallCommand(e.target.value)} placeholder="npm install" className="mt-1 font-mono text-sm bg-secondary/30" spellCheck={false} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Test command</label>
                  <p className="text-xs text-muted-foreground">Run your test suite</p>
                  <Input value={testCommand} onChange={(e) => setTestCommand(e.target.value)} placeholder="npm test" className="mt-1 font-mono text-sm bg-secondary/30" spellCheck={false} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Fixes committed to branch</p>
                <code className="text-xs font-medium text-primary">
                  {teamName && teamLeaderName
                    ? getTeamBranchName(teamName, teamLeaderName)
                    : getBranchName(selectedRepo.name)}
                </code>
              </div>
            </div>

            {logs.length > 0 && <BuildLogTerminal logs={logs} isStreaming={false} />}
          </div>
        )}

        {/* ─────────── STREAMING ─────────── */}
        {phase === "streaming" && selectedRepo && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Deploying fixes &mdash; {selectedRepo.name}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground">GreenBranch is autonomously healing your repository.</p>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
                <Timer className="h-4 w-4" />
                {formatTime(elapsedTime)}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
              <div className="min-w-0">
                <BuildLogTerminal logs={logs} isStreaming={true} />
              </div>
              <div className="space-y-4">
                <div className="glass-card rounded-2xl p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary/70">Pipeline Steps</p>
                  <StepTracker steps={steps} />
                </div>
                {fixes.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Fixes ({fixes.length})</p>
                    <div className="space-y-2">
                      {fixes.map((fix, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {/* FileCode icon is now handled in FixCard component */}
                          <span className="truncate font-mono text-foreground">{fix.file}</span>
                          {fix.status === "fixed" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─────────── FAILED ─────────── */}
        {phase === "failed" && (
          <div className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {failedStep === "cloning" ? "Could not clone repository" : "Pipeline failed"}
              </h1>
              <p className="text-sm text-muted-foreground">{selectedRepo?.full_name || repoUrl}</p>
            </div>
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {(() => {
                      const msg = errorMessage ?? "";
                      if (msg.includes("private") || msg.includes("🔒")) return "Private repository";
                      if (msg.includes("not found") || msg.includes("❌")) return "Repository not found";
                      if (msg.includes("empty") || msg.includes("📭")) return "Repository is empty";
                      if (msg.includes("Branch") || msg.includes("🌿")) return "Branch not found";
                      if (msg.includes("Network") || msg.includes("🌐")) return "Network error";
                      if (msg.includes("No test files") || msg.includes("test_*.py")) return "No test files found";
                      if (failedStep === "cloning") return "Repository could not be cloned";
                      return "Execution could not be completed";
                    })()}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {errorMessage?.replace(/^[🔒❌📭🌿🌐]\s*/, "") ?? "An unknown error occurred."}
                  </p>
                </div>
              </div>
            </div>
            {logs.length > 0 && <BuildLogTerminal logs={logs} isStreaming={false} />}
            <Button variant="outline" onClick={resetAnalysis} className="gap-2 text-sm">
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        )}

        {/* ─────────── DONE ─────────── */}
        {phase === "done" && selectedRepo && (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pipeline complete</h1>
                <p className="text-sm text-muted-foreground">{selectedRepo.full_name}</p>
              </div>
              <Badge variant={finalResult?.passed ? "default" : "destructive"} className="text-sm px-3 py-1">
                {finalResult?.passed ? (
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />All Tests Passing</span>
                ) : (
                  <span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5" />Tests Failing</span>
                )}
              </Badge>
            </div>

            {/* Run Summary Card */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/50 pb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <GitHubIcon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Run Summary</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Repository</span>
                    <a href={selectedRepo.html_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono text-xs truncate max-w-[200px]">
                      {selectedRepo.full_name}
                    </a>
                  </div>
                  {teamName && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Team Name</span>
                      <span className="text-foreground font-medium">{teamName}</span>
                    </div>
                  )}
                  {teamLeaderName && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Team Leader</span>
                      <span className="text-foreground font-medium">{teamLeaderName}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {finalResult?.branch_name && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Branch Created</span>
                      <code className="text-primary text-xs font-mono truncate max-w-[200px]">{finalResult.branch_name}</code>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Time Taken</span>
                    <span className="text-foreground font-mono">
                      {finalResult?.time_taken_seconds ? formatTime(Math.round(finalResult.time_taken_seconds)) : "0:00"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">CI/CD Status</span>
                    <Badge variant={finalResult?.passed ? "default" : "destructive"} className="text-xs">
                      {finalResult?.passed ? "PASSED" : "FAILED"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Score Breakdown Panel */}
            <ScoreBreakdown
              timeTakenSeconds={finalResult?.time_taken_seconds ?? 0}
              totalCommits={finalResult?.iterations ?? 0}
              passed={finalResult?.passed ?? false}
            />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-destructive/10 border border-destructive/20">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">{finalResult?.total_failures ?? 0}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Failures detected</p>
              </div>
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">{finalResult?.total_fixed ?? 0}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Fixes applied</p>
              </div>
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                    <RefreshCw className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">{finalResult?.iterations ?? 0}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Iterations used</p>
              </div>
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/50 border border-border/50">
                    <Timer className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-2xl font-bold text-foreground">
                    {finalResult?.time_taken_seconds ? formatTime(Math.round(finalResult.time_taken_seconds)) : "0:00"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Time taken</p>
              </div>
            </div>

            {finalResult?.branch_name && (
              <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3.5 backdrop-blur-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
                  <GitBranch className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Branch created</p>
                  <code className="truncate text-xs font-medium text-primary">{finalResult.branch_name}</code>
                </div>
                {finalResult.commit_hash && (
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{finalResult.commit_hash.slice(0, 8)}</span>
                )}
              </div>
            )}

            <BuildLogTerminal logs={logs} isStreaming={false} />

            {fixes.length > 0 && (
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-medium text-foreground">Fixes Applied</h2>
                  <p className="text-xs text-muted-foreground">What failed and how AI resolved each issue</p>
                </div>
                <FixesTable fixes={fixes} />
              </div>
            )}

            {ciRuns.length > 0 && <CITimeline runs={ciRuns} maxIterations={maxIterations} />}

            {/* ── Create PR Confirmation Dialog ── */}
            <CreatePRDialog
              open={showCreatePRDialog}
              onOpenChange={setShowCreatePRDialog}
              repoUrl={selectedRepo?.html_url || ""}
              branchName={finalResult?.branch_name || ""}
              baseBranch="main"
              commitHash={finalResult?.commit_hash || undefined}
              fixes={fixes}
              timeTaken={finalResult?.time_taken_seconds}
              teamName={teamName}
              teamLeaderName={teamLeaderName}
              githubToken={(session as any)?.accessToken}
              onPRCreated={handlePRCreated}
            />

            {/* ── PR Success Dialog ── */}
            <PRSuccessAlertDialog
              open={showPrDialog}
              onOpenChange={setShowPrDialog}
              prUrl={prUrl || ""}
              repoName={prRepoName}
              branchName={finalResult?.branch_name || undefined}
              commitHash={finalResult?.commit_hash || undefined}
              fixes={fixes}
              timeTaken={finalResult?.time_taken_seconds}
              teamName={teamName}
              teamLeaderName={teamLeaderName}
            />

            {/* ── Persistent "View PR" button if PR exists ── */}
            {finalResult?.passed && prUrl && (
              <div className="flex justify-center mt-6">
                <Button asChild className="gap-2 shadow-lg hover:shadow-primary/20 transition-all">
                  <a href={prUrl} target="_blank" rel="noopener noreferrer">
                    <GitPullRequest className="h-4 w-4" />
                    View Pull Request
                    <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                  </a>
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button variant="outline" onClick={resetAnalysis} className="gap-2 text-sm">
                <RefreshCw className="h-3.5 w-3.5" /> Run another analysis
              </Button>
              {finalResult?.branch_name && (
                <Button asChild className="gap-2 text-sm">
                  <a href={`${finalResult.repo_url}/tree/${finalResult.branch_name}`} target="_blank" rel="noopener noreferrer">
                    <GitHubIcon className="h-3.5 w-3.5" />
                    View branch on GitHub
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
