"use client"

import { useEffect, useId, useRef, useState } from "react"
import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { cn } from "@/lib/utils"

/**
 * A small explanation behind an info button (or any trigger). Opens on hover and keyboard
 * focus, toggles on tap for touch screens, closes on Escape or a tap elsewhere.
 */
export function InfoTip({
  children,
  label = "More information",
  trigger,
  side = "top",
  align = "center",
  className,
}: {
  children: React.ReactNode
  /** Accessible name of the default info button. */
  label?: string
  /** Replaces the info icon, e.g. a status chip. */
  trigger?: React.ReactNode
  side?: "top" | "bottom"
  align?: "start" | "center" | "end"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    const onDown = (e: PointerEvent) =>
      !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown)
    }
  }, [open])

  return (
    <span
      ref={box}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type='button'
        aria-describedby={open ? id : undefined}
        aria-label={trigger ? undefined : label}
        aria-expanded={open}
        onClick={() => setOpen(true)} // focus already opened it; a tap must not close it again
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={cn(
          "pressable inline-flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal/50",
          !trigger &&
            "size-6 justify-center text-muted-foreground hover:text-foreground",
        )}
      >
        {trigger ?? <Icon icon={InformationCircleIcon} className='size-4' />}
      </button>
      <span
        id={id}
        role='tooltip'
        data-open={open}
        className={cn(
          "pointer-events-none absolute z-50 w-64 rounded-xl border border-border bg-[var(--popover)] p-3 text-left text-xs leading-relaxed font-normal text-muted-foreground shadow-lg",
          "opacity-0 transition-[opacity,transform] duration-150 [transition-timing-function:var(--ease-out)] data-[open=true]:pointer-events-auto data-[open=true]:opacity-100",
          side === "top"
            ? "bottom-full mb-2 translate-y-1 data-[open=true]:translate-y-0"
            : "top-full mt-2 -translate-y-1 data-[open=true]:translate-y-0",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
          !open && "invisible",
        )}
      >
        {children}
      </span>
    </span>
  )
}
