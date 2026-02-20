"use client";

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { Fix } from "../../app/dashboard/types";

interface FixesTableProps {
  fixes: Fix[];
}

export function FixesTable({ fixes }: FixesTableProps) {
  if (fixes.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                File
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Bug Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {fixes.map((fix, idx) => (
              <tr
                key={idx}
                className="transition-colors hover:bg-secondary/20"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        fix.status === "fixed"
                          ? "bg-primary/10"
                          : "bg-destructive/10"
                      }`}
                    >
                      {fix.status === "fixed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </div>
                    <code className="text-sm font-medium text-foreground">
                      {fix.file}
                    </code>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-normal uppercase tracking-wider"
                  >
                    {fix.bug_type}
                  </Badge>
                </td>
                <td className="px-4 py-3 max-w-md">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {fix.explanation?.root_cause ||
                      fix.description ||
                      fix.error_message ||
                      fix.commit_message}
                  </p>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge
                    variant={fix.status === "fixed" ? "default" : "destructive"}
                    className="text-xs"
                  >
                    {fix.status === "fixed" ? "Fixed" : "Failed"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
