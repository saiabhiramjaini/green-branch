"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, CheckCircle2, GitPullRequest, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            className
        )}
        {...props}
    />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
                className
            )}
            {...props}
        >
            {children}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col space-y-1.5 text-center sm:text-left",
            className
        )}
        {...props}
    />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

// ── Custom PR Success Dialog Component ──
export function PRSuccessDialog({
    open,
    onOpenChange,
    prUrl,
    repoName
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    prUrl: string;
    repoName?: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md border-primary/20 bg-card overflow-hidden">
                <div className="absolute top-0 right-0 p-2">
                    {/* Close button provided by DialogContent */}
                </div>

                {/* Decorative background globs */}
                <div className="absolute -top-10 -left-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
                <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />

                <DialogHeader className="items-center text-center space-y-4 pt-4">
                    <div className="relative">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
                            <GitPullRequest className="h-8 w-8 text-primary" />
                        </div>
                        <div className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-background ring-2 ring-background">
                            <CheckCircle2 className="h-5 w-5 text-green-500 fill-green-500/10" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <DialogTitle className="text-xl">Pull Request Created!</DialogTitle>
                        <DialogDescription className="text-base text-muted-foreground max-w-[300px] mx-auto">
                            Your AI-generated fixes have been pushed and a PR has been raised for review.
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="mt-4 space-y-4">
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-primary/50" />
                            Branch: <span className="font-mono text-foreground">fix/greenbranch</span>
                        </span>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Auto-generated</span>
                    </div>

                    <DialogFooter className="sm:justify-center w-full">
                        <Button
                            className="w-full gap-2 shadow-lg hover:shadow-primary/20 transition-all text-base h-11"
                            size="lg"
                            onClick={() => window.open(prUrl, "_blank")}
                        >
                            View Pull Request
                            <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export {
    Dialog,
    DialogPortal,
    DialogOverlay,
    DialogClose,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
}
