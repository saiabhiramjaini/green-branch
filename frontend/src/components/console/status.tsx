import { cn } from "@/lib/utils";
import type { ItemStatus, RunStatus } from "@/lib/run-model";

type Tone = "pass" | "fail" | "running" | "neutral" | "pending";

const LABEL: Record<Tone, string> = {
  pass: "Passed",
  fail: "Failed",
  running: "Running",
  neutral: "Stopped",
  pending: "Waiting",
};

export function toneOfItem(status: ItemStatus): Tone {
  switch (status) {
    case "passed":
    case "kept":
      return "pass";
    case "failed":
    case "error":
      return "fail";
    case "running":
      return "running";
    case "pending":
      return "pending";
    default:
      return "neutral";
  }
}

export function toneOfRun(status: RunStatus): Tone {
  if (status === "passed") return "pass";
  if (status === "running") return "running";
  if (status === "interrupted") return "neutral";
  return "fail";
}

/** 14px status glyph. Every state has its own shape, not just its own colour. */
export function StatusIcon({ tone, label, className }: { tone: Tone; label?: string; className?: string }) {
  const common = { width: 14, height: 14, viewBox: "0 0 16 16", role: "img" as const, "aria-label": label ?? LABEL[tone], className: cn("shrink-0", className) };
  switch (tone) {
    case "pass":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--brand)" strokeWidth="1.6" />
          <path d="M5.2 8.2l1.9 1.9 3.8-4" fill="none" stroke="var(--brand)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "fail":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--danger)" strokeWidth="1.6" />
          <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="var(--danger)" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "running":
      return (
        <svg {...common} className={cn("shrink-0 animate-spin [animation-duration:1.4s]", className)}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--warning)" strokeOpacity="0.3" strokeWidth="1.6" />
          <path d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5" fill="none" stroke="var(--warning)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "pending":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--border-stronger)" strokeWidth="1.6" strokeDasharray="2 2.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--foreground-lighter)" strokeWidth="1.6" />
          <path d="M5.5 8h5" stroke="var(--foreground-lighter)" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
  }
}

const PILL: Record<Tone, string> = {
  pass: "border-brand-border bg-brand-soft text-brand",
  fail: "border-danger-border bg-danger-soft text-danger",
  running: "border-warning-border bg-warning-soft text-warning",
  neutral: "border-border-strong bg-surface-300 text-foreground-light",
  pending: "border-border-strong bg-surface-300 text-foreground-lighter",
};

/** Supabase-style badge: rounded pill, hairline border, tinted fill. */
export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center rounded-full border px-2.5 text-xs", PILL[tone], className)}>
      {children}
    </span>
  );
}
