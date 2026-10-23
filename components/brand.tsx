"use client"

import { useEffect, useId, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import TopoBackground from "@/components/kokonutui/topo-background"
import { useShare } from "@/lib/store"
import { cn } from "@/lib/utils"

// ── Logo ─────────────────────────────────────────────────────────────────────

export const LOGO_PATH =
  "m11.801 6.49 1.486-1.486c1.673-1.673 3.862-2.367 6.18-2.48.902-.044 1.352-.066 1.714.295.361.362.34.812.295 1.714-.113 2.318-.807 4.507-2.48 6.18L17.511 12.2c-1.224 1.223-1.572 1.571-1.315 2.898.254 1.014.499 1.995-.238 2.732-.894.895-1.71.895-2.604 0l-7.183-7.183c-.895-.894-.895-1.71 0-2.604.737-.737 1.718-.492 2.732-.238 1.327.257 1.675-.091 2.898-1.315m5.195.51h.009M2.5 21.5l5-5m1 5 2-2m-8-4 2-2"

/** The original SignalShare rocket, stroked with the brand gradient. */
export function LogoMark({
  className,
  strokeWidth = 2,
}: {
  className?: string
  strokeWidth?: number
}) {
  const id = `lg${useId().replace(/:/g, "")}`
  return (
    <svg
      viewBox='0 0 24 24'
      className={className}
      fill='none'
      strokeWidth={strokeWidth}
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden
    >
      <defs>
        <linearGradient
          id={id}
          x1='2'
          y1='22'
          x2='22'
          y2='2'
          gradientUnits='userSpaceOnUse'
        >
          <stop offset='0' stopColor='var(--sky)' />
          <stop offset='0.55' stopColor='var(--teal)' />
          <stop offset='1' stopColor='var(--mint)' />
        </linearGradient>
      </defs>
      <path d={LOGO_PATH} stroke={`url(#${id})`} />
    </svg>
  )
}

export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "liquid grid size-8 place-items-center !rounded-[10px]",
        className,
      )}
    >
      <LogoMark className='size-[18px]' strokeWidth={2.2} />
    </span>
  )
}

// ── Ambient colour field ─────────────────────────────────────────────────────

/**
 * A living contour map (KokonutUI TopoBackground) under two faint colour washes.
 * The cursor raises a hill in the terrain; clicking empty space sends a ripple.
 * Line colour follows what the app is doing: teal at rest, sky while moving data,
 * mint on success, coral on failure.
 */
export function Ambient() {
  const phase = useShare((s) => s.phase)
  const mood =
    phase === "completed"
      ? "success"
      : phase === "failed"
        ? "error"
        : phase === "transferring" ||
            phase === "streaming" ||
            phase === "connecting" ||
            phase === "negotiating"
          ? "active"
          : "idle"
  return (
    <div className='ambient' data-mood={mood} aria-hidden>
      <div className='wash w1' />
      <div className='wash w2' />
      <TopoBackground
        className='topo absolute inset-0 min-h-0 bg-transparent dark:bg-transparent'
        listenOn='window'
        labels={false}
        speed={0.35}
        interval={0.08}
        seed={7}
      >
        {null}
      </TopoBackground>
    </div>
  )
}

// ── Fluid glass ──────────────────────────────────────────────────────────────

export function Glass({
  as: Tag = "div",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "header" | "article"
}) {
  return (
    <Tag className={cn("liquid", className)} {...props}>
      {children}
    </Tag>
  )
}

/**
 * A glass container that changes shape instead of jumping: when its content
 * grows or shrinks (a new phase, a QR code, an error) the height follows on a spring.
 */
export function Morph({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | "auto">("auto")
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = inner.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={
        reduce
          ? { duration: 0 }
          : { type: "spring", bounce: 0.12, duration: 0.5 }
      }
      style={{ overflow: "hidden" }}
    >
      <div ref={inner}>{children}</div>
    </motion.div>
  )
}

// ── Avatars ──────────────────────────────────────────────────────────────────

const AVATAR_HUES = [
  "var(--teal)",
  "var(--sky)",
  "var(--violet)",
  "var(--coral)",
  "var(--amber)",
  "var(--mint)",
]

function hash(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

/**
 * A voxel character (DiceBear voxel-art) standing on a bevelled voxel block in the
 * device's own colour pair. Falls back to initials when the image can't load.
 */
export function Avatar({
  name,
  className,
  ring,
}: {
  name: string
  className?: string
  ring?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const h = hash(name)
  const a = AVATAR_HUES[h % AVATAR_HUES.length]
  const b = AVATAR_HUES[(h >> 3) % AVATAR_HUES.length]
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className={cn(
        "voxel relative grid size-10 shrink-0 place-items-center overflow-hidden text-[13px] font-semibold text-white",
        ring && "voxel-ring",
        className,
      )}
      style={{ ["--va" as string]: a, ["--vb" as string]: b }}
      aria-hidden
    >
      {failed ? (
        initials || "?"
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://api.dicebear.com/10.x/voxel-art/svg?seed=${encodeURIComponent(name)}&backgroundColor=00000000`}
          alt=''
          className='relative size-[112%] translate-y-[6%] object-contain drop-shadow-[0_2px_1px_oklch(0_0_0/25%)]'
          loading='lazy'
          referrerPolicy='no-referrer'
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}

// ── Signal orbit ─────────────────────────────────────────────────────────────

/**
 * You at the centre, devices on your network orbiting you, signal ripples going out.
 * Replaces the old radar: it shows something true (who can see you) instead of a sweep.
 */
export function SignalOrbit({
  me,
  peers,
  className,
  onPeer,
}: {
  me: string
  peers: Array<{ id: string; name: string }>
  className?: string
  onPeer?: (id: string) => void
}) {
  const inner = peers.slice(0, 3)
  const outer = peers.slice(3, 9)
  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[19rem]",
        className,
      )}
    >
      <div className='absolute inset-[14%]'>
        <span className='ripple' />
        <span className='ripple' />
      </div>
      <Ring inset='22%' spin='38s' items={inner} onPeer={onPeer} />
      <Ring inset='2%' spin='60s' reverse items={outer} onPeer={onPeer} />
      <div className='absolute inset-[37%] grid place-items-center'>
        {me ? (
          <Avatar name={me} ring className='relative size-full' />
        ) : (
          <LogoTile className='relative size-full' />
        )}
      </div>
    </div>
  )
}

function Ring({
  inset,
  spin,
  reverse,
  items,
  onPeer,
}: {
  inset: string
  spin: string
  reverse?: boolean
  items: Array<{ id: string; name: string }>
  onPeer?: (id: string) => void
}) {
  return (
    <div
      className={cn("orbit-ring", reverse && "reverse")}
      style={{ inset, ["--spin" as string]: spin }}
    >
      {items.map((p, i) => (
        <Satellite key={p.id} angle={(360 / items.length) * i + 20}>
          <button
            type='button'
            title={p.name}
            aria-label={onPeer ? `Send to ${p.name}` : p.name}
            onClick={onPeer ? () => onPeer(p.id) : undefined}
            className={cn(
              "pressable block rounded-[30%]",
              onPeer ? "hover:scale-110" : "cursor-default",
            )}
          >
            <Avatar name={p.name} ring className='size-10' />
          </button>
        </Satellite>
      ))}
    </div>
  )
}

function Satellite({
  angle,
  children,
}: {
  angle: number
  children: React.ReactNode
}) {
  // rotate onto the ring → undo that rotation → .sat undoes the ring's spin, so avatars stay upright.
  return (
    <div
      className='absolute inset-0'
      style={{ transform: `rotate(${angle}deg)` }}
    >
      <div
        className='absolute left-1/2 top-0'
        style={{ transform: `translate(-50%, -50%) rotate(${-angle}deg)` }}
      >
        <div className='sat'>{children}</div>
      </div>
    </div>
  )
}

// ── Signal bridge ────────────────────────────────────────────────────────────

/** Two devices with data flowing between them. `state` drives colour and motion. */
export function SignalBridge({
  left,
  right,
  state,
  direction = "right",
}: {
  left: string
  right: string
  state: "searching" | "flowing" | "done" | "broken"
  direction?: "left" | "right"
}) {
  const color =
    state === "done"
      ? "var(--mint)"
      : state === "broken"
        ? "var(--coral)"
        : "var(--teal)"
  return (
    <div className='flex items-center gap-3'>
      <div className='flex min-w-0 flex-col items-center gap-1.5'>
        <Avatar name={left} ring className='size-12' />
        <span className='max-w-[7rem] truncate text-xs text-muted-foreground'>
          {left}
        </span>
      </div>
      <svg
        viewBox='0 0 200 40'
        className='h-10 flex-1'
        preserveAspectRatio='none'
        aria-hidden
      >
        <path
          d='M4 20 C 60 4, 140 36, 196 20'
          stroke='currentColor'
          className='text-border'
          strokeWidth='2'
          fill='none'
        />
        <path
          d='M4 20 C 60 4, 140 36, 196 20'
          stroke={color}
          strokeWidth='3'
          strokeLinecap='round'
          fill='none'
          className={cn(
            state === "flowing" || state === "searching" ? "flow-line" : "",
            "transition-[stroke] duration-500",
          )}
          style={{
            animationDirection: direction === "left" ? "reverse" : undefined,
            animationDuration: state === "searching" ? "2.4s" : undefined,
            opacity: state === "searching" ? 0.55 : 1,
            strokeDasharray:
              state === "done" || state === "broken"
                ? state === "broken"
                  ? "6 10"
                  : "none"
                : undefined,
          }}
        />
      </svg>
      <div className='flex min-w-0 flex-col items-center gap-1.5'>
        <Avatar name={right} ring className='size-12' />
        <span className='max-w-[7rem] truncate text-xs text-muted-foreground'>
          {right}
        </span>
      </div>
    </div>
  )
}
