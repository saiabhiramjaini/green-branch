// Dashboard utility functions

import type { FailedStep, Language } from "./types";

/** "4m ago" (or "4m" when short). */
export function timeAgo(date: string, short = false) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const suffix = short ? "" : " ago";
  if (seconds < 60) return short ? "now" : "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${suffix}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d${suffix}`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const LANG_COLORS: Record<string, string> = {
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

export function getLangColor(lang: string) {
  return LANG_COLORS[lang] ?? "#8b949e";
}

export function getDefaultCommands(language: Language): {
  install: string;
  test: string;
} {
  switch (language) {
    case "nodejs":
      return { install: "npm install", test: "npm run test" };
    case "python":
    default:
      // pytest must be installed too: the runner tests each repo in a fresh virtualenv
      return { install: "pip install -r requirements.txt pytest", test: "pytest" };
  }
}

export function formatTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export const LANGUAGE_LABELS: Record<Language, string> = {
  nodejs: "Node.js",
  python: "Python",
};

/**
 * Accept "owner/repo", "github.com/owner/repo" or a full https URL (optionally with
 * .git or a trailing path) and return the canonical https://github.com/owner/repo,
 * or null when it doesn't look like a GitHub repository.
 */
export function normalizeRepoUrl(input: string): string | null {
  let s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  s = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  const match = s.match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)/);
  if (!match) return null;
  return `https://github.com/${match[1]}/${match[2]}`;
}

/** GitHub's "compare & open a pull request" page for a pushed branch. */
export function compareUrl(repoUrl: string, base: string, branch: string) {
  return `${repoUrl.replace(/\/$/, "")}/compare/${encodeURI(base)}...${encodeURI(branch)}?expand=1`;
}

export function mapLanguage(lang: string | null): Language {
  if (!lang) return "python";
  const l = lang.toLowerCase();
  if (l === "typescript" || l === "javascript") return "nodejs";
  return "python";
}

export function logTimestamp() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

/** Short headline for a failed run, based on the server's error message. */
export function failureTitle(message: string, failedStep: FailedStep | null) {
  if (message.includes("only works on repositories owned by")) return "Repository not allowed";
  if (message.includes("private") || message.includes("🔒")) return "Private repository";
  if (message.includes("not found") || message.includes("❌")) return "Repository not found";
  if (message.includes("empty") || message.includes("📭")) return "Repository is empty";
  if (/\bBranch '/.test(message) || message.includes("🌿")) return "Branch not found";
  if (message.includes("Network") || message.includes("🌐")) return "Network error";
  if (message.includes("No test files") || message.includes("test_*.py")) return "No test files found";
  if (failedStep === "cloning") return "Repository could not be cloned";
  return "Execution could not be completed";
}

/** Preview of the fix branch the server creates for each run (it appends a timestamp). */
export function getBranchPreview(repoName: string) {
  const slug = repoName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "repo";
  return `greenbranch/fix-${slug}-…`;
}
