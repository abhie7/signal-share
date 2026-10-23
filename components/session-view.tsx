"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import {
  Alert02Icon,
  ComputerScreenShareIcon,
  Download04Icon,
  File01Icon,
  LockIcon,
  QrCodeIcon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { AnimatePresence, motion } from "framer-motion"
import { Btn, CopyButton, Progress, Spinner } from "@/components/ui-kit"
import { Avatar, Glass, Morph, SignalBridge } from "@/components/brand"
import { ScreenStage, SharerPreview } from "@/components/screen-stage"
import {
  cancel,
  downloadItem,
  invite,
  reset,
  retry,
  shareLink,
} from "@/lib/controller"
import { useConnection, useShare, type ShareState } from "@/lib/store"
import { TERMINAL, type Phase } from "@/lib/machine"
import { cn, formatBytes, formatDuration } from "@/lib/utils"

const KIND_ICON = {
  files: File01Icon,
  text: TextIcon,
  screen: ComputerScreenShareIcon,
} as const
const KIND_COLOR = {
  files: "var(--teal)",
  text: "var(--violet)",
  screen: "var(--coral)",
} as const

function headline(s: ShareState): { title: string; sub?: string } {
  const peer =
    s.peerName ?? (s.role === "sender" ? "the recipient" : "the sender")
  const what =
    s.kind === "screen"
      ? "screen"
      : s.kind === "text"
        ? "text"
        : s.files.length === 1
          ? s.files[0].name
          : `${s.files.length} files`
  const sending = s.role === "sender"
  const map: Record<Phase, { title: string; sub?: string }> = {
    idle: { title: "" },
    preparing: { title: "Preparing…" },
    requesting_permission: {
      title: "Choose what to share",
      sub: "Pick a window, tab or screen in your browser’s dialog.",
    },
    creating: { title: "Creating your share…" },
    waiting: {
      title:
        s.kind === "screen" ? "Ready to share your screen" : "Ready to send",
      sub:
        s.kind === "screen"
          ? "Nobody can see your screen until a viewer joins."
          : "Open the link or enter the code on the other device.",
    },
    joining: { title: "Joining share…" },
    connecting: {
      title: `Connecting to ${peer}…`,
      sub: "Finding the fastest route between your devices.",
    },
    negotiating: {
      title:
        s.kind === "screen"
          ? sending
            ? "Starting the stream…"
            : "Waiting for the picture…"
          : "Securing the connection…",
    },
    transferring: {
      title: sending ? `Sending ${what}` : `Receiving ${what}`,
      sub: sending ? `to ${peer}` : `from ${peer}`,
    },
    streaming: {
      title: sending ? "You’re sharing your screen" : `${peer}’s screen`,
      sub: sending ? `${s.peerName ?? "The viewer"} is watching.` : undefined,
    },
    reconnecting: { title: "Reconnecting…" },
    completed: {
      title: sending
        ? "Sent"
        : s.kind === "text"
          ? "Text received"
          : "Received",
      sub: sending
        ? `Delivered to ${peer} and verified.`
        : `From ${peer}. Every file passed its integrity check.`,
    },
    ended: { title: "Screen sharing ended" },
    cancelled: { title: "Share cancelled" },
    failed: { title: s.error?.title ?? "Something went wrong" },
  }
  return map[s.phase]
}

export function SessionView() {
  const s = useShare()
  const { title, sub } = headline(s)
  const terminal = TERMINAL.has(s.phase)

  if (
    s.kind === "screen" &&
    s.role === "receiver" &&
    (s.phase === "streaming" ||
      s.phase === "negotiating" ||
      (s.phase === "reconnecting" && s.remoteStream))
  ) {
    return <ScreenStage />
  }

  return (
    <div className='mx-auto w-full max-w-xl px-4 pb-10 pt-8 sm:pt-14'>
      <Glass
        as='section'
        className='enter overflow-hidden'
        aria-labelledby='session-title'
      >
        <Morph>
          <div className='p-5 sm:p-7'>
            <div className='flex items-start gap-4'>
              <PhaseGlyph phase={s.phase} kind={s.kind} />
              <div className='min-w-0 flex-1' aria-live='polite'>
                <AnimatePresence mode='popLayout' initial={false}>
                  <motion.div
                    key={title + (s.note ?? sub ?? "")}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  >
                    <h1 id='session-title' className='title break-words'>
                      {title}
                    </h1>
                    {(s.note || sub) && (
                      <p className='mt-1 text-sm text-muted-foreground'>
                        {s.note ?? sub}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {s.role && s.kind && !terminal && (
              <Steps phase={s.phase} role={s.role} kind={s.kind} />
            )}

            <div className='mt-6'>
              <Bridge />
              {s.phase === "waiting" && <WaitingPanel />}
              {s.kind === "screen" &&
                s.role === "sender" &&
                s.localStream &&
                !terminal && <SharerPreview />}
              {(s.phase === "transferring" ||
                (s.phase === "reconnecting" && s.doneBytes > 0)) &&
                s.kind !== "screen" && <TransferPanel />}
              {s.phase === "completed" && <CompletedPanel />}
              {s.phase === "failed" && <FailedPanel />}
              {(s.phase === "connecting" ||
                s.phase === "reconnecting" ||
                s.phase === "negotiating") &&
                s.peerName &&
                !s.peerOnline && (
                  <p
                    className='flex items-center gap-2 text-sm text-warning'
                    role='status'
                  >
                    <Icon icon={Alert02Icon} className='size-4' /> {s.peerName}{" "}
                    is offline : waiting for it to come back.
                  </p>
                )}
            </div>
          </div>
        </Morph>
        <footer className='flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 sm:px-7'>
          <PathBadge />
          <div className='ml-auto flex gap-2'>
            {terminal ? (
              <>
                {s.phase === "failed" && s.error?.retryable && (
                  <Btn variant='primary' onClick={retry}>
                    Try again
                  </Btn>
                )}
                {(s.phase === "ended" || s.phase === "cancelled") &&
                  s.role === "sender" && <Btn onClick={retry}>Share again</Btn>}
                <Btn
                  variant={s.phase === "completed" ? "primary" : "secondary"}
                  onClick={reset}
                >
                  Done
                </Btn>
              </>
            ) : (
              <Btn variant='danger' onClick={cancel}>
                {s.kind === "screen" && s.role === "sender"
                  ? "Stop sharing"
                  : "Cancel"}
              </Btn>
            )}
          </div>
        </footer>
      </Glass>
      {s.attempts.length > 0 || s.phase === "failed" ? <Diagnostics /> : null}
    </div>
  )
}

function PhaseGlyph({
  phase,
  kind,
}: {
  phase: Phase
  kind: ShareState["kind"]
}) {
  if (phase === "completed")
    return (
      <span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-mint/15 text-mint'>
        <svg
          viewBox='0 0 24 24'
          className='check-draw size-6'
          fill='none'
          stroke='currentColor'
          strokeWidth='2.4'
          strokeLinecap='round'
          strokeLinejoin='round'
        >
          <path d='M5 12.5l4.5 4.5L19 7.5' />
        </svg>
      </span>
    )
  if (phase === "failed")
    return (
      <span className='grid size-12 shrink-0 place-items-center rounded-2xl bg-coral/15 text-coral'>
        <Icon icon={Alert02Icon} />
      </span>
    )
  const busy =
    phase === "creating" ||
    phase === "joining" ||
    phase === "connecting" ||
    phase === "negotiating" ||
    phase === "reconnecting" ||
    phase === "requesting_permission"
  const color = KIND_COLOR[kind ?? "files"]
  const muted = phase === "cancelled" || phase === "ended"
  return (
    <span
      className='grid size-12 shrink-0 place-items-center rounded-2xl'
      style={
        muted
          ? { background: "var(--surface-2)", color: "var(--muted-foreground)" }
          : {
              background: `color-mix(in oklch, ${color} 15%, transparent)`,
              color,
            }
      }
    >
      {busy ? (
        <Spinner className='size-5 border-[2.5px]' />
      ) : (
        <Icon icon={KIND_ICON[kind ?? "files"]} />
      )}
    </span>
  )
}

function Steps({
  phase,
  role,
  kind,
}: {
  phase: Phase
  role: "sender" | "receiver"
  kind: NonNullable<ShareState["kind"]>
}) {
  const screen = kind === "screen"
  const labels =
    role === "sender"
      ? screen
        ? ["Waiting for viewer", "Connecting", "Live"]
        : ["Waiting", "Connecting", "Sending", "Done"]
      : screen
        ? ["Joining", "Connecting", "Watching"]
        : ["Joining", "Connecting", "Receiving", "Done"]
  const index: Partial<Record<Phase, number>> = {
    requesting_permission: 0,
    creating: 0,
    waiting: 0,
    joining: 0,
    connecting: 1,
    negotiating: 1,
    reconnecting: 1,
    transferring: 2,
    streaming: 2,
  }
  const current = index[phase] ?? 0
  return (
    <ol className='mt-6 flex items-center gap-2' aria-label='Progress'>
      {labels.map((label, i) => (
        <li
          key={label}
          className='flex min-w-0 flex-1 flex-col gap-1.5'
          aria-current={i === current ? "step" : undefined}
        >
          <span className='relative h-1 overflow-hidden rounded-full bg-surface-2'>
            <span
              className={cn(
                "progress-fill absolute inset-0 origin-left rounded-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]",
                i < current ? "scale-x-100" : "scale-x-0",
              )}
            />
            {i === current && (
              <span className='sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-teal/70' />
            )}
          </span>
          <span
            className={cn(
              "truncate text-xs",
              i <= current ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function useCountdown(until: number | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])
  return until ? Math.max(0, Math.round((until - now) / 60_000)) : null
}

function WaitingPanel() {
  const session = useShare((s) => s.session)!
  const nearby = useConnection((s) => s.nearby)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const link = shareLink() ?? ""
  const minutes = useCountdown(session.expiresAt)
  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator

  useEffect(() => {
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: 440, errorCorrectionLevel: "M" })
      .then((url) => live && setQr(url))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [link])

  return (
    <div className='space-y-5'>
      <div className='well rounded-3xl p-5 text-center'>
        <p className='eyebrow'>Code</p>
        <div className='mt-2 flex items-center justify-center gap-3'>
          <p
            className='px-2 font-mono text-[2.5rem] font-semibold leading-none tracking-[0.16em] tabular-nums'
            aria-label={`Code ${session.code.split("").join(" ")}`}
          >
            {session.code.slice(0, 3)}
            <span className='text-muted-foreground/40'>·</span>
            {session.code.slice(3)}
          </p>
          <CopyButton value={session.code} label='Copy' />
        </div>
        <p className='mt-3 text-xs text-muted-foreground'>
          Works once
          {minutes !== null ? ` · expires in ${minutes} min if unused` : ""}
        </p>
      </div>

      <div>
        <label htmlFor='share-link' className='eyebrow'>
          Link
        </label>
        <div className='mt-1.5 flex items-center gap-2'>
          <input
            id='share-link'
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className='well h-10 min-w-0 flex-1 rounded-full px-4 font-mono text-[13px] text-muted-foreground outline-none focus:border-primary/60'
          />
          <CopyButton value={link} size='md' />
        </div>
        <div className='mt-2 flex flex-wrap gap-2'>
          <Btn
            size='sm'
            variant='ghost'
            onClick={() => setShowQr((v) => !v)}
            aria-expanded={showQr}
          >
            <Icon icon={QrCodeIcon} className='size-4' />{" "}
            {showQr ? "Hide QR code" : "Show QR code"}
          </Btn>
          {canNativeShare && (
            <Btn
              size='sm'
              variant='ghost'
              onClick={() =>
                navigator
                  .share({ title: "SignalShare", url: link })
                  .catch(() => {})
              }
            >
              Share link…
            </Btn>
          )}
        </div>
        <div className='disclosure' data-open={showQr}>
          <div>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt='QR code for the share link'
                className='mx-auto mt-3 size-52 rounded-xl bg-white p-2'
              />
            )}
          </div>
        </div>
      </div>

      {nearby.length > 0 && (
        <div>
          <p className='eyebrow'>Send to a device on your network</p>
          <ul className='mt-2 flex flex-wrap gap-2'>
            {nearby.slice(0, 8).map((p) => (
              <li key={p.id}>
                <button
                  type='button'
                  onClick={() => invite(p.id)}
                  className='pressable flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm backdrop-blur hover:border-teal/60'
                >
                  <Avatar name={p.name} className='size-7' />
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TransferPanel() {
  const s = useShare()
  const pct = s.totalBytes ? s.doneBytes / s.totalBytes : 0
  const eta = s.speed > 0 ? (s.totalBytes - s.doneBytes) / s.speed : 0
  return (
    <div>
      <div className='flex items-baseline justify-between gap-3 text-sm'>
        <span className='font-medium tabular-nums'>
          {Math.floor(pct * 100)}%
        </span>
        <span className='tabular-nums text-muted-foreground'>
          {formatBytes(s.doneBytes)} of {formatBytes(s.totalBytes)}
          {s.phase === "transferring" &&
            s.speed > 0 &&
            ` · ${formatBytes(s.speed)}/s`}
          {s.phase === "transferring" &&
            eta > 1 &&
            ` · ${formatDuration(eta)} left`}
        </span>
      </div>
      <div className='mt-2'>
        <Progress value={pct} label='Transfer progress' />
      </div>
      {s.kind === "files" && s.files.length > 1 && (
        <ul className='mt-4 max-h-48 space-y-1.5 overflow-auto text-sm'>
          {s.files.map((f, i) => {
            const before = s.files.slice(0, i).reduce((n, x) => n + x.size, 0)
            const done = s.doneBytes >= before + f.size
            return (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-2",
                  done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full transition-colors duration-300",
                    done ? "bg-mint" : "bg-border",
                  )}
                  aria-hidden
                />
                <span className='min-w-0 flex-1 truncate'>{f.name}</span>
                <span className='tabular-nums'>{formatBytes(f.size)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CompletedPanel() {
  const s = useShare()
  if (s.role === "sender") {
    return (
      <p className='text-sm text-muted-foreground'>
        {s.kind === "text"
          ? "Your text"
          : `${s.files.length} ${s.files.length === 1 ? "file" : "files"} (${formatBytes(s.totalBytes)})`}{" "}
        arrived intact.
      </p>
    )
  }
  if (s.kind === "text") {
    return (
      <div>
        <pre className='max-h-72 overflow-auto whitespace-pre-wrap break-words well rounded-2xl p-4 font-sans text-[15px] leading-relaxed'>
          {s.text ?? ""}
        </pre>
        <div className='mt-3 flex justify-end'>
          <CopyButton value={s.text ?? ""} size='md' label='Copy text' />
        </div>
      </div>
    )
  }
  return (
    <div>
      <ul className='well divide-y divide-border rounded-2xl'>
        {s.received.map((item) => (
          <li
            key={item.url}
            className='flex items-center gap-3 px-3 py-2.5 text-sm'
          >
            <Icon icon={File01Icon} className='size-4 text-teal' />
            <span className='min-w-0 flex-1 truncate'>{item.name}</span>
            <span className='tabular-nums text-muted-foreground'>
              {formatBytes(item.size)}
            </span>
            <Btn
              size='sm'
              onClick={() => downloadItem(item)}
              aria-label={`Save ${item.name}`}
            >
              <Icon icon={Download04Icon} className='size-4' /> Save
            </Btn>
          </li>
        ))}
      </ul>
      {s.received.length > 1 && (
        <div className='mt-3 flex justify-end'>
          <Btn
            variant='primary'
            onClick={async () => {
              for (const item of s.received) {
                downloadItem(item)
                await new Promise((r) => setTimeout(r, 350)) // browsers drop rapid-fire downloads
              }
            }}
          >
            Save all
          </Btn>
        </div>
      )}
      <p className='mt-3 text-xs text-muted-foreground'>
        Files stay in this tab until you close it or press Done.
      </p>
    </div>
  )
}

function FailedPanel() {
  const error = useShare((s) => s.error)
  if (!error) return null
  return (
    <p className='text-sm leading-relaxed text-muted-foreground'>
      {error.detail}
    </p>
  )
}

function PathBadge() {
  const path = useShare((s) => s.path)
  const phase = useShare((s) => s.phase)
  if (!path || phase === "failed")
    return (
      <span className='text-xs text-muted-foreground'>
        Encrypted end to end
      </span>
    )
  const label = {
    direct: "Direct connection",
    turn: "Via TURN relay",
    relay: "Via encrypted relay",
  }[path]
  return (
    <span
      className='flex items-center gap-1.5 text-xs text-muted-foreground'
      title='Only the two devices can read what is shared.'
    >
      <Icon icon={LockIcon} className='size-3.5 text-teal' />
      {label} · encrypted end to end
    </span>
  )
}

function Diagnostics() {
  const [open, setOpen] = useState(false)
  const s = useShare()
  const conn = useConnection()
  const rows: Array<[string, string]> = [
    ["Server connection", conn.status],
    ["Route in use", s.path ?? ":"],
    ["TURN relay configured", conn.turn ? "yes" : "no"],
    ["Encrypted relay available", conn.relay ? "yes" : "no"],
    ["Reference", s.session?.logId ?? ":"],
  ]
  return (
    <div className='mt-3 px-1'>
      <button
        type='button'
        className='text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide" : "Show"} connection details
      </button>
      <div className='disclosure' data-open={open}>
        <div>
          <dl className='liquid mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 !rounded-2xl p-3 text-xs'>
            {rows.map(([k, v]) => (
              <div key={k} className='contents'>
                <dt className='text-muted-foreground'>{k}</dt>
                <dd className='font-mono'>{v}</dd>
              </div>
            ))}
            {s.attempts.map((a, i) => (
              <div key={i} className='contents'>
                <dt className='text-muted-foreground'>Attempt {i + 1}</dt>
                <dd className='font-mono'>
                  {a.transport} · {a.ok ? "ok" : a.reason} · {Math.round(a.ms)}{" "}
                  ms
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

/** Who is connected to whom, with data visibly flowing during the transfer. */
function Bridge() {
  const s = useShare()
  const me = useConnection((c) => c.name) || "This device"
  if (
    !s.peerName ||
    s.phase === "waiting" ||
    (s.kind === "screen" && s.role === "sender" && s.phase !== "connecting")
  )
    return null
  const state =
    s.phase === "completed" || s.phase === "streaming"
      ? "done"
      : s.phase === "failed" || s.phase === "cancelled" || !s.peerOnline
        ? "broken"
        : s.phase === "transferring"
          ? "flowing"
          : "searching"
  const [left, right] =
    s.role === "sender" ? [me, s.peerName] : [s.peerName, me]
  return (
    <div className='mb-6'>
      <SignalBridge left={left} right={right} state={state} />
    </div>
  )
}
