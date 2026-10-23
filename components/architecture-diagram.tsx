"use client"

import { useEffect, useState } from "react"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

type Route = "direct" | "turn" | "relay"

const ROUTES: Array<{
  id: Route
  label: string
  color: string
  caption: string
}> = [
  {
    id: "direct",
    label: "Direct",
    color: "var(--teal)",
    caption:
      "The devices find each other through the SignalShare server, then connect straight to each other with WebRTC. Fastest, and the server never sees the data.",
  },
  {
    id: "turn",
    label: "Via TURN",
    color: "var(--violet)",
    caption:
      "A firewall or strict NAT blocks the direct path. WebRTC goes through a TURN server instead, which forwards encrypted packets it cannot read.",
  },
  {
    id: "relay",
    label: "Encrypted relay",
    color: "var(--amber)",
    caption:
      "No TURN server, or it failed too. Files and text flow through the SignalShare relay, sealed with AES-GCM by the two devices so the server only forwards ciphertext. Screen sharing needs direct or TURN.",
  },
]

// Geometry (viewBox 640 × 440). Paths are drawn under the boxes, so lines tuck into them.
const PATHS = {
  sigL: "M100 190 C 100 120, 150 76, 226 76",
  sigR: "M414 76 C 490 76, 540 120, 540 190",
  direct: "M178 236 L 462 236",
  turn: "M120 282 C 120 360, 180 378, 236 378 L 404 378 C 460 378, 520 360, 520 282",
  relay:
    "M178 214 C 240 214, 262 150, 280 118 L 360 118 C 378 150, 400 214, 462 214",
}

const BADGE: Record<Route, { x: number; y: number }> = {
  direct: { x: 320, y: 254 },
  turn: { x: 320, y: 424 },
  relay: { x: 320, y: 140 },
}

/** Packets travelling along a path. SMIL keeps it off the main thread and needs no JS loop. */
function Packets({
  path,
  color,
  count,
  dur,
  reverse,
}: {
  path: string
  color: string
  count: number
  dur: number
  reverse?: boolean
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <circle key={i} r={4.5} fill={color}>
          <animateMotion
            dur={`${dur}s`}
            repeatCount='indefinite'
            begin={`${-(dur / count) * i}s`}
            keyPoints={reverse ? "1;0" : "0;1"}
            keyTimes='0;1'
            calcMode='linear'
          >
            <mpath href={`#arch-${path}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  )
}

function Box({
  x,
  y,
  w,
  h,
  title,
  sub,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  sub: string
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={16}
        fill='var(--popover)'
        stroke='var(--border)'
        strokeWidth={1.5}
      />
      <text
        x={x + w / 2}
        y={y + h / 2 - 3}
        textAnchor='middle'
        fontSize={16}
        fontWeight={600}
        fill='var(--foreground)'
      >
        {title}
      </text>
      <text
        x={x + w / 2}
        y={y + h / 2 + 17}
        textAnchor='middle'
        fontSize={12.5}
        fill='var(--muted-foreground)'
      >
        {sub}
      </text>
    </g>
  )
}

function Blocked({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      <circle
        r={11}
        fill='var(--popover)'
        stroke='var(--coral)'
        strokeWidth={1.5}
      />
      <path
        d='M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5'
        stroke='var(--coral)'
        strokeWidth={2}
        strokeLinecap='round'
      />
    </g>
  )
}

/** How two devices connect: signaling, then the first route that works. */
export function ArchitectureDiagram() {
  const reduce = useReducedMotion()
  const [route, setRoute] = useState<Route>("direct")
  const [auto, setAuto] = useState(true)
  const playing = auto && !reduce

  // Walk the fallback ladder on its own until the reader picks a route.
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setRoute((r) =>
        r === "direct" ? "turn" : r === "turn" ? "relay" : "direct",
      )
    }, 5000)
    return () => clearInterval(t)
  }, [playing])

  const active = ROUTES.find((r) => r.id === route)!
  const lineFor = (id: Route) => ({
    stroke: ROUTES.find((r) => r.id === id)!.color,
    strokeOpacity: id === route ? 0.6 : 0.14,
    strokeWidth: id === route ? 2.5 : 1.5,
  })

  return (
    <figure className='not-prose my-2'>
      <div
        role='radiogroup'
        aria-label='Connection route'
        className='flex flex-wrap items-center gap-2'
      >
        {ROUTES.map((r) => (
          <button
            key={r.id}
            type='button'
            role='radio'
            aria-checked={route === r.id}
            onClick={() => {
              setAuto(false)
              setRoute(r.id)
            }}
            className={cn(
              "pressable flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
              route === r.id
                ? "border-transparent bg-surface-2 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className='size-2 rounded-full'
              style={{ background: r.color }}
              aria-hidden
            />
            {r.label}
          </button>
        ))}
        {!reduce && (
          <button
            type='button'
            onClick={() => setAuto((a) => !a)}
            className='ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
          >
            {auto ? "Pause" : "Play the fallback ladder"}
          </button>
        )}
      </div>

      {/* Scrolls sideways on narrow phones so labels stay readable. */}
      <div className='mt-3 overflow-x-auto rounded-2xl border border-border bg-[color-mix(in_oklch,var(--background)_55%,transparent)]'>
        <svg
          viewBox='0 0 640 440'
          className='min-w-[520px]'
          role='img'
          aria-labelledby='arch-title arch-desc'
        >
          <title id='arch-title'>How SignalShare connects two devices</title>
          <desc id='arch-desc'>
            Both devices talk to the SignalShare server to find each other. Data
            then takes the first route that works: directly between the devices,
            through a TURN server, or through SignalShare&apos;s encrypted
            relay.
          </desc>
          <defs>
            {Object.entries(PATHS).map(([id, d]) => (
              <path key={id} id={`arch-${id}`} d={d} />
            ))}
          </defs>

          {/* Signaling: always present, it only carries setup messages. */}
          {(["sigL", "sigR"] as const).map((id) => (
            <use
              key={id}
              href={`#arch-${id}`}
              fill='none'
              stroke='var(--sky)'
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray='4 6'
            />
          ))}
          {(["direct", "turn", "relay"] as const).map((id) => (
            <use
              key={id}
              href={`#arch-${id}`}
              fill='none'
              style={{
                transition:
                  "stroke-opacity 300ms ease, stroke-width 300ms ease",
              }}
              {...lineFor(id)}
            />
          ))}

          {!reduce && (
            <g key={route}>
              <Packets path='sigL' color='var(--sky)' count={1} dur={2.6} />
              <Packets
                path='sigR'
                color='var(--sky)'
                count={1}
                dur={2.6}
                reverse
              />
              <Packets
                path={route}
                color={active.color}
                count={route === "turn" ? 5 : 4}
                dur={route === "direct" ? 2 : 3.2}
              />
            </g>
          )}

          <Box
            x={226}
            y={34}
            w={188}
            h={84}
            title='SignalShare server'
            sub='signaling · encrypted relay'
          />
          <Box x={22} y={190} w={156} h={92} title='Your device' sub='sender' />
          <Box
            x={462}
            y={190}
            w={156}
            h={92}
            title='Their device'
            sub='recipient'
          />
          <Box
            x={236}
            y={352}
            w={168}
            h={52}
            title='TURN server'
            sub='optional'
          />

          {/* Legend for the dashed lines, clear of every path. */}
          <g transform='translate(24 30)'>
            <line
              x1={0}
              y1={-4}
              x2={22}
              y2={-4}
              stroke='var(--sky)'
              strokeWidth={1.5}
              strokeDasharray='4 6'
            />
            <text x={30} y={0} fontSize={12} fill='var(--sky)'>
              signaling: find each other
            </text>
          </g>

          {route !== "direct" && <Blocked x={300} y={236} />}
          {route === "relay" && <Blocked x={470} y={366} />}

          <g
            transform={`translate(${BADGE[route].x} ${BADGE[route].y})`}
            style={{ transition: "transform 300ms var(--ease-out)" }}
          >
            <rect
              x={-74}
              y={-11}
              width={148}
              height={22}
              rx={11}
              fill='var(--popover)'
              stroke={active.color}
              strokeOpacity={0.6}
            />
            <text
              y={4.5}
              textAnchor='middle'
              fontSize={11.5}
              fontWeight={600}
              fill={active.color}
            >
              end-to-end encrypted
            </text>
          </g>
        </svg>
      </div>

      <figcaption className='mt-3 text-sm' aria-live='polite'>
        <span className='font-medium' style={{ color: active.color }}>
          {active.label}.
        </span>{" "}
        {active.caption}
      </figcaption>
    </figure>
  )
}
