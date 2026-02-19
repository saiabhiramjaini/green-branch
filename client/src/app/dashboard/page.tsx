"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  type Variants,
} from "framer-motion";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Lock,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  GitBranch,
  LogOut,
  User,
  ChevronRight,
  Timer,
  RefreshCw,
  ArrowUpRight,
  Terminal,
  Activity,
  MoreHorizontal,
  AlertCircle,
  Play,
} from "lucide-react";

// ── GitHub Icon ────────────────────────────────────────────────────────────────

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  updated_at: string;
  language: string | null;
}

interface Fix {
  file: string;
  bug_type: string;
  line_number: number;
  commit_message: string;
  status: "fixed" | "failed";
}

interface CIRun {
  iteration: number;
  status: "passed" | "failed";
  timestamp: string;
}

type ExecutionStep =
  | "idle"
  | "cloning"
  | "awaiting_commands"
  | "running_tests"
  | "analyzing"
  | "fixing"
  | "verifying"
  | "completed"
  | "failed";

interface AnalysisResult {
  status: ExecutionStep;
  session_id?: string;
  error_message?: string;
  failed_step?: "cloning" | "executing";
  repo_url?: string;
  branch_name?: string;
  fixes_applied?: number;
  failures_detected?: number;
  ci_status?: "PASSED" | "FAILED";
  time_taken?: string;
  base_score?: number;
  speed_bonus?: number;
  efficiency_penalty?: number;
  final_score?: number;
  total_commits?: number;
  fixes?: Fix[];
  ci_runs?: CIRun[];
  current_iteration?: number;
  max_iterations?: number;
}

// Only the 4 steps shown in the execution log panel (cloning has its own phase)
const EXECUTE_STEPS: { key: ExecutionStep; label: string; detail: string }[] = [
  { key: "running_tests", label: "Running test suite",  detail: "Executing CI pipeline"          },
  { key: "analyzing",     label: "Analyzing failures",  detail: "AI inspecting error traces"     },
  { key: "fixing",        label: "Applying fixes",      detail: "Committing changes to branch"   },
  { key: "verifying",     label: "Verifying changes",   detail: "Re-running tests to confirm"    },
];

function getDefaultCommands(language: string): { install: string; test: string } {
  switch (language) {
    case "nodejs":
      return { install: "npm install", test: "npm test" };
    case "python":
    default:
      return { install: "pip install -r requirements.txt", test: "pytest" };
  }
}


// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  CSS: "#563d7c",
  HTML: "#e34c26",
  Shell: "#89e051",
  Vue: "#41b883",
};

function getLangColor(lang: string) {
  return LANG_COLORS[lang] ?? "#8b949e";
}

// ── Animation Variants ─────────────────────────────────────────────────────────

const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.25 } },
};

const stagger: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const cardVariant: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } },
};

// ── Animated Number ────────────────────────────────────────────────────────────

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, Math.round);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(mv, value, { duration: 1.2, ease: "easeOut", delay: 0.3 });
    return controls.stop;
  }, [value, mv]);

  useEffect(() => rounded.on("change", setDisplay), [rounded]);
  return <span className={className}>{display}</span>;
}

// ── RepoCard (Vercel-style) ────────────────────────────────────────────────────

function RepoCard({
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

  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      variants={cardVariant}
      whileHover={!disabled ? { y: -2, transition: { duration: 0.15 } } : {}}
      whileTap={!disabled ? { scale: 0.99 } : {}}
      className={`group relative w-full rounded-xl border p-4 text-left transition-all duration-200 ${
        isSelected
          ? "border-primary bg-primary/[0.04] shadow-lg shadow-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:shadow-md hover:shadow-black/20"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      {/* Selected ring */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-primary/40"
          />
        )}
      </AnimatePresence>

      {/* Top row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Project icon */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-xs font-bold text-foreground">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {repo.name}
            </p>
            {repo.description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {repo.description}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground/50 italic">
                No description
              </p>
            )}
          </div>
        </div>

        {/* Right icons */}
        <div className="flex shrink-0 items-center gap-1">
          <AnimatePresence>
            {isSelected ? (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground"
              >
                <Activity className="h-3.5 w-3.5" />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      {/* GitHub badge */}
      <div className="mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground">
          <GitHubIcon className="h-3 w-3" />
          {repo.full_name}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {repo.private && (
            <>
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Private
              </span>
              <span>·</span>
            </>
          )}
          <span>{timeAgo(repo.updated_at)}</span>
        </div>
        {repo.language && (
          <span className="flex items-center gap-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getLangColor(repo.language) }}
            />
            {repo.language}
          </span>
        )}
      </div>
    </motion.button>
  );
}

function RepoCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
      <Skeleton className="mb-3 h-5 w-32 rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [result, setResult] = useState<AnalysisResult>({ status: "idle" });
  const [searchQuery, setSearchQuery] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [installCommand, setInstallCommand] = useState("");
  const [testCommand, setTestCommand] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/signin");
  }, [status, router]);

  useEffect(() => {
    if (!session) return;
    axios
      .get<Repo[]>("/api/github/repos")
      .then(({ data }) => setRepos(Array.isArray(data) ? data : []))
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    // Timer runs during active work; pause during user-interaction step
    if (!["idle", "awaiting_commands", "completed", "failed"].includes(result.status)) {
      interval = setInterval(() => setElapsedTime((p) => p + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [result.status]);

  const getBranchName = () => {
    if (!selectedRepo) return "";
    return `${selectedRepo.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_AI_Fix`;
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const mapLanguage = (lang: string | null): string => {
    if (!lang) return "python";
    const l = lang.toLowerCase();
    if (l === "typescript" || l === "javascript") return "nodejs";
    return "python";
  };

  // ── Step 1: Clone repo → transition to command review ──────────────────────
  const handleClone = async () => {
    if (!selectedRepo) return;
    setElapsedTime(0);

    const agentUrl = process.env.NEXT_PUBLIC_EC2_AGENT_URL;
    const userId   = session?.user?.email ?? session?.user?.name ?? "anonymous";
    const language = mapLanguage(selectedRepo.language);

    setResult({ status: "cloning" });

    try {
      const { data: sessionData } = await axios.post(
        `${agentUrl}/api/v1/sessions`,
        null,
        { params: { repo_url: selectedRepo.html_url, language, user_id: userId } }
      );

      const sid = sessionData.session_id as string;
      setSessionId(sid);

      // Pre-fill commands based on detected language
      const defaults = getDefaultCommands(language);
      setInstallCommand(defaults.install);
      setTestCommand(defaults.test);

      setResult({ status: "awaiting_commands", session_id: sid });
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.response?.data?.message ?? err.message)
        : "Unexpected error during cloning.";
      setResult({ status: "failed", failed_step: "cloning", error_message: String(msg) });
    }
  };

  // ── Step 2: Execute with confirmed commands ─────────────────────────────────
  const handleExecute = async () => {
    if (!selectedRepo || !sessionId) return;

    const agentUrl  = process.env.NEXT_PUBLIC_EC2_AGENT_URL;
    const branchName = getBranchName();

    const runSteps: ExecutionStep[] = ["running_tests", "analyzing", "fixing", "verifying"];
    let stepIdx = 0;
    setResult((prev) => ({ ...prev, status: runSteps[0] }));

    // Advance UI steps while the long-running execute call is in-flight
    const stepInterval = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, runSteps.length - 1);
      setResult((prev) => ({ ...prev, status: runSteps[stepIdx] }));
    }, 3000);

    try {
      const { data } = await axios.post(`${agentUrl}/api/v1/execute`, {
        session_id:      sessionId,
        branch:          "main",
        install_command: installCommand.trim() || undefined,
        test_command:    testCommand.trim()    || undefined,
      });

      clearInterval(stepInterval);

      const isSuccess = data.status === "success";
      const fixes: Fix[] = (data.errors ?? []).map(
        (e: { file: string; error_type: string; line?: number; message: string }) => ({
          file:           e.file,
          bug_type:       e.error_type,
          line_number:    e.line ?? 0,
          commit_message: e.message,
          status:         isSuccess ? ("fixed" as const) : ("failed" as const),
        })
      );

      const duration         = Math.round(data.duration ?? elapsedTime);
      const speedBonus       = duration < 300 ? 10 : 0;
      const failedCount      = fixes.filter((f) => f.status === "failed").length;
      const efficiencyPenalty = failedCount * 5;
      const baseScore        = 100;
      const finalScore       = baseScore + speedBonus - efficiencyPenalty;

      const now = new Date();
      const ts  = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setResult({
        status:              "completed",
        session_id:          sessionId,
        repo_url:            selectedRepo.html_url,
        branch_name:         branchName,
        failures_detected:   data.failed ?? fixes.length,
        fixes_applied:       isSuccess ? fixes.length : 0,
        ci_status:           isSuccess ? "PASSED" : "FAILED",
        time_taken:          formatTime(duration),
        base_score:          baseScore,
        speed_bonus:         speedBonus,
        efficiency_penalty:  efficiencyPenalty,
        final_score:         finalScore,
        total_commits:       fixes.length,
        fixes,
        ci_runs: [{ iteration: 1, status: isSuccess ? "passed" : "failed", timestamp: ts }],
        current_iteration: 1,
        max_iterations:    5,
      });
    } catch (err) {
      clearInterval(stepInterval);
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.detail ?? err.response?.data?.message ?? err.message)
        : "Unexpected error during execution.";
      setResult({ status: "failed", failed_step: "executing", error_message: String(msg) });
    }
  };

  const resetAnalysis = () => {
    setResult({ status: "idle" });
    setSelectedRepo(null);
    setElapsedTime(0);
    setSessionId(null);
    setInstallCommand("");
    setTestCommand("");
  };

  const filteredRepos = repos.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Active only during cloning + execute steps (not during user-interaction)
  const isRunning = !["idle", "awaiting_commands", "completed", "failed"].includes(result.status);

  const executeStepIndex = EXECUTE_STEPS.findIndex((s) => s.key === result.status);
  const progressPct = executeStepIndex >= 0
    ? ((executeStepIndex + 1) / EXECUTE_STEPS.length) * 100
    : 0;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </motion.div>
      </div>
    );
  }

  if (!session) return null;

  const phase =
    result.status === "idle"              ? "idle"      :
    result.status === "cloning"           ? "cloning"   :
    result.status === "awaiting_commands" ? "configure" :
    isRunning                             ? "running"   :
    "done";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <motion.div whileHover={{ rotate: 8 }} transition={{ type: "spring", stiffness: 400 }}>
              <Image src="/logo.png" alt="GreenBranch" width={28} height={28} className="h-7 w-7" />
            </motion.div>
            <span className="text-sm font-semibold text-foreground">GreenBranch</span>
          </Link>

          <div className="flex items-center gap-3">
            <AnimatePresence>
              {isRunning && (
                <motion.div
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="hidden items-center gap-2 sm:flex"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatTime(elapsedTime)}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                  <Avatar className="h-8 w-8 ring-1 ring-border ring-offset-1 ring-offset-background">
                    <AvatarImage src={session.user?.image || ""} alt={session.user?.name || "User"} />
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {session.user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-foreground">{session.user?.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5" /> Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="flex items-center gap-2 text-destructive focus:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {/* ─────────────── IDLE ─────────────── */}
          {phase === "idle" && (
            <motion.div
              key="idle"
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              {/* Page heading */}
              <motion.div variants={fadeUp} className="flex items-center justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Projects
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Select a repository to run an autonomous analysis.
                  </p>
                </div>
                <motion.div
                  whileHover={selectedRepo ? { scale: 1.02 } : {}}
                  whileTap={selectedRepo ? { scale: 0.98 } : {}}
                >
                  <Button
                    size="default"
                    onClick={handleClone}
                    disabled={!selectedRepo}
                    className="gap-2"
                  >
                    Run GreenBranch
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </motion.div>

              {/* Search bar */}
              <motion.div variants={fadeUp} className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-secondary/30 pl-9"
                />
              </motion.div>

              {/* Project grid */}
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="grid gap-3 sm:grid-cols-2"
              >
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <RepoCardSkeleton key={i} />)
                ) : filteredRepos.length === 0 ? (
                  <motion.div
                    variants={fadeUp}
                    className="col-span-2 py-16 text-center text-sm text-muted-foreground"
                  >
                    {searchQuery ? "No repositories match your search" : "No repositories found"}
                  </motion.div>
                ) : (
                  filteredRepos.map((repo) => (
                    <RepoCard
                      key={repo.id}
                      repo={repo}
                      onSelect={() =>
                        setSelectedRepo(selectedRepo?.id === repo.id ? null : repo)
                      }
                      isSelected={selectedRepo?.id === repo.id}
                      disabled={isRunning}
                    />
                  ))
                )}
              </motion.div>

              {/* Bottom hint */}
              {selectedRepo && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <GitBranch className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-xs text-muted-foreground">Will create branch</p>
                      <code className="text-xs font-medium text-primary">{getBranchName()}</code>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Your main branch stays untouched.</p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ─────────────── CLONING ─────────────── */}
          {phase === "cloning" && (
            <motion.div
              key="cloning"
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <motion.div variants={fadeUp} className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Cloning {selectedRepo?.name}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  Fetching source code from GitHub…
                </p>
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4"
              >
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">Cloning repository</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {selectedRepo?.html_url}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ─────────────── CONFIGURE ─────────────── */}
          {phase === "configure" && (
            <motion.div
              key="configure"
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              {/* Header */}
              <motion.div variants={fadeUp} className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      Repository cloned
                    </h1>
                  </div>
                  <p className="text-sm text-muted-foreground">{selectedRepo?.full_name}</p>
                </div>
                <button
                  onClick={resetAnalysis}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Cancel
                </button>
              </motion.div>

              {/* Command inputs */}
              <motion.div
                variants={fadeUp}
                className="space-y-5 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center gap-2 border-b border-border pb-4">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Configure commands</p>
                  <span className="ml-auto rounded-full border border-border bg-secondary/50 px-2 py-0.5 text-xs text-muted-foreground">
                    {mapLanguage(selectedRepo?.language ?? null)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Install command
                  </label>
                  <p className="text-xs text-muted-foreground">
                    How to install project dependencies
                  </p>
                  <Input
                    value={installCommand}
                    onChange={(e) => setInstallCommand(e.target.value)}
                    placeholder="pip install -r requirements.txt"
                    className="mt-1 font-mono text-sm"
                    spellCheck={false}
                  />
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Test command
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Command that runs your test suite
                  </p>
                  <Input
                    value={testCommand}
                    onChange={(e) => setTestCommand(e.target.value)}
                    placeholder="pytest"
                    className="mt-1 font-mono text-sm"
                    spellCheck={false}
                  />
                </div>
              </motion.div>

              {/* Branch info */}
              <motion.div
                variants={fadeUp}
                className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Fixes committed to branch</p>
                  <code className="text-xs font-medium text-primary">{getBranchName()}</code>
                </div>
              </motion.div>

              {/* Action */}
              <motion.div variants={fadeUp} className="flex justify-end">
                <motion.div
                  whileHover={installCommand.trim() && testCommand.trim() ? { scale: 1.02 } : {}}
                  whileTap={installCommand.trim() && testCommand.trim() ? { scale: 0.98 } : {}}
                >
                  <Button
                    size="default"
                    onClick={handleExecute}
                    disabled={!installCommand.trim() || !testCommand.trim()}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Run Tests
                  </Button>
                </motion.div>
              </motion.div>
            </motion.div>
          )}

          {/* ─────────────── RUNNING ─────────────── */}
          {phase === "running" && (
            <motion.div
              key="running"
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              <motion.div variants={fadeUp} className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Analyzing {selectedRepo?.name}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  GreenBranch is working autonomously on your repository.
                </p>
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Execution log</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">
                      Iteration {result.current_iteration}/{result.max_iterations}
                    </span>
                    <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      {formatTime(elapsedTime)}
                    </div>
                  </div>
                </div>

                <div className="space-y-0.5 p-3">
                  {EXECUTE_STEPS.map((step, index) => {
                    const isCompleted = index < executeStepIndex;
                    const isCurrent = index === executeStepIndex;
                    const isPending = index > executeStepIndex;
                    return (
                      <motion.div
                        key={step.key}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.3 }}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${isCurrent ? "bg-primary/5" : ""}`}
                      >
                        <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          {isCompleted && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 25 }}
                            >
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            </motion.div>
                          )}
                          {isCurrent && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {isPending && <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span
                            className={`text-sm ${
                              isCompleted
                                ? "text-muted-foreground line-through decoration-muted-foreground/40"
                                : isCurrent
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground/50"
                            }`}
                          >
                            {step.label}
                          </span>
                          {isCurrent && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-xs text-muted-foreground"
                            >
                              {step.detail}
                            </motion.p>
                          )}
                        </div>
                        {isCompleted && <span className="text-xs text-muted-foreground">done</span>}
                        {isCurrent && (
                          <motion.span
                            animate={{ opacity: [1, 0.4, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="text-xs text-primary"
                          >
                            running
                          </motion.span>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                <div className="h-0.5 bg-secondary">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ─────────────── RESULTS ─────────────── */}
          {phase === "done" && (
            <motion.div
              key="done"
              variants={stagger}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-6"
            >
              {/* ── Failure state ── */}
              {result.status === "failed" ? (
                <>
                  <motion.div variants={fadeUp} className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      {result.failed_step === "cloning" ? "Cloning failed" : "Execution failed"}
                    </h1>
                    <p className="text-sm text-muted-foreground">{selectedRepo?.full_name}</p>
                  </motion.div>

                  <motion.div
                    variants={fadeUp}
                    className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {result.failed_step === "cloning"
                            ? "Repository could not be cloned"
                            : "Test execution could not be completed"}
                        </p>
                        <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                          {result.error_message ?? "An unknown error occurred."}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div variants={fadeUp}>
                    <Button variant="outline" onClick={resetAnalysis} className="gap-2 text-sm">
                      <RefreshCw className="h-3.5 w-3.5" /> Try again
                    </Button>
                  </motion.div>
                </>
              ) : (
              <>
              <motion.div variants={fadeUp} className="flex items-start justify-between">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    Analysis complete
                  </h1>
                  <p className="text-sm text-muted-foreground">{selectedRepo?.full_name}</p>
                </div>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${
                    result.ci_status === "PASSED"
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  }`}
                >
                  {result.ci_status === "PASSED" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" />
                  )}
                  CI {result.ci_status}
                </motion.div>
              </motion.div>

              {/* Stats */}
              <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Failures detected", value: result.failures_detected ?? 0, color: "text-destructive" },
                  { label: "Fixes applied", value: result.fixes_applied ?? 0, color: "text-primary" },
                  { label: "Total commits", value: result.total_commits ?? 0, color: "text-foreground" },
                  { label: "Final score", value: result.final_score ?? 0, color: "text-foreground", suffix: " pts" },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.07, duration: 0.35 }}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-end gap-0.5">
                      <AnimatedNumber value={stat.value} className={`text-3xl font-bold leading-none ${stat.color}`} />
                      {stat.suffix && <span className={`mb-0.5 text-lg font-bold ${stat.color}`}>{stat.suffix}</span>}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{stat.label}</p>
                  </motion.div>
                ))}
              </motion.div>

              {/* Branch & Score */}
              <motion.div variants={fadeUp} className="space-y-5 rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Branch created</p>
                    <code className="truncate text-xs font-medium text-primary">{result.branch_name}</code>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">Score breakdown</p>
                  <div className="space-y-2.5">
                    {[
                      { label: "Base score", value: `${result.base_score} pts`, color: "text-foreground" },
                      { label: "Speed bonus (< 5 min)", value: `+${result.speed_bonus} pts`, color: "text-primary" },
                      { label: "Efficiency penalty", value: `-${result.efficiency_penalty} pts`, color: "text-destructive" },
                    ].map((row) => (
                      <div key={row.label} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className={row.color}>{row.value}</span>
                      </div>
                    ))}
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Final score</span>
                      <span className="text-xl font-bold text-primary">{result.final_score} pts</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Fixes table */}
              <motion.div variants={fadeUp} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-5 py-3.5">
                  <p className="text-sm font-medium text-foreground">Fixes applied</p>
                  <p className="text-xs text-muted-foreground">Detailed breakdown of all changes</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-xs">File</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Line</TableHead>
                      <TableHead className="hidden text-xs md:table-cell">Commit</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.fixes?.map((fix, idx) => (
                      <motion.tr
                        key={idx}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + idx * 0.06 }}
                        className="border-border"
                      >
                        <TableCell className="font-mono text-xs">{fix.file}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded border border-border bg-secondary/50 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {fix.bug_type}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fix.line_number}</TableCell>
                        <TableCell className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:table-cell">
                          {fix.commit_message}
                        </TableCell>
                        <TableCell>
                          {fix.status === "fixed" ? (
                            <span className="inline-flex items-center gap-1 text-xs text-primary">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Fixed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-destructive">
                              <XCircle className="h-3.5 w-3.5" /> Failed
                            </span>
                          )}
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
              </motion.div>

              {/* CI Timeline */}
              <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4">
                  <p className="text-sm font-medium text-foreground">CI/CD Timeline</p>
                  <p className="text-xs text-muted-foreground">
                    {result.ci_runs?.length}/{result.max_iterations} iterations used
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {result.ci_runs?.map((run, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 + idx * 0.12, type: "spring", stiffness: 300 }}
                      className="flex items-center gap-2"
                    >
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full font-mono text-xs font-bold ${
                          run.status === "passed"
                            ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                            : "bg-destructive/10 text-destructive ring-1 ring-destructive/30"
                        }`}
                      >
                        #{run.iteration}
                      </div>
                      <div>
                        <p className={`text-xs font-medium capitalize ${run.status === "passed" ? "text-primary" : "text-destructive"}`}>
                          {run.status}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{run.timestamp}</p>
                      </div>
                      {idx < (result.ci_runs?.length ?? 0) - 1 && (
                        <div className="mx-1 h-0.5 w-6 rounded-full bg-border" />
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Actions */}
              <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" onClick={resetAnalysis} className="gap-2 text-sm">
                  <RefreshCw className="h-3.5 w-3.5" /> Run another analysis
                </Button>
                <Button asChild className="gap-2 text-sm">
                  <a
                    href={`${result.repo_url}/tree/${result.branch_name}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GitHubIcon className="h-3.5 w-3.5" />
                    View branch on GitHub
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </motion.div>
              </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
