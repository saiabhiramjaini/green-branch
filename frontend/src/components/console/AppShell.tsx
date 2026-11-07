"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { ExternalLink, List, LogIn, LogOut, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GitHubIcon, LogoMark } from "@/components/brand";
import { RunsList } from "./RunsList";
import { cn } from "@/lib/utils";

interface AppShellProps {
  /** Which rail item is current. */
  section: "new" | "runs";
  selectedRunId?: string | null;
  children: React.ReactNode;
}

/** Icon rail + runs menu + content, the Supabase dashboard layout. */
export function AppShell({ section, selectedRunId, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Rail section={section} />
      <aside
        aria-label="Runs"
        className="hidden w-[248px] shrink-0 flex-col border-r border-border-muted md:flex md:sticky md:top-0 md:h-screen"
      >
        <div className="flex h-12 shrink-0 items-center border-b border-border-muted px-4 text-base">Runs</div>
        <RunsList selectedRunId={selectedRunId ?? null} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function RailLink({ href, label, active, children }: { href: string; label: string; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        active ? "bg-selection text-foreground" : "text-foreground-lighter hover:bg-selection hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

function Rail({ section }: { section: AppShellProps["section"] }) {
  const { data: session, status } = useSession();
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 border-b border-border-muted bg-background px-3 md:h-screen md:w-12 md:flex-col md:border-b-0 md:border-r md:px-0 md:py-2.5"
    >
      <Link href="/dashboard" aria-label="GreenBranch" className="mr-2 flex h-8 w-8 items-center justify-center md:mb-2 md:mr-0">
        <LogoMark />
      </Link>
      <RailLink href="/dashboard" label="New run" active={section === "new"}>
        <Plus className="h-[18px] w-[18px]" />
      </RailLink>
      <RailLink href="/dashboard?view=runs" label="Runs" active={section === "runs"}>
        <List className="h-[18px] w-[18px]" />
      </RailLink>

      <div className="ml-auto md:ml-0 md:mt-auto">
        {status === "loading" ? (
          <span className="block h-7 w-7 rounded-full bg-surface-300" aria-hidden />
        ) : session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Account" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-selection">
                <Avatar className="h-[26px] w-[26px] border border-border-stronger">
                  <AvatarImage src={session.user?.image || ""} alt="" />
                  <AvatarFallback className="bg-surface-300 text-[11px] text-foreground-light">
                    {session.user?.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-56 rounded-md border-border-strong bg-overlay p-1">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm text-foreground">{session.user?.name}</p>
                {session.user?.email && <p className="truncate text-xs text-foreground-lighter">{session.user.email}</p>}
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem asChild className="text-xs text-foreground-light">
                <a href="https://github.com/saiabhiramjaini/green-branch" target="_blank" rel="noopener noreferrer">
                  <GitHubIcon className="h-3.5 w-3.5" /> Source on GitHub <ExternalLink className="ml-auto h-3 w-3" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-xs text-foreground-light">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <RailLink href="/signin?callbackUrl=/dashboard" label="Sign in with GitHub">
            <LogIn className="h-[18px] w-[18px]" />
          </RailLink>
        )}
      </div>
    </nav>
  );
}

/** The 48px bar at the top of the content: breadcrumb on the left, actions on the right. */
export function TopBar({ crumbs, actions }: { crumbs: { label: string; href?: string }[]; actions?: React.ReactNode }) {
  return (
    <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-muted px-5 py-2">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <svg width="14" height="20" viewBox="0 0 14 20" aria-hidden className="shrink-0">
                  <path d="M10 3L4 17" stroke="var(--border-stronger)" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              )}
              {c.href && !last ? (
                <Link href={c.href} className="truncate text-foreground-lighter hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className={cn("truncate", last ? "text-foreground" : "text-foreground-lighter")} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
