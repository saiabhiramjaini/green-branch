"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GitHubIcon } from "./GitHubIcon";
import { formatTime } from "@/app/dashboard/utils";

interface DashboardHeaderProps {
  session: Session | null;
  /** Seconds elapsed, shown while a pipeline is streaming (null hides the timer). */
  elapsedTime: number | null;
}

export function DashboardHeader({ session, elapsedTime }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-50 glass-nav">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative">
            <Image src="/logo.png" alt="GreenBranch" width={28} height={28} className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </div>
          <span className="text-sm font-semibold text-foreground">GreenBranch</span>
        </Link>

        <div className="flex items-center gap-3">
          {elapsedTime !== null && (
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="font-mono text-xs text-primary">{formatTime(elapsedTime)}</span>
            </div>
          )}

          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                  <Avatar className="h-8 w-8 ring-2 ring-primary/20 ring-offset-1 ring-offset-background transition-all hover:ring-primary/40">
                    <AvatarImage src={session.user?.image || ""} alt={session.user?.name || "User"} />
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {session.user?.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass-card rounded-xl border-border/50 overflow-hidden">
                <div className="px-3 py-3 bg-primary/5 border-b border-border/50">
                  <p className="text-sm font-semibold text-foreground leading-tight">{session.user?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.user?.email}</p>
                </div>
                <div className="p-1">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center gap-2 rounded-lg">
                      <User className="h-3.5 w-3.5" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                </div>
                <div className="p-1 pt-0">
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="flex items-center gap-2 rounded-lg font-medium bg-destructive/10 text-destructive hover:!bg-destructive hover:!text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link href="/signin">
              <Button variant="outline" size="sm" className="gap-2">
                <GitHubIcon className="h-4 w-4" /> Sign in
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
