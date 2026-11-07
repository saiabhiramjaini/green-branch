import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-normal transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
  {
    variants: {
      variant: {
        // Supabase "primary": deep green fill, brand border
        default: "border-brand-button-border bg-brand-button text-foreground hover:bg-brand-button-hover",
        // Supabase "default": raised neutral
        outline: "border-border-strong bg-surface-300 text-foreground hover:border-border-stronger hover:bg-selection",
        secondary: "border-border-strong bg-surface-300 text-foreground hover:border-border-stronger hover:bg-selection",
        ghost: "border-transparent bg-transparent text-foreground-light hover:bg-selection hover:text-foreground",
        destructive: "border-danger-border bg-danger-soft text-danger hover:bg-danger/20",
        link: "border-transparent text-brand-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[30px] px-2.5 text-xs",
        xs: "h-6 px-2 text-xs",
        sm: "h-[26px] px-2 text-xs",
        lg: "h-[34px] px-3.5 text-sm",
        icon: "size-[30px]",
        "icon-xs": "size-6",
        "icon-sm": "size-[26px]",
        "icon-lg": "size-[34px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
