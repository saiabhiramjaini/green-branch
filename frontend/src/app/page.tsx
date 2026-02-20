"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Zap,
  Bot,
  Shield,
  BarChart3,
  GitBranch,
  CheckCircle2,
  ArrowRight,
  Play,
  Sparkles,
  Link as LinkIcon,
  Users,
  UserCircle,
  Rocket,
} from "lucide-react";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const steps = [
  {
    number: "01",
    title: "Connect Repository",
    description: "Link your GitHub repository with a single click.",
    icon: GitBranch,
  },
  {
    number: "02",
    title: "Run Tests",
    description: "GreenBranch automatically runs your test suite.",
    icon: Play,
  },
  {
    number: "03",
    title: "Detect Issues",
    description: "AI analyzes failures and identifies root causes.",
    icon: Sparkles,
  },
  {
    number: "04",
    title: "Apply Fixes",
    description: "Automated fixes are committed to a new branch.",
    icon: Zap,
  },
  {
    number: "05",
    title: "Verify Success",
    description: "Tests rerun until the pipeline turns green.",
    icon: CheckCircle2,
  },
];

const features = [
  {
    icon: Zap,
    title: "Saves Developer Time",
    description:
      "Stop debugging CI failures manually. GreenBranch handles it autonomously.",
  },
  {
    icon: Bot,
    title: "Fully Autonomous",
    description:
      "No human intervention required. The agent works independently.",
  },
  {
    icon: Shield,
    title: "Safe Execution",
    description:
      "All changes happen on a new branch. Your main branch stays protected.",
  },
  {
    icon: BarChart3,
    title: "Transparent Results",
    description:
      "Every action is logged and displayed. Full visibility into all fixes.",
  },
];

// Helper function for branch name preview
function getTeamBranchName(teamName: string, leaderName: string): string {
  const sanitize = (str: string) =>
    str.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  return `${sanitize(teamName)}_${sanitize(leaderName)}_AI_Fix`;
}

export default function Home() {
  const router = useRouter();
  const { status } = useSession();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamLeaderName, setTeamLeaderName] = useState("");

  // Redirect authenticated users away from the landing page
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  // Show nothing while checking session or redirecting
  if (status === "loading" || status === "authenticated") return null;

  const handleRunAgent = () => {
    // Store values in localStorage so dashboard can read them
    localStorage.setItem("greenbranch_repo_url", repoUrl);
    localStorage.setItem("greenbranch_team_name", teamName);
    localStorage.setItem("greenbranch_team_leader", teamLeaderName);

    // Navigate to dashboard
    router.push("/dashboard");
  };

  const isFormValid = repoUrl.trim() && teamName.trim() && teamLeaderName.trim();

  return (
    <div className="flex min-h-screen flex-col bg-background aurora-bg">
      <Header variant="landing" />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Animated background orbs */}
          <div className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/8 blur-[120px] animate-float-slow" />
            <div className="absolute right-1/4 top-1/3 h-[400px] w-[400px] rounded-full bg-primary/5 blur-[100px] animate-float" />
            <div className="absolute left-1/2 bottom-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[80px]" />
          </div>

          <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 sm:py-40 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              {/* Badge */}
              <div className="mb-8 flex justify-center animate-fade-in-up">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/5 px-5 py-2 text-sm text-primary backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Autonomous CI/CD Healing
                </div>
              </div>

              {/* Headline */}
              <h1 className="text-5xl font-bold tracking-tight sm:text-7xl animate-fade-in-up stagger-1" style={{ opacity: 0 }}>
                <span className="text-foreground">Keep your CI pipelines</span>{" "}
                <span className="gradient-text">green</span>
              </h1>

              {/* Subhead */}
              <p className="mt-8 text-lg leading-8 text-muted-foreground/80 max-w-2xl mx-auto animate-fade-in-up stagger-2" style={{ opacity: 0 }}>
                GreenBranch automatically detects, fixes, and verifies code
                issues. Stop wasting time on broken builds — let AI heal your pipelines.
              </p>

              {/* CTA */}
              <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row animate-fade-in-up stagger-3" style={{ opacity: 0 }}>
                <Button
                  size="lg"
                  onClick={() => setIsModalOpen(true)}
                  className="w-full gap-2.5 sm:w-auto text-base px-8 py-6 rounded-xl animate-pulse-glow"
                >
                  <Rocket className="h-5 w-5" />
                  Run Agent
                </Button>
                <Link href="/signin">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full gap-2.5 sm:w-auto text-base px-8 py-6 rounded-xl border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300"
                  >
                    <GitHubIcon className="h-5 w-5" />
                    Sign in with GitHub
                  </Button>
                </Link>
              </div>

              {/* Floating feature pills */}
              <div className="mt-16 flex flex-wrap items-center justify-center gap-3 animate-fade-in-up stagger-4" style={{ opacity: 0 }}>
                {["Auto Fix", "Zero Config", "Branch Safe", "Real-time Logs"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/50 bg-card/50 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:text-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="relative border-t border-border/50">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent" />
          <div className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-20">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                <span className="text-foreground">How it </span>
                <span className="gradient-text">works</span>
              </h2>
              <p className="mt-5 text-muted-foreground text-lg">
                Five simple steps to automated CI healing
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((step, index) => (
                <div key={step.number} className="relative group">
                  <div className="glass-card rounded-2xl p-6 text-center h-full">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 font-mono text-sm font-bold text-primary mb-5 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/15">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="absolute left-full top-1/2 hidden w-6 -translate-x-1/2 -translate-y-1/2 lg:flex items-center justify-center">
                      <ArrowRight className="h-4 w-4 text-primary/30" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="relative border-t border-border/50">
          <div className="mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-20">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                <span className="text-foreground">Why </span>
                <span className="gradient-text">GreenBranch</span>
                <span className="text-foreground">?</span>
              </h2>
              <p className="mt-5 text-muted-foreground text-lg">
                Built for developers who value their time
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="glass-card group rounded-2xl p-7"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/15">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust Section */}
        <section className="relative border-t border-border/50">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-primary/[0.02]" />
          <div className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="glass-card rounded-2xl p-10 glow-primary">
                <div className="flex items-center gap-3 mb-8">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground">
                    Safe by Design
                  </h2>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  {[
                    {
                      title: "Protected Main Branch",
                      desc: "GreenBranch never edits your main branch directly",
                    },
                    {
                      title: "Isolated Branches",
                      desc: "All changes happen on a new dedicated branch",
                    },
                    {
                      title: "Commit History",
                      desc: "Every fix is committed with clear messages",
                    },
                    {
                      title: "Full Audit Log",
                      desc: "All actions are logged and visible on dashboard",
                    },
                  ].map((item) => (
                    <div key={item.title} className="flex items-start gap-3.5 group">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20 transition-colors group-hover:bg-primary/20">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {item.title}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative border-t border-border/50">
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute left-1/2 bottom-0 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-primary/8 blur-[100px]" />
          </div>
          <div className="relative mx-auto max-w-7xl px-4 py-28 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                <span className="text-foreground">Ready to go </span>
                <span className="gradient-text">green</span>
                <span className="text-foreground">?</span>
              </h2>
              <p className="mt-5 text-muted-foreground text-lg">
                Connect your repository and let GreenBranch handle the rest.
              </p>
              <div className="mt-10">
                <Link href="/signin">
                  <Button size="lg" className="gap-2.5 text-base px-10 py-6 rounded-xl animate-pulse-glow">
                    <GitHubIcon className="h-5 w-5" />
                    Get Started
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt="GreenBranch"
                width={24}
                height={24}
                className="h-6 w-6"
              />
              <span className="text-sm font-medium text-muted-foreground">
                GreenBranch
              </span>
            </div>
            <p className="text-sm text-muted-foreground/60">
              Automatically detect, fix, and verify code issues to keep CI
              pipelines green.
            </p>
          </div>
        </div>
      </footer>

      {/* Run Agent Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="glass-card border-border/50 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Rocket className="h-5 w-5 text-primary" />
              Run GreenBranch Agent
            </DialogTitle>
            <DialogDescription>
              Enter repository details to start autonomous CI/CD healing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-4">
            {/* Repository URL */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> GitHub Repository URL
              </label>
              <Input
                placeholder="https://github.com/username/repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="bg-secondary/30 font-mono text-sm"
                spellCheck={false}
              />
            </div>

            {/* Team Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Team Name
                </label>
                <Input
                  placeholder="e.g., RIFT ORGANISERS"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="bg-secondary/30"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <UserCircle className="h-3.5 w-3.5" /> Team Leader Name
                </label>
                <Input
                  placeholder="e.g., Saiyam Kumar"
                  value={teamLeaderName}
                  onChange={(e) => setTeamLeaderName(e.target.value)}
                  className="bg-secondary/30"
                />
              </div>
            </div>

            {/* Branch Preview */}
            {teamName && teamLeaderName && (
              <div className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
                <GitBranch className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Branch will be named</p>
                  <code className="text-sm font-medium text-primary">
                    {getTeamBranchName(teamName, teamLeaderName)}
                  </code>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <Button
              onClick={handleRunAgent}
              disabled={!isFormValid}
              className="w-full gap-2 rounded-xl py-5 transition-all duration-300 hover:shadow-[0_0_20px_rgba(74,222,128,0.2)]"
            >
              <Play className="h-4 w-4" />
              Analyze Repository
            </Button>

            {!isFormValid && (repoUrl || teamName || teamLeaderName) && (
              <p className="text-xs text-amber-500 text-center">
                Please fill in all fields to continue
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
