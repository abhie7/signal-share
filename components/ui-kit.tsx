"use client"

import { useEffect, useRef, useState } from "react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { Icon } from "@/components/icon"
import { cn, copyTextToClipboard } from "@/lib/utils"

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger"
  size?: "md" | "lg" | "sm"
}

export function Btn({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type='button'
      {...props}
      className={cn(
        "pressable inline-flex select-none items-center justify-center gap-2 rounded-full font-medium disabled:cursor-not-allowed disabled:opacity-45",
        size === "lg" && "h-12 px-6 text-[15px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "sm" && "h-8 px-3 text-[13px]",
        variant === "primary" && "btn-primary font-semibold",
        variant === "secondary" &&
          "border border-border bg-surface text-foreground shadow-[inset_0_1px_0_var(--rim)] backdrop-blur-md hover:border-[color-mix(in_oklch,var(--teal)_45%,transparent)]",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
        variant === "danger" &&
          "bg-destructive/10 text-destructive hover:bg-destructive/15",
        className,
      )}
    />
  )
}

/** Copy with visible confirmation; failures are reported, never silent. */
export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
}: {
  value: string
  label?: string
  className?: string
  size?: "sm" | "md"
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return (
    <Btn
      size={size}
      className={cn("min-w-[5.5rem]", className)}
      aria-live='polite'
      onClick={async () => {
        if (!(await copyTextToClipboard(value))) {
          toast.error("Couldn’t copy", {
            description: "Select the text and copy it manually.",
          })
          return
        }
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1600)
      }}
    >
      <span
        key={copied ? "y" : "n"}
        className='enter inline-flex items-center gap-1.5'
      >
        <Icon
          icon={copied ? Tick02Icon : Copy01Icon}
          className={cn("size-4", copied && "text-success")}
        />
        {copied ? "Copied" : label}
      </span>
    </Btn>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role='presentation'
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
      style={{ animationDuration: "700ms" }}
    />
  )
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div
      className='relative h-2 w-full overflow-hidden rounded-full bg-surface-2 shadow-[inset_0_1px_2px_oklch(0_0_0/10%)]'
      role='progressbar'
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <div
        className='progress-fill absolute inset-0 overflow-hidden rounded-full'
        style={{ transform: `scaleX(${pct})` }}
      >
        {pct > 0 && pct < 1 && (
          <span className='progress-sheen absolute inset-y-0 left-0 w-1/3' />
        )}
      </div>
    </div>
  )
}
