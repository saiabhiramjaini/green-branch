import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-border-strong bg-background px-3 text-base text-foreground outline-none sm:text-sm transition-colors placeholder:text-foreground-muted",
        "hover:border-border-stronger focus-visible:border-foreground/40 focus-visible:ring-4 focus-visible:ring-foreground/5",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
