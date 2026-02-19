"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "next-auth/react";
import { ArrowLeft, Shield, GitBranch } from "lucide-react";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col aurora-bg relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[400px] w-[400px] rounded-full bg-primary/8 blur-[120px] animate-float-slow" />
        <div className="absolute right-1/4 bottom-1/4 h-[300px] w-[300px] rounded-full bg-primary/5 blur-[100px] animate-float" />
      </div>

      {/* Header */}
      <header className="glass-nav">
        <div className="mx-auto flex h-16 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <Image
                src="/logo.png"
                alt="GreenBranch"
                width={32}
                height={32}
                className="h-8 w-8 transition-transform duration-300 group-hover:scale-110"
              />
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              GreenBranch
            </span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-fade-in-up">
          <Card className="glass-card rounded-2xl border-border/30 overflow-hidden">
            {/* Top gradient bar */}
            <div className="h-1 bg-gradient-to-r from-primary via-ring to-primary" />

            <CardHeader className="text-center pt-8 pb-2">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 animate-pulse-glow">
                <Image
                  src="/logo.png"
                  alt="GreenBranch"
                  width={32}
                  height={32}
                  className="h-8 w-8"
                />
              </div>
              <CardTitle className="text-xl text-foreground">
                Welcome to <span className="gradient-text">GreenBranch</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Sign in with your GitHub account to continue
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pb-8 px-7">
              <Button
                className="w-full gap-2.5 rounded-xl py-6 text-base animate-pulse-glow"
                size="lg"
                onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              >
                <GitHubIcon className="h-5 w-5" />
                Continue with GitHub
              </Button>

              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-primary/[0.03] p-4">
                <Shield className="h-4 w-4 shrink-0 text-primary/70" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We only access repositories you explicitly choose. Your code
                  stays secure.
                </p>
              </div>

              {/* Trust badges */}
              <div className="flex items-center justify-center gap-4 pt-2">
                {[
                  { icon: GitBranch, label: "Branch Safe" },
                  { icon: Shield, label: "Secure" },
                ].map((badge) => (
                  <div key={badge.label} className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                    <badge.icon className="h-3 w-3" />
                    {badge.label}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-all duration-300 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-6">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground/50">
            Automatically detect, fix, and verify code issues to keep CI
            pipelines green.
          </p>
        </div>
      </footer>
    </div>
  );
}