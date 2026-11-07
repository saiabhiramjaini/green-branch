"use client";

import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RunnerProvider } from "./runner-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider>
        <RunnerProvider>{children}</RunnerProvider>
      </TooltipProvider>
    </SessionProvider>
  );
}
