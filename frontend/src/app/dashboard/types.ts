export interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  updated_at: string;
  language: string | null;
  default_branch?: string;
}

export interface Fix {
  file: string;
  bug_type: string;
  line_number: number;
  commit_message: string;
  status: "fixed" | "failed" | "pending";
  error_message?: string;
  description?: string;
  explanation?: {
    root_cause: string;
    changes_made: string;
    impact: string;
  };
}

export interface CIRun {
  iteration: number;
  status: "passed" | "failed";
  errors_count?: number;
  fixes_applied?: number;
  timestamp: string;
}

export interface LogLine {
  line: string;
  ts: string;
}

export type PipelineStep =
  | "cloning"
  | "running_tests"
  | "analyzing"
  | "fixing"
  | "verifying"
  | "committing";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface StepState {
  step: PipelineStep;
  status: StepStatus;
}

export type Phase = "idle" | "configure" | "streaming" | "done" | "failed";

export type Language = "nodejs" | "python";

/** Where a run failed: while cloning, or while running the pipeline. */
export type FailedStep = "cloning" | "executing";

/** The `complete` event's result from the server. */
export interface FinalResult {
  passed: boolean;
  branch_name: string | null; // only set when fixes were actually pushed
  base_branch: string;
  commit_hash: string | null;
  total_commits: number;
  time_taken_seconds: number;
  total_fixed: number;
  total_failures: number;
  iterations: number;
  repo_url: string;
}
