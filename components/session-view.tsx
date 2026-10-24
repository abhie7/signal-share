"use client"

import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import {
  Alert02Icon,
  ComputerScreenShareIcon,
  File01Icon,
  LockIcon,
  Notification03Icon,
  PauseIcon,
  PlayIcon,
  QrCodeIcon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { AnimatePresence, motion } from "framer-motion"
import { Btn, CopyButton, Progress, Spinner } from "@/components/ui-kit"
import { Avatar, Glass, Morph, SignalBridge } from "@/components/brand"
import { ScreenStage, SharerPreview } from "@/components/screen-stage"
import { TextResult } from "@/components/text-result"
import { ReceivedFiles } from "@/components/received-files"
import {
  cancel,
  enableNotify,
  invite,
  reset,
  retry,
  setExpiry,
  setTransferPaused,
  shareLink,
} from "@/lib/controller"
import { useConnection, useShare, type ShareState } from "@/lib/store"
import { TERMINAL, type Phase } from "@/lib/machine"
import { EXPIRY_MINUTES } from "@/lib/protocol"
import { cn, formatBytes, formatDuration } from "@/lib/utils"
import { useClientValue } from "@/lib/use-client-value"
import { usePairs } from "@/lib/pairing"
import { DEVICE_LABEL } from "@/lib/device"
import { DeviceIcon } from "@/components/device-icon"
import { WakeButton, pairLabel } from "@/components/my-devices"
import { InfoTip } from "@/components/info-tip"

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
    waiting: s.answering
      ? {
          title: `Waiting for ${s.answering} to accept…`,
          sub:
            s.kind === "screen"
              ? "Nothing is visible until they accept. You can stop any time."
              : "They see what you’re sending before anything moves.",
        }
      : {
          title:
            s.kind === "screen"
              ? "Ready to share your screen"
              : "Ready to send",
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
        : s.kind === "text"
          ? `From ${peer}. Verified intact.`
          : `From ${peer}. Every file passed its integrity check.`,
    },
    ended: { title: "Screen sharing ended" },
    cancelled: { title: "Share cancelled" },
    failed: { title: s.error?.title ?? "Something went wrong" },
  }
  return map[s.phase]
}

/** "42% · SignalShare" in the tab while a transfer runs, so a background tab shows progress. */
function useTabTitle(s: ShareState) {
  const moving =
    s.kind !== "screen" &&
    (s.phase === "transferring" ||
      (s.phase === "reconnecting" && s.doneBytes > 0))
  const pct = s.totalBytes ? Math.floor((s.doneBytes / s.totalBytes) * 100) : 0
  const title = moving
    ? `${s.pausedBy ? "Paused" : `${pct}%`} · SignalShare`
    : s.phase === "completed"
      ? "Done · SignalShare"
      : s.phase === "failed"
        ? "Stopped · SignalShare"
        : null
  useEffect(() => {
    if (!title) return
    const before = document.title
    document.title = title
    return () => {
      document.title = before
    }
  }, [title])
}

export function SessionView() {
  const s = useShare()
  const { title, sub } = headline(s)
  const terminal = TERMINAL.has(s.phase)
  useTabTitle(s)

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
              {s.phase === "waiting" && !s.answering && <WaitingPanel />}
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
          <span className='flex flex-wrap items-center gap-2'>
            <PathBadge />
            <SecurityBadge />
          </span>
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
                  : s.phase === "waiting"
                    ? "Revoke link"
                    : "Cancel"}
              </Btn>
            )}
          </div>
        </footer>
      </Glass>
      {terminal && s.session && <ServerSaw />}
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
  const paired = usePairs((s) => s.online)
  const nearby = useConnection((s) => s.nearby).filter(
    (p) => !paired.some((o) => o.peerId === p.id), // already listed as "Your …"
  )
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const link = shareLink() ?? ""
  const minutes = useCountdown(session.expiresAt)
  const [expiry, setExpiryChoice] = useState<number>(30)
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
        <p className='mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground'>
          Works once · stays open for
          <select
            aria-label='How long the share stays open if nobody joins'
            value={expiry}
            onChange={(e) => {
              setExpiryChoice(Number(e.target.value))
              void setExpiry(Number(e.target.value))
            }}
            className='rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-teal/40'
          >
            {EXPIRY_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : m === 60 ? "1 hour" : "24 hours"}
              </option>
            ))}
          </select>
          {minutes !== null &&
            ` · ${minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`} left`}
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

      <PairedTargets />

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
                  <span className='text-xs text-muted-foreground'>
                    {DEVICE_LABEL[p.device ?? "other"]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** "Send to my iPhone": paired devices, online ones one tap away. */
function PairedTargets() {
  const pairs = usePairs((s) => s.pairs).filter((p) => p.device)
  const online = usePairs((s) => s.online)
  if (!pairs.length) return null
  return (
    <div>
      <p className='eyebrow'>Send to your devices</p>
      <ul className='mt-2 flex flex-wrap gap-2'>
        {pairs.map((p) => {
          const here = online.find((o) => o.pairId === p.id)
          return (
            <li key={p.id} className='flex items-center gap-1'>
              <button
                type='button'
                disabled={!here}
                onClick={() => here && invite(here.peerId, p.id)}
                className='pressable flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-2.5 pr-3 text-sm backdrop-blur hover:border-teal/60 disabled:opacity-50'
              >
                <DeviceIcon device={p.device} className='size-4 text-sky' />
                {pairLabel(p)}
                {!here && (
                  <span className='text-xs text-muted-foreground'>offline</span>
                )}
              </button>
              {!here && <WakeButton pair={p} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TransferPanel() {
  const s = useShare()
  const pct = s.totalBytes ? s.doneBytes / s.totalBytes : 0
  const eta = s.speed > 0 ? (s.totalBytes - s.doneBytes) / s.speed : 0
  const paused = s.pausedBy !== null
  const mine = s.pausedBy === "you"
  const running = s.phase === "transferring" && !paused
  return (
    <div>
      <div className='flex items-baseline justify-between gap-3 text-sm'>
        <span className='font-medium tabular-nums'>
          {Math.floor(pct * 100)}%
        </span>
        <span className='tabular-nums text-muted-foreground'>
          {formatBytes(s.doneBytes)} of {formatBytes(s.totalBytes)}
          {running && s.speed > 0 && ` · ${formatBytes(s.speed)}/s`}
          {running && eta > 1 && ` · ${formatDuration(eta)} left`}
        </span>
      </div>
      <div className='mt-2'>
        <Progress value={pct} label='Transfer progress' />
      </div>
      <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
        <span className='text-sm text-muted-foreground' role='status'>
          {paused &&
            (s.pausedBy === "you"
              ? "Paused by you"
              : `Paused by ${s.pausedBy}`)}
        </span>
        <span className='flex flex-wrap gap-2'>
          <NotifyButton startedAt={s.startedAt} />
          {s.phase === "transferring" && (
            // Each side resumes only its own pause.
            <Btn size='sm' onClick={() => setTransferPaused(!mine)}>
              <Icon icon={mine ? PlayIcon : PauseIcon} className='size-4' />
              {mine ? "Resume" : "Pause"}
            </Btn>
          )}
        </span>
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

/** Offered once a transfer has run for a while: long enough that someone may switch tabs. */
function NotifyButton({ startedAt }: { startedAt: number | null }) {
  const notify = useShare((s) => s.notify)
  const [due, setDue] = useState(false)
  useEffect(() => {
    if (!startedAt) return
    const t = setTimeout(
      () => setDue(true),
      Math.max(0, startedAt + 10_000 - Date.now()),
    )
    return () => clearTimeout(t)
  }, [startedAt])
  const supported = useClientValue(
    () =>
      typeof Notification !== "undefined" &&
      Notification.permission !== "denied",
    false,
  )
  if (!due || !supported) return null
  if (notify)
    return (
      <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
        <Icon icon={Notification03Icon} className='size-3.5' /> We’ll notify you
      </span>
    )
  return (
    <Btn size='sm' variant='ghost' onClick={() => void enableNotify()}>
      <Icon icon={Notification03Icon} className='size-4' /> Notify me when done
    </Btn>
  )
}

function CompletedPanel() {
  const s = useShare()
  // Stable across re-renders: previews are rebuilt (and their URLs revoked) when this changes.
  const originals = useMemo(() => s.files.map((f) => f.name), [s.files])
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
  if (s.kind === "text")
    return <TextResult text={s.text ?? ""} type={s.files[0]?.type ?? ""} />
  return (
    <ReceivedFiles
      items={s.received}
      originals={originals}
      from={s.peerName ?? "the sender"}
      saved={s.savedToDisk}
    />
  )
}

/** How the keys were checked, as a compact chip; the explanation is in its tooltip. */
function SecurityBadge() {
  const security = useShare((s) => s.security)
  const phase = useShare((s) => s.phase)
  if (!security || phase === "failed") return null
  const sas = security.mode === "sas"
  return (
    <InfoTip
      side='top'
      align='start'
      trigger={
        <span
          className='flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground'
          aria-label={
            sas
              ? `Security code ${security.sas.split("").join(" ")}`
              : "Keys verified"
          }
        >
          <Icon icon={LockIcon} className='size-3.5 text-teal' />
          {sas ? (
            <span className='font-mono font-semibold tracking-[0.15em] text-foreground'>
              {security.sas}
            </span>
          ) : (
            "Verified"
          )}
        </span>
      }
    >
      {sas ? (
        <>
          <span className='font-medium text-foreground'>Security code.</span> If
          the other screen shows {security.sas} too, nobody is in the middle.
          Codes and nearby invites can’t be checked automatically, so this is
          how you check.
        </>
      ) : (
        <>
          <span className='font-medium text-foreground'>
            {security.mode === "pair"
              ? "Keys verified with your device pairing."
              : "Keys verified with the link’s secret."}
          </span>{" "}
          Not even the SignalShare server can read or swap what you share.
        </>
      )}
    </InfoTip>
  )
}

function ServerSaw() {
  const [open, setOpen] = useState(false)
  const s = useShare()
  const contents = {
    files: "the files’ contents",
    text: "the text",
    screen: "your screen",
  }[s.kind ?? "files"]
  const saw =
    s.kind === "screen"
      ? "That a screen share started"
      : s.kind === "text"
        ? "The size of the text"
        : `${s.files.length === 1 ? "The file’s name" : `${s.files.length} file names`} and ${s.files.length === 1 ? "size" : "sizes"}`
  const route = {
    direct:
      "The data went straight between the two devices. It never passed through a SignalShare server.",
    turn: "The data passed through a TURN relay as encrypted packets it can’t read.",
    relay:
      "The data passed through the SignalShare relay as ciphertext. Nothing was written to disk.",
  }
  const rows: Array<[string, string]> = [
    [
      "Saw",
      `${saw}, both device names, the code, and your IP addresses (used to connect you and find nearby devices, never stored).`,
    ],
    [
      "Never saw",
      `${contents[0].toUpperCase()}${contents.slice(1)}. It was encrypted end to end on your devices${s.security?.mode === "link" ? ", with keys checked against the link’s secret, which never reaches the server" : s.security?.mode === "pair" ? ", with keys checked against your device pairing, which never reaches the server" : ""}.`,
    ],
    ["Route", s.path ? route[s.path] : "No data was exchanged."],
    [
      "Deleted",
      `The share left server memory${s.endedAt ? ` at ${new Date(s.endedAt).toLocaleTimeString()}` : ""}. Production logs keep only warnings and errors, never names or contents.`,
    ],
  ]
  return (
    <div className='mt-3 px-1'>
      <button
        type='button'
        className='text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        What the server saw
      </button>
      <div className='disclosure' data-open={open}>
        <div>
          <dl className='liquid mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 !rounded-2xl p-3 text-xs'>
            {rows.map(([k, v]) => (
              <div key={k} className='contents'>
                <dt className='font-medium text-muted-foreground'>{k}</dt>
                <dd className='leading-relaxed'>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
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
