import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { cn } from "@/lib/utils"

export function Icon({
  icon,
  className,
  strokeWidth = 1.75,
}: {
  icon: IconSvgElement
  className?: string
  strokeWidth?: number
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      strokeWidth={strokeWidth}
      className={cn("size-5 shrink-0", className)}
      aria-hidden
    />
  )
}
