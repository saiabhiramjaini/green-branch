"use client";

import { Trophy, Zap, AlertTriangle, Target, CheckCircle2, XCircle, Clock, GitCommit } from "lucide-react";

interface ScoreBreakdownProps {
  timeTakenSeconds: number;
  totalCommits: number;
  passed: boolean;
}

// Donut Chart Component
function DonutChart({
  score,
  maxScore,
  passed
}: {
  score: number;
  maxScore: number;
  passed: boolean;
}) {
  const percentage = (score / maxScore) * 100;
  const radius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="180" height="180" className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={passed ? "url(#scoreGradient)" : "url(#failGradient)"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
        {/* Gradient definitions */}
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="failGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${passed ? "text-primary" : "text-destructive"}`}>
          {score}
        </span>
        <span className="text-sm text-muted-foreground">/ {maxScore}</span>
        <span className="text-xs text-muted-foreground mt-1">points</span>
      </div>
    </div>
  );
}

// Score Bar Component
function ScoreBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: "green" | "red" | "gray";
}) {
  const percentage = Math.min((Math.abs(value) / maxValue) * 100, 100);
  const colorClasses = {
    green: "bg-gradient-to-r from-primary/80 to-primary",
    red: "bg-gradient-to-r from-destructive/80 to-destructive",
    gray: "bg-gradient-to-r from-muted-foreground/50 to-muted-foreground/70",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-semibold ${
          color === "green" ? "text-primary" :
          color === "red" ? "text-destructive" :
          "text-muted-foreground"
        }`}>
          {value > 0 ? `+${value}` : value}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClasses[color]} transition-all duration-700 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function ScoreBreakdown({ timeTakenSeconds, totalCommits, passed }: ScoreBreakdownProps) {
  // Score calculation rules
  const baseScore = 100;
  const speedBonusThreshold = 5 * 60; // 5 minutes in seconds
  const speedBonus = timeTakenSeconds < speedBonusThreshold ? 10 : 0;
  const commitThreshold = 20;
  const excessCommits = Math.max(0, totalCommits - commitThreshold);
  const efficiencyPenalty = excessCommits * 2;
  const maxPossibleScore = 110; // 100 base + 10 speed bonus

  // IMPORTANT: If tests fail, score is 0
  const calculatedScore = Math.max(0, baseScore + speedBonus - efficiencyPenalty);
  const finalScore = passed ? calculatedScore : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
          <Trophy className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Score Breakdown</h3>
          <p className="text-xs text-muted-foreground">Your performance metrics</p>
        </div>
      </div>

      {/* Main Content - Chart and Stats */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Donut Chart */}
        <div className="flex flex-col items-center justify-center space-y-4">
          <DonutChart score={finalScore} maxScore={maxPossibleScore} passed={passed} />

          {/* Status Badge */}
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${
            passed
              ? "bg-primary/10 border border-primary/20"
              : "bg-destructive/10 border border-destructive/20"
          }`}>
            {passed ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-primary">Tests Passed</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">Tests Failed</span>
              </>
            )}
          </div>
        </div>

        {/* Score Breakdown Bars */}
        <div className="space-y-4">
          <ScoreBar
            label="Base Score"
            value={passed ? baseScore : 0}
            maxValue={100}
            color={passed ? "green" : "gray"}
          />
          <ScoreBar
            label="Speed Bonus"
            value={passed ? speedBonus : 0}
            maxValue={10}
            color={passed && speedBonus > 0 ? "green" : "gray"}
          />
          <ScoreBar
            label="Efficiency Penalty"
            value={passed ? -efficiencyPenalty : 0}
            maxValue={40}
            color={efficiencyPenalty > 0 && passed ? "red" : "gray"}
          />
        </div>
      </div>

      {/* Scoring Rules Card */}
      <div className="rounded-xl border border-border/50 bg-secondary/20 p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Scoring Rules
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* Base Score Rule */}
          <div className="flex items-start gap-2.5 rounded-lg bg-background/50 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">+100 pts</p>
              <p className="text-xs text-muted-foreground">Base score for passing tests</p>
            </div>
          </div>

          {/* Speed Bonus Rule */}
          <div className="flex items-start gap-2.5 rounded-lg bg-background/50 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10">
              <Zap className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">+10 pts</p>
              <p className="text-xs text-muted-foreground">Bonus if completed in &lt;5 min</p>
            </div>
          </div>

          {/* Penalty Rule */}
          <div className="flex items-start gap-2.5 rounded-lg bg-background/50 p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">-2 pts</p>
              <p className="text-xs text-muted-foreground">Per commit over 20</p>
            </div>
          </div>
        </div>

        {/* Failed tests warning */}
        {!passed && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 mt-3">
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-xs text-destructive">
              <span className="font-semibold">Score: 0</span> — Tests must pass to earn points
            </p>
          </div>
        )}
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Time Taken */}
        <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
          </div>
          <p className="text-lg font-bold text-foreground">{formatTime(timeTakenSeconds)}</p>
          <p className="text-xs text-muted-foreground">Time Taken</p>
          {timeTakenSeconds < speedBonusThreshold && passed && (
            <span className="inline-block mt-1 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
              Speed Bonus!
            </span>
          )}
        </div>

        {/* Commits Used */}
        <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 text-center">
          <div className="flex justify-center mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <GitCommit className="h-4 w-4 text-purple-500" />
            </div>
          </div>
          <p className="text-lg font-bold text-foreground">{totalCommits}</p>
          <p className="text-xs text-muted-foreground">Commits Used</p>
          {totalCommits <= commitThreshold && (
            <span className="inline-block mt-1 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5">
              Under Limit
            </span>
          )}
        </div>

        {/* Speed Bonus */}
        <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 text-center">
          <div className="flex justify-center mb-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              speedBonus > 0 && passed ? "bg-yellow-500/10" : "bg-muted/30"
            }`}>
              <Zap className={`h-4 w-4 ${speedBonus > 0 && passed ? "text-yellow-500" : "text-muted-foreground"}`} />
            </div>
          </div>
          <p className={`text-lg font-bold ${speedBonus > 0 && passed ? "text-yellow-500" : "text-muted-foreground"}`}>
            {passed ? `+${speedBonus}` : "+0"}
          </p>
          <p className="text-xs text-muted-foreground">Speed Bonus</p>
        </div>

        {/* Penalty */}
        <div className="rounded-xl border border-border/50 bg-secondary/20 p-3 text-center">
          <div className="flex justify-center mb-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              efficiencyPenalty > 0 && passed ? "bg-destructive/10" : "bg-muted/30"
            }`}>
              <AlertTriangle className={`h-4 w-4 ${
                efficiencyPenalty > 0 && passed ? "text-destructive" : "text-muted-foreground"
              }`} />
            </div>
          </div>
          <p className={`text-lg font-bold ${
            efficiencyPenalty > 0 && passed ? "text-destructive" : "text-muted-foreground"
          }`}>
            {passed ? `-${efficiencyPenalty}` : "-0"}
          </p>
          <p className="text-xs text-muted-foreground">Penalty</p>
        </div>
      </div>

      {/* Final Calculation */}
      <div className={`rounded-xl p-4 ${
        passed
          ? "bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20"
          : "bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent border border-destructive/20"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Final Score</p>
            <p className={`text-3xl font-bold ${passed ? "text-primary" : "text-destructive"}`}>
              {finalScore} <span className="text-lg font-normal text-muted-foreground">points</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Calculation</p>
            {passed ? (
              <p className="text-sm font-mono text-foreground bg-secondary/50 rounded-lg px-3 py-1.5">
                {baseScore} {speedBonus > 0 ? `+ ${speedBonus}` : ""} {efficiencyPenalty > 0 ? `- ${efficiencyPenalty}` : ""} = <span className="text-primary font-bold">{finalScore}</span>
              </p>
            ) : (
              <p className="text-sm font-mono text-destructive bg-destructive/10 rounded-lg px-3 py-1.5">
                Tests Failed = <span className="font-bold">0</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
