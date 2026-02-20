"use client";

import { Trophy, Zap, AlertTriangle, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ScoreBreakdownProps {
  timeTakenSeconds: number;
  totalCommits: number;
  passed: boolean;
}

export function ScoreBreakdown({ timeTakenSeconds, totalCommits, passed }: ScoreBreakdownProps) {
  // Calculate score components
  const baseScore = 100;
  const speedBonusThreshold = 5 * 60; // 5 minutes in seconds
  const speedBonus = timeTakenSeconds < speedBonusThreshold ? 10 : 0;
  const commitThreshold = 20;
  const excessCommits = Math.max(0, totalCommits - commitThreshold);
  const efficiencyPenalty = excessCommits * 2;
  const finalScore = Math.max(0, baseScore + speedBonus - efficiencyPenalty);
  const maxPossibleScore = 110; // 100 base + 10 speed bonus

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
            <Trophy className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Score Breakdown</h3>
        </div>
        <div className={`text-3xl font-bold ${passed ? "text-primary" : "text-destructive"}`}>
          {finalScore}
          <span className="text-sm font-normal text-muted-foreground">/{maxPossibleScore}</span>
        </div>
      </div>

      {/* Score Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Score Progress</span>
          <span>{Math.round((finalScore / maxPossibleScore) * 100)}%</span>
        </div>
        <Progress value={(finalScore / maxPossibleScore) * 100} className="h-3" />
      </div>

      {/* Score Components */}
      <div className="space-y-3">
        {/* Base Score */}
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-secondary/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/50">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Base Score</p>
              <p className="text-xs text-muted-foreground">Starting points</p>
            </div>
          </div>
          <span className="text-lg font-semibold text-foreground">+{baseScore}</span>
        </div>

        {/* Speed Bonus */}
        <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
          speedBonus > 0
            ? "border-primary/30 bg-primary/5"
            : "border-border/50 bg-secondary/30"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              speedBonus > 0 ? "bg-primary/10" : "bg-muted/50"
            }`}>
              <Zap className={`h-3.5 w-3.5 ${speedBonus > 0 ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Speed Bonus</p>
              <p className="text-xs text-muted-foreground">
                {speedBonus > 0
                  ? `Completed in under 5 minutes!`
                  : `Complete in < 5 min for +10`}
              </p>
            </div>
          </div>
          <span className={`text-lg font-semibold ${speedBonus > 0 ? "text-primary" : "text-muted-foreground"}`}>
            {speedBonus > 0 ? `+${speedBonus}` : "+0"}
          </span>
        </div>

        {/* Efficiency Penalty */}
        <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
          efficiencyPenalty > 0
            ? "border-destructive/30 bg-destructive/5"
            : "border-border/50 bg-secondary/30"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              efficiencyPenalty > 0 ? "bg-destructive/10" : "bg-muted/50"
            }`}>
              <AlertTriangle className={`h-3.5 w-3.5 ${efficiencyPenalty > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Efficiency Penalty</p>
              <p className="text-xs text-muted-foreground">
                {efficiencyPenalty > 0
                  ? `${excessCommits} commits over limit (-2 each)`
                  : `${totalCommits}/${commitThreshold} commits used`}
              </p>
            </div>
          </div>
          <span className={`text-lg font-semibold ${efficiencyPenalty > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {efficiencyPenalty > 0 ? `-${efficiencyPenalty}` : "-0"}
          </span>
        </div>
      </div>

      {/* Final Score Summary */}
      <div className={`rounded-xl p-4 ${passed ? "bg-primary/10 border border-primary/20" : "bg-destructive/10 border border-destructive/20"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Final Score</p>
            <p className={`text-2xl font-bold ${passed ? "text-primary" : "text-destructive"}`}>
              {finalScore} points
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Calculation</p>
            <p className="text-sm font-mono text-foreground">
              {baseScore} {speedBonus > 0 ? `+ ${speedBonus}` : ""} {efficiencyPenalty > 0 ? `- ${efficiencyPenalty}` : ""} = {finalScore}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
