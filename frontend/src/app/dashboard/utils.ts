// Dashboard utility functions

export function timeAgo(date: string) {
  const seconds = Math.floor(
    (new Date().getTime() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

export function getDefaultCommands(language: string): {
  install: string;
  test: string;
} {
  switch (language) {
    case "nodejs":
      return { install: "npm install", test: "npm run test" };
    case "python":
    default:
      return { install: "pip install -r requirements.txt", test: "pytest" };
  }
}

export function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function mapLanguage(lang: string | null): string {
  if (!lang) return "python";
  const l = lang.toLowerCase();
  if (l === "typescript" || l === "javascript") return "nodejs";
  return "python";
}

export function getBranchName(repoName: string) {
  return `${repoName.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_AI_Fix`;
}

// Generate branch name in hackathon format: TEAM_NAME_LEADER_NAME_AI_Fix
export function getTeamBranchName(teamName: string, leaderName: string): string {
  const sanitize = (str: string) =>
    str.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  return `${sanitize(teamName)}_${sanitize(leaderName)}_AI_Fix`;
}
