"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "@/components/brand";

export function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="mx-auto flex h-16 w-full max-w-[960px] items-center justify-between px-5">
      <Wordmark />
      {status === "loading" ? (
        <span className="h-7 w-7 rounded-full bg-surface-200" aria-hidden />
      ) : session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Account" className="rounded-full">
              <Avatar className="h-7 w-7">
                <AvatarImage src={session.user?.image || ""} alt="" />
                <AvatarFallback className="bg-surface-200 text-xs text-foreground-light">
                  {session.user?.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-lg border-border bg-background p-1 shadow-[0_8px_30px_rgb(0_0_0/0.08)]">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium">{session.user?.name}</p>
              {session.user?.email && <p className="truncate text-xs text-foreground-lighter">{session.user.email}</p>}
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem asChild className="text-[13px]">
              <a href="https://github.com/saiabhiramjaini/green-branch" target="_blank" rel="noopener noreferrer">
                Source on GitHub
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })} className="text-[13px]">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link href="/signin" className="text-sm text-foreground-lighter hover:text-foreground">
          Sign in
        </Link>
      )}
    </header>
  );
}
