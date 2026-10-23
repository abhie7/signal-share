import { toast } from "sonner"
import { signaling, newId, safeStorage, SignalingError } from "./signaling"
import type {
  FileMeta,
  ServerMessage,
  SessionView,
  ShareKind,
  SignalData,
} from "./protocol"
import {
  initialShare,
  patchShare,
  setPhase,
  useConnection,
  useShare,
  type ShareError,
} from "./store"
import { TERMINAL, isActive } from "./machine"
import { FileSender } from "./transfer/sender"
import { FileReceiver } from "./transfer/receiver"
import {
  NoPathError,
  offerPath,
  parseConnectRequest,
  requestPath,
  type Attempt,
} from "./transfer/connect"
import { PathError, Peer } from "./transfer/rtc"
import type { Pipe } from "./transfer/pipe"
import { historyDB } from "./db/history"
import {
  playError,
  playPeerDiscovered,
  playTransferComplete,
  playTransferStart,
} from "./sounds"
import { safeFileName } from "./utils"

// Owns the lifecycle of the one active share. UI components call these functions and render
// from the store; they never touch sockets, peer connections or timers themselves.

interface Op {
  abort: AbortController
  cleanups: Array<() => void>
  session: SessionView | null
  attached: boolean
  pipe: Pipe | null
  sender: FileSender | null
  receiver: FileReceiver | null
  attempt: number
  attemptAbort: AbortController | null
  waitTimer: ReturnType<typeof setTimeout> | null
  sessionLost: boolean
  // screen
  peer: Peer | null
  stream: MediaStream | null
}

let op: Op | null = null
let lastAction: (() => void) | null = null
const RECEIVER_RETRY_MS = [1000, 2000, 4000, 8000, 8000]
const SENDER_WAIT_MS = 60_000
const SEAT_KEY = (id: string) => `signalshare-seat:${id}`

// ── Bootstrap ────────────────────────────────────────────────────────────────

let booted = false

/** Idempotent; safe under React StrictMode double-mount. */
export function boot() {
  if (booted || typeof window === "undefined") return
  booted = true

  signaling.onStatus((status) => useConnection.setState({ status }))
  let welcomed = false
  signaling.on("welcome", (w) => {
    useConnection.setState({
      name: w.name,
      peerId: w.peerId,
      relay: w.relay,
      turn: w.turn,
    })
    if (welcomed) void resumeAfterReconnect()
    welcomed = true
  })
  signaling.on("presence", (m) => {
    const before = new Set(useConnection.getState().nearby.map((p) => p.id))
    if (m.peers.some((p) => !before.has(p.id)) && before.size < m.peers.length)
      playPeerDiscovered()
    useConnection.setState({ nearby: m.peers })
  })
  signaling.on("invite", (m) => {
    if (isActive(useShare.getState().phase)) return // busy: ignore unsolicited prompts
    useConnection.setState({
      invite: {
        sessionId: m.sessionId,
        from: m.from,
        kind: m.kind,
        files: m.files,
        totalSize: m.totalSize,
      },
    })
  })

  window.addEventListener("beforeunload", (e) => {
    const { phase } = useShare.getState()
    if (
      phase === "transferring" ||
      phase === "reconnecting" ||
      phase === "streaming"
    )
      e.preventDefault()
  })
  // A closing tab ends its share at once instead of leaving the other side waiting out the grace period.
  window.addEventListener("pagehide", () => {
    const s = op?.session
    if (s && isActive(useShare.getState().phase)) {
      navigator.sendBeacon(
        `/api/sessions/${s.sessionId}/leave`,
        new Blob([JSON.stringify({ token: s.token })], { type: "text/plain" }),
      )
    }
  })

  signaling.start()
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function begin(): Op | null {
  if (op && isActive(useShare.getState().phase)) return null // one share at a time; ignore double clicks
  teardown()
  revokeUrls()
  useShare.setState({ ...initialShare })
  op = {
    abort: new AbortController(),
    cleanups: [],
    session: null,
    attached: false,
    pipe: null,
    sender: null,
    receiver: null,
    attempt: 0,
    attemptAbort: null,
    waitTimer: null,
    sessionLost: false,
    peer: null,
    stream: null,
  }
  return op
}

function teardown() {
  const o = op
  if (!o) return
  op = null
  o.abort.abort()
  o.attemptAbort?.abort()
  if (o.waitTimer) clearTimeout(o.waitTimer)
  for (const fn of o.cleanups.splice(0)) fn()
  o.sender?.detach()
  o.receiver?.detach()
  o.pipe?.close()
  o.peer?.close()
  o.stream?.getTracks().forEach((t) => {
    t.onended = null
    t.stop()
  })
}

function revokeUrls() {
  for (const item of useShare.getState().received) URL.revokeObjectURL(item.url)
}

function leave(o: Op, failed = false) {
  const s = o.session
  if (!s) return
  safeStorage(() => sessionStorage.removeItem(SEAT_KEY(s.sessionId)))
  signaling
    .request(
      {
        type: "session.leave",
        id: newId(),
        sessionId: s.sessionId,
        token: s.token,
        failed,
      },
      5000,
    )
    .catch(() => {})
}

function fail(o: Op, error: ShareError) {
  if (op !== o || TERMINAL.has(useShare.getState().phase)) return
  playError()
  signaling.telemetry("share.failed", {
    code: error.code,
    kind: useShare.getState().kind ?? "unknown",
    role: useShare.getState().role ?? "unknown",
  })
  leave(o, true)
  setPhase("failed", { error, note: null })
  teardown()
}

function errorFrom(err: unknown): ShareError {
  if (err instanceof SignalingError) {
    switch (err.code) {
      case "INVALID_CODE":
        return {
          code: err.code,
          title: "Code not found",
          detail:
            "Check the code and try again. Codes work once and expire after 30 minutes.",
          retryable: false,
        }
      case "SESSION_NOT_FOUND":
        return {
          code: err.code,
          title: "This share has ended",
          detail:
            "The sender stopped sharing or the link expired. Ask them for a new link.",
          retryable: false,
        }
      case "SESSION_FULL":
        return {
          code: err.code,
          title: "Already claimed",
          detail:
            "Another device already joined this share. Ask the sender to share again.",
          retryable: false,
        }
      case "RATE_LIMITED":
        return {
          code: err.code,
          title: "Too many attempts",
          detail: err.message,
          retryable: true,
        }
      case "TIMEOUT":
        return {
          code: err.code,
          title: "Can’t reach SignalShare",
          detail:
            "Your device couldn’t reach the server. Check your internet connection and try again.",
          retryable: true,
        }
      default:
        return {
          code: err.code,
          title: "Something went wrong",
          detail: err.message,
          retryable: true,
        }
    }
  }
  return {
    code: "INTERNAL",
    title: "Something went wrong",
    detail: err instanceof Error ? err.message : String(err),
    retryable: true,
  }
}

const REASON_TEXT: Record<string, string> = {
  "ice-failed": "a direct connection was blocked by a firewall or NAT",
  "ice-timeout": "a direct connection timed out",
  "channel-timeout": "the direct channel never opened",
  "verify-timeout": "the path connected but did not carry data",
  "relay-disabled": "the relay is turned off on this server",
  "relay-rejected": "the relay refused the connection",
  "relay-timeout": "the relay could not be reached",
  "peer-timeout": "the other device stopped responding",
  "webrtc-unsupported": "this browser does not support WebRTC",
}

function noPathError(attempts: Attempt[], reason: string): ShareError {
  const tried = attempts
    .filter((a) => !a.ok)
    .map((a) => REASON_TEXT[a.reason ?? ""] ?? a.reason)
  const why = tried.length ? tried.join("; ") : (REASON_TEXT[reason] ?? reason)
  return {
    code: "NO_PATH",
    title: "Couldn’t connect the devices",
    detail: `SignalShare tried every available route: ${why}. Try another network, or ask the operator to configure a TURN server.`,
    retryable: true,
  }
}

function throttledProgress() {
  let lastAt = 0
  let lastBytes = 0
  let speed = 0
  return (done: number, total: number) => {
    const now = performance.now()
    if (done < total && now - lastAt < 100) return
    if (lastAt && now > lastAt)
      speed = speed * 0.7 + ((done - lastBytes) / (now - lastAt)) * 1000 * 0.3
    lastAt = now
    lastBytes = done
    patchShare({
      doneBytes: done,
      totalBytes: total,
      speed: Math.max(0, speed),
    })
  }
}

function onSession<T extends "peer" | "ended" | "signal">(
  o: Op,
  type: T,
  fn: (m: Extract<ServerMessage, { type: T }>) => void,
) {
  o.cleanups.push(
    signaling.on(type, (m) => {
      if (
        op === o &&
        o.session &&
        (m as { sessionId: string }).sessionId === o.session.sessionId
      )
        fn(m as Extract<ServerMessage, { type: T }>)
    }),
  )
}

function watchSession(o: Op, onConnect: (data: SignalData) => void) {
  onSession(o, "peer", (m) => {
    patchShare({ peerName: m.name, peerOnline: m.state !== "away" })
    // The other device is reachable again: retry now instead of waiting out a timeout.
    if (
      m.state === "back" &&
      useShare.getState().role === "receiver" &&
      !o.pipe
    ) {
      if (o.receiver) o.attemptAbort?.abort("retry")
      else if (o.peer && useShare.getState().phase !== "streaming")
        retryViewer(o, o.peer)
    }
  })
  onSession(o, "ended", (m) => {
    const s = useShare.getState()
    if (TERMINAL.has(s.phase)) return
    if (o.sender?.done || o.receiver?.done) return
    const who =
      s.peerName ?? (s.role === "sender" ? "The recipient" : "The sender")
    if (s.kind === "screen" && m.reason === "left") {
      setPhase("ended", {
        note:
          s.role === "receiver" ? `${who} stopped sharing.` : `${who} left.`,
      })
      return teardown()
    }
    if (m.reason === "left") {
      setPhase("cancelled", {
        note:
          s.role === "receiver"
            ? `${who} cancelled the share.`
            : `${who} cancelled.`,
      })
      return teardown()
    }
    const detail = {
      expired:
        "Shares expire 30 minutes after they’re created if nobody joins.",
      peer_gone: `${who} went offline for too long.`,
      peer_failed: `${who} ran into a problem and stopped.`,
    }[m.reason]
    fail(o, {
      code: m.reason.toUpperCase(),
      title:
        m.reason === "expired" ? "This share expired" : "The share stopped",
      detail,
      retryable: true,
    })
  })
  onSession(o, "signal", (m) => {
    if (m.data.k === "connect") onConnect(m.data)
    else if (m.data.k === "screen") onScreenSignal(o, m.data)
  })
}

async function resumeAfterReconnect() {
  const o = op
  if (!o?.session || TERMINAL.has(useShare.getState().phase)) return
  o.attached = false
  try {
    const view = await signaling.request<SessionView>({
      type: "session.resume",
      id: newId(),
      sessionId: o.session.sessionId,
      token: o.session.token,
    })
    if (op !== o) return
    o.attached = true
    patchShare({ peerName: view.peerName, peerOnline: view.peerOnline })
    if (o.receiver && !o.pipe && useShare.getState().phase === "reconnecting")
      void establish(o)
  } catch (err) {
    if (op !== o) return
    o.sessionLost = true
    // An open data channel doesn't need the server: let a running direct transfer finish.
    if (!o.pipe || useShare.getState().phase === "waiting") {
      fail(o, {
        code: "SESSION_LOST",
        title: "The share was lost",
        detail:
          "The connection to SignalShare dropped long enough for the share to end (or the server restarted). Start a new share.",
        retryable: true,
      })
    }
    void err
  }
}

function waitAttached(o: Op, ms = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (op !== o) return reject(new PathError("aborted"))
      if (o.attached && signaling.status === "online") return resolve()
      if (Date.now() - started > ms)
        return reject(new PathError("peer-timeout"))
      setTimeout(tick, 200)
    }
    tick()
  })
}

function adoptPipe(o: Op, pipe: Pipe, attempts: Attempt[]) {
  o.pipe = pipe
  if (o.sender) o.sender.attach(pipe)
  if (o.receiver) o.receiver.attach(pipe)
  pipe.onclose = () => onPipeClosed(o, pipe)
  const fellBack = attempts.some((a) => !a.ok)
  const s = useShare.getState()
  setPhase("transferring", {
    path: pipe.kind,
    attempts: [...s.attempts, ...attempts],
    startedAt: s.startedAt ?? Date.now(),
    note:
      pipe.kind === "relay" && fellBack
        ? "Direct connection blocked : using the encrypted relay."
        : null,
  })
  if (!s.startedAt) playTransferStart()
  signaling.telemetry("connect.ok", {
    path: pipe.kind,
    ms: Math.round(attempts.at(-1)?.ms ?? 0),
    tries: attempts.length,
    kind: s.kind ?? "",
  })
}

function onPipeClosed(o: Op, pipe: Pipe) {
  if (op !== o || o.pipe !== pipe) return
  o.pipe = null
  o.sender?.detach()
  o.receiver?.detach()
  if (
    TERMINAL.has(useShare.getState().phase) ||
    o.sender?.done ||
    o.receiver?.done
  )
    return
  if (o.sessionLost) {
    return fail(o, {
      code: "SESSION_LOST",
      title: "Connection lost",
      detail:
        "The transfer was interrupted and the share no longer exists on the server. Start a new share.",
      retryable: true,
    })
  }
  setPhase("reconnecting", { note: "Connection interrupted : reconnecting…" })
  if (o.receiver) void establish(o)
  else {
    if (o.waitTimer) clearTimeout(o.waitTimer)
    o.waitTimer = setTimeout(
      () => fail(o, noPathError([], "peer-timeout")),
      SENDER_WAIT_MS,
    )
  }
}

// ── File & text: sender ──────────────────────────────────────────────────────

function secureOrFail(): boolean {
  if (window.isSecureContext && globalThis.crypto?.subtle) return true
  toast.error("SignalShare needs a secure connection", {
    description:
      "Open it over HTTPS (or on localhost). Encryption and screen capture are disabled on plain http.",
  })
  return false
}

export function shareFiles(files: File[]) {
  if (!files.length || !secureOrFail()) return
  lastAction = () => shareFiles(files)
  const metas = files.map((f) => ({
    name: f.name,
    size: f.size,
    type: f.type || "application/octet-stream",
  }))
  void startSending("files", files, metas)
}

export function shareText(text: string) {
  const value = text.trim()
  if (!value || !secureOrFail()) return
  lastAction = () => shareText(text)
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" })
  void startSending(
    "text",
    [blob],
    [{ name: "Text", size: blob.size, type: "text/plain" }],
  )
}

async function startSending(kind: ShareKind, blobs: Blob[], metas: FileMeta[]) {
  const o = begin()
  if (!o) return
  const totalBytes = metas.reduce((s, f) => s + f.size, 0)
  setPhase("creating", { role: "sender", kind, files: metas, totalBytes })

  try {
    const view = await signaling.request<SessionView>(
      { type: "session.create", id: newId(), kind, files: metas },
      12_000,
      o.abort.signal,
    )
    if (op !== o) return
    o.session = view
    o.attached = true
    setPhase("waiting", { session: view })
  } catch (err) {
    if (op === o) fail(o, errorFrom(err))
    return
  }

  const progress = throttledProgress()
  o.sender = new FileSender(blobs, {
    onProgress: progress,
    onComplete: () => {
      if (op !== o) return
      const s = useShare.getState()
      setPhase("completed", { doneBytes: s.totalBytes, note: null })
      playTransferComplete()
      signaling.telemetry("transfer.done", {
        bytes: s.totalBytes,
        ms: Date.now() - (s.startedAt ?? Date.now()),
        path: s.path ?? "",
      })
      saveHistory("sent")
      // Give the receiver a moment to read our `bye` before tearing the path down.
      setTimeout(() => {
        if (op !== o) return
        leave(o)
        teardown()
      }, 1500)
    },
    onCancel: (reason) => {
      if (op !== o || TERMINAL.has(useShare.getState().phase)) return
      setPhase("cancelled", { note: reason ?? "The recipient cancelled." })
      leave(o)
      teardown()
    },
    onError: (message) =>
      fail(o, {
        code: "READ_FAILED",
        title: "Transfer stopped",
        detail: message,
        retryable: false,
      }),
  })

  watchSession(o, (data) => {
    const req = parseConnectRequest(data)
    if (!req || !o.session || o.sender?.done) return
    if (o.waitTimer) clearTimeout(o.waitTimer)
    o.attemptAbort?.abort()
    const attempt = new AbortController()
    o.attemptAbort = attempt
    o.sender!.detach()
    o.pipe?.close()
    o.pipe = null
    const phase = useShare.getState().phase
    setPhase(
      phase === "waiting" || phase === "connecting"
        ? "connecting"
        : "reconnecting",
      { note: null },
    )

    offerPath(o.session.sessionId, o.session.token, req, attempt.signal)
      .then(({ pipe, attempts }) => {
        if (op !== o || attempt.signal.aborted) return pipe.close()
        adoptPipe(o, pipe, attempts)
      })
      .catch((err) => {
        if (op !== o || attempt.signal.aborted) return
        if (err instanceof NoPathError) {
          signaling.telemetry("connect.failed", {
            reasons: err.attempts.map((a) => a.reason).join(","),
            kind: "files",
          })
          patchShare({
            attempts: [...useShare.getState().attempts, ...err.attempts],
          })
          fail(o, noPathError(err.attempts, err.reason))
        }
      })
  })
}

// ── File & text: receiver ────────────────────────────────────────────────────

/** Joins by code or link. Code errors are returned for inline display instead of a failure screen. */
export async function join(
  target: { code: string } | { sessionId: string },
): Promise<ShareError | null> {
  if (!secureOrFail()) return null
  const o = begin()
  if (!o) return null
  lastAction = () => void join(target)
  useConnection.setState({ invite: null })
  // A typed code may be wrong: keep the form on screen (with its error) until the server accepts it.
  if (!("code" in target)) setPhase("joining", { role: "receiver" })

  let view: SessionView
  try {
    const seat =
      "sessionId" in target
        ? safeStorage(() => sessionStorage.getItem(SEAT_KEY(target.sessionId)))
        : null
    view = seat
      ? await signaling.request<SessionView>(
          {
            type: "session.resume",
            id: newId(),
            sessionId: (target as { sessionId: string }).sessionId,
            token: seat,
          },
          12_000,
          o.abort.signal,
        )
      : await signaling.request<SessionView>(
          { type: "session.join", id: newId(), ...target },
          12_000,
          o.abort.signal,
        )
  } catch (err) {
    if (op !== o) return null
    const error = errorFrom(err)
    if ("code" in target) {
      teardown()
      useShare.setState({ ...initialShare })
      return error
    }
    fail(o, error)
    return null
  }
  if (op !== o) return null

  o.session = view
  o.attached = true
  if ("code" in target) setPhase("joining", { role: "receiver" })
  safeStorage(() =>
    sessionStorage.setItem(SEAT_KEY(view.sessionId), view.token),
  )
  patchShare({
    session: view,
    kind: view.kind,
    files: view.files,
    totalBytes: view.totalSize,
    peerName: view.peerName,
    peerOnline: view.peerOnline,
  })

  if (view.kind === "screen") {
    watchSession(o, () => {})
    setPhase("connecting")
    void viewerConnect(o)
    return null
  }

  const progress = throttledProgress()
  let textDecoded: Promise<void> = Promise.resolve()
  o.receiver = new FileReceiver(view.files, {
    onProgress: progress,
    onFile: (i, blob) => {
      const meta = view.files[i]
      const item = {
        name: safeFileName(meta.name),
        size: meta.size,
        type: meta.type,
        url: URL.createObjectURL(blob),
      }
      patchShare({ received: [...useShare.getState().received, item] })
      if (view.kind === "text")
        textDecoded = blob
          .text()
          .then((text) => void (op === o && patchShare({ text })))
    },
    onComplete: async () => {
      await Promise.all([o.receiver!.waitForBye(), textDecoded])
      if (op !== o) return
      const s = useShare.getState()
      setPhase("completed", { doneBytes: s.totalBytes, note: null })
      playTransferComplete()
      saveHistory("received")
      leave(o)
      teardown()
      if (view.kind === "files" && s.received.length === 1)
        downloadItem(s.received[0])
    },
    onCancel: (reason) => {
      if (op !== o || TERMINAL.has(useShare.getState().phase)) return
      setPhase("cancelled", {
        note: reason ?? "The sender cancelled the share.",
      })
      leave(o)
      teardown()
    },
    onError: (message) =>
      fail(o, {
        code: "INTEGRITY",
        title: "Transfer failed",
        detail: message,
        retryable: true,
      }),
  })

  watchSession(o, () => {})
  setPhase("connecting")
  void establish(o)
  return null
}

let establishing: Op | null = null

/** Receiver: walk the ladder, with bounded retries. Only one establish loop per op. */
async function establish(o: Op) {
  if (establishing === o) return
  establishing = o
  try {
    for (let i = 0; i <= RECEIVER_RETRY_MS.length; i++) {
      if (op !== o || o.pipe || TERMINAL.has(useShare.getState().phase)) return
      try {
        await waitAttached(o)
        o.attempt += 1
        o.attemptAbort?.abort()
        const attempt = new AbortController()
        o.attemptAbort = attempt
        const { pipe, attempts } = await requestPath(
          o.session!.sessionId,
          o.session!.token,
          o.attempt,
          attempt.signal,
        )
        if (op !== o) return pipe.close()
        return adoptPipe(o, pipe, attempts)
      } catch (err) {
        if (op !== o) return
        if (o.attemptAbort?.signal.reason === "retry") {
          i-- // peer came back: retry immediately, doesn't count
          continue
        }
        const reason = err instanceof PathError ? err.reason : "ice-failed"
        if (reason === "aborted") return
        // The sender walked the whole ladder and found no route: retrying won't help.
        if (reason !== "peer-timeout")
          return fail(
            o,
            noPathError(
              [{ transport: "relay", ok: false, reason, ms: 0 }],
              reason,
            ),
          )
        if (i === RECEIVER_RETRY_MS.length)
          return fail(o, noPathError([], reason))
        setPhase("reconnecting", {
          note: "Still trying to reach the other device…",
        })
        await new Promise((r) => setTimeout(r, RECEIVER_RETRY_MS[i]))
      }
    }
  } finally {
    if (establishing === o) establishing = null
  }
}

// ── Screen share: sharer ────────────────────────────────────────────────────

export const screenShareSupported = () =>
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getDisplayMedia)

function captureOptions(): DisplayMediaStreamOptions {
  // Unknown members are ignored by browsers that don't support them.
  return {
    video: { frameRate: { ideal: 30, max: 60 } },
    audio: true,
    selfBrowserSurface: "exclude", // no hall-of-mirrors from capturing this tab
    surfaceSwitching: "include",
    systemAudio: "include",
  } as DisplayMediaStreamOptions
}

function captureError(err: unknown): ShareError {
  const name = err instanceof DOMException ? err.name : "Error"
  signaling.telemetry("screen.capture_failed", { name })
  if (name === "NotAllowedError")
    return {
      code: "CAPTURE_DENIED",
      title: "Screen sharing didn’t start",
      detail:
        "You cancelled the picker, or your browser isn’t allowed to record the screen. On a Mac, open System Settings › Privacy & Security › Screen & System Audio Recording, enable your browser, then try again.",
      retryable: true,
    }
  if (
    name === "NotFoundError" ||
    name === "NotReadableError" ||
    name === "AbortError"
  )
    return {
      code: "CAPTURE_UNAVAILABLE",
      title: "Couldn’t capture that source",
      detail:
        "The window or screen is unavailable (it may be protected or closed). Pick another source.",
      retryable: true,
    }
  return {
    code: "CAPTURE_FAILED",
    title: "Screen sharing isn’t available",
    detail: err instanceof Error ? err.message : String(err),
    retryable: false,
  }
}

/** Must be called directly from a click handler: getDisplayMedia needs the user gesture. */
export function shareScreen() {
  if (!secureOrFail()) return
  if (!screenShareSupported()) {
    toast.error("Screen sharing isn’t supported here", {
      description:
        "Use a desktop browser such as Chrome, Edge, Firefox or Safari. Phones can view shared screens but not share.",
    })
    return
  }
  const o = begin()
  if (!o) return
  lastAction = shareScreen
  setPhase("requesting_permission", { role: "sender", kind: "screen" })
  const capture = navigator.mediaDevices.getDisplayMedia(captureOptions()) // synchronous call inside the gesture

  void (async () => {
    let stream: MediaStream
    try {
      stream = await capture
    } catch (err) {
      if (op === o) fail(o, captureError(err))
      return
    }
    if (op !== o) return stream.getTracks().forEach((t) => t.stop())
    const track = stream.getVideoTracks()[0]
    if (!track || track.readyState !== "live")
      return fail(
        o,
        captureError(new DOMException("No video", "NotReadableError")),
      )
    track.contentHint = "detail"
    track.onended = () => op === o && stopSharing("The capture ended.")
    o.stream = stream
    setPhase("creating", { localStream: stream })

    try {
      const view = await signaling.request<SessionView>(
        { type: "session.create", id: newId(), kind: "screen", files: [] },
        12_000,
        o.abort.signal,
      )
      if (op !== o) return
      o.session = view
      o.attached = true
      setPhase("waiting", { session: view })
    } catch (err) {
      if (op === o) fail(o, errorFrom(err))
      return
    }

    watchSession(o, (data) => {
      if (Number.isSafeInteger(data.a)) void sharerConnect(o, data.a as number)
    })
  })()
}

async function sharerConnect(o: Op, attempt: number) {
  if (!o.session || !o.stream) return
  o.peer?.close()
  const peer = new Peer(o.session.sessionId, attempt)
  o.peer = peer
  const phase = useShare.getState().phase
  setPhase(
    phase === "waiting" || phase === "connecting"
      ? "connecting"
      : "reconnecting",
    { note: null },
  )

  for (const track of o.stream.getTracks()) {
    const sender = peer.pc.addTrack(track, o.stream)
    if (track.kind === "video") {
      const params = sender.getParameters()
      // Screens are mostly text: keep resolution, drop frame rate under congestion.
      params.degradationPreference = "maintain-resolution"
      sender.setParameters(params).catch(() => {})
    }
  }

  const unsubscribe = signaling.on("signal", (m) => {
    if (m.sessionId === o.session?.sessionId && op === o)
      void peer.handle(m.data).catch(() => {})
  })
  o.cleanups.push(unsubscribe)
  watchPeer(o, peer, () => {
    if (useShare.getState().phase !== "streaming") setPhase("negotiating")
  })
  await peer.offer().catch((err) =>
    fail(o, {
      code: "NEGOTIATION",
      title: "Couldn’t start the stream",
      detail: String(err),
      retryable: true,
    }),
  )
}

function onScreenSignal(o: Op, data: SignalData) {
  const s = useShare.getState()
  if (s.role === "sender" && data.state === "playing" && op === o) {
    if (s.phase !== "streaming") {
      signaling.telemetry("screen.streaming", { role: "sender" })
      setPhase("streaming", {
        startedAt: s.startedAt ?? Date.now(),
        note: null,
      })
    }
  }
  if (s.role === "receiver")
    patchShare({
      paused: data.state === "paused",
      note:
        data.state === "paused"
          ? `${s.peerName ?? "The sharer"} paused sharing.`
          : null,
    })
}

export function setPaused(paused: boolean) {
  const o = op
  const track = o?.stream?.getVideoTracks()[0]
  if (!o?.session || !track) return
  track.enabled = !paused
  patchShare({ paused })
  signaling.send({
    type: "signal",
    sessionId: o.session.sessionId,
    data: { k: "screen", state: paused ? "paused" : "playing" },
  })
}

/** Swap the captured surface without renegotiating. Call from a click handler. */
export function changeSource() {
  const o = op
  if (!o?.stream) return
  navigator.mediaDevices.getDisplayMedia(captureOptions()).then(
    (next) => {
      if (op !== o) return next.getTracks().forEach((t) => t.stop())
      const track = next.getVideoTracks()[0]
      track.contentHint = "detail"
      track.onended = () => op === o && stopSharing("The capture ended.")
      const video = o.peer?.pc
        .getSenders()
        .find((s) => s.track?.kind === "video")
      void video?.replaceTrack(track)
      o.stream?.getTracks().forEach((t) => {
        t.onended = null
        t.stop()
      })
      o.stream = next
      patchShare({ localStream: next, paused: false })
    },
    (err) => {
      if (err instanceof DOMException && err.name === "NotAllowedError") return // picker dismissed: keep current source
      toast.error(captureError(err).title)
    },
  )
}

export function stopSharing(note = "You stopped sharing.") {
  const o = op
  if (!o) return
  leave(o)
  teardown()
  useShare.setState({ ...initialShare })
  toast(
    note.includes("ended") ? "Screen sharing ended" : "Screen sharing stopped",
  )
}

// ── Screen share: viewer ─────────────────────────────────────────────────────

const VIEWER_ATTEMPTS = 5

async function viewerConnect(o: Op) {
  if (op !== o || !o.session) return
  if (o.attempt >= VIEWER_ATTEMPTS) {
    return fail(o, {
      code: "NO_MEDIA_PATH",
      title: "Couldn’t connect to the screen",
      detail: signaling.welcome?.turn
        ? "A media connection couldn’t be established even through the TURN relay. Try another network."
        : "A direct connection was blocked by a firewall or NAT. Screen sharing needs a direct path or a TURN server (the file relay can’t carry video). Try the same Wi-Fi, another network, or ask the operator to configure TURN.",
      retryable: true,
    })
  }
  try {
    await waitAttached(o)
  } catch {
    return
  }
  if (op !== o) return
  o.attempt += 1
  o.peer?.close()
  const peer = new Peer(o.session.sessionId, o.attempt)
  o.peer = peer
  peer.pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track])
    patchShare({ remoteStream: stream })
  }
  const unsubscribe = signaling.on("signal", (m) => {
    if (m.sessionId === o.session?.sessionId && op === o)
      void peer.handle(m.data).catch(() => {})
  })
  o.cleanups.push(unsubscribe)

  watchPeer(o, peer, () => {
    if (useShare.getState().phase !== "streaming") setPhase("negotiating")
    void waitForFrames(o, peer)
  })
  // Give up on this attempt if ICE never connects.
  const deadline = setTimeout(() => {
    if (op === o && o.peer === peer && peer.pc.connectionState !== "connected")
      retryViewer(o, peer)
  }, 20_000)
  o.cleanups.push(() => clearTimeout(deadline))
  peer.signal({ k: "connect", media: true })
}

function retryViewer(o: Op, peer: Peer) {
  if (op !== o || o.peer !== peer) return
  setPhase("reconnecting", { note: "Reconnecting to the screen…" })
  setTimeout(() => void viewerConnect(o), Math.min(4000, 500 * 2 ** o.attempt))
}

/** "Streaming" means frames are decoding : not that a signaling message was exchanged. */
async function waitForFrames(o: Op, peer: Peer) {
  const started = Date.now()
  while (op === o && o.peer === peer && Date.now() - started < 15_000) {
    const stats = await peer.pc.getStats().catch(() => null)
    let decoded = 0
    stats?.forEach(
      (s) =>
        s.type === "inbound-rtp" &&
        s.kind === "video" &&
        (decoded = s.framesDecoded ?? 0),
    )
    if (decoded > 0) {
      const s = useShare.getState()
      if (s.phase !== "streaming") {
        setPhase("streaming", {
          path: await peer.pathKind(),
          startedAt: s.startedAt ?? Date.now(),
          note: null,
        })
        signaling.telemetry("screen.streaming", {
          role: "viewer",
          path: useShare.getState().path ?? "",
        })
      }
      peer.signal({ k: "screen", state: "playing" })
      return
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  if (op === o && o.peer === peer) retryViewer(o, peer)
}

/** Shared ICE state handling: brief `disconnected` blips are tolerated; `failed` triggers recovery. */
function watchPeer(o: Op, peer: Peer, onConnected: () => void) {
  let blip: ReturnType<typeof setTimeout> | null = null
  peer.pc.addEventListener("connectionstatechange", () => {
    if (op !== o || o.peer !== peer) return
    const state = peer.pc.connectionState
    if (blip) clearTimeout(blip)
    if (state === "connected") return onConnected()
    if (state === "disconnected") {
      blip = setTimeout(() => {
        if (peer.pc.connectionState !== "connected") degrade(o, peer)
      }, 6000)
    }
    if (state === "failed") degrade(o, peer)
  })
}

function degrade(o: Op, peer: Peer) {
  if (op !== o || o.peer !== peer || TERMINAL.has(useShare.getState().phase))
    return
  if (useShare.getState().role === "receiver") return retryViewer(o, peer)
  // Sharer waits for the viewer to start a new attempt.
  setPhase("reconnecting", {
    note: "Connection to the viewer dropped : waiting for it to come back…",
  })
  if (o.waitTimer) clearTimeout(o.waitTimer)
  o.waitTimer = setTimeout(
    () =>
      fail(o, {
        code: "VIEWER_GONE",
        title: "Viewer disconnected",
        detail: "The viewer didn’t reconnect.",
        retryable: true,
      }),
    SENDER_WAIT_MS,
  )
}

// ── Common actions ─────────────────────────────────────────────────────────

export function invite(peerId: string) {
  const s = op?.session
  if (!s) return
  signaling
    .request(
      { type: "session.invite", id: newId(), sessionId: s.sessionId, peerId },
      8000,
    )
    .then(() => toast.success("Invitation sent"))
    .catch((err) => toast.error(errorFrom(err).detail))
}

export function declineInvite() {
  useConnection.setState({ invite: null })
}

/** User cancel: tell the other side, release everything, go home. */
export function cancel() {
  const o = op
  if (o) {
    o.pipe?.send(
      JSON.stringify({
        t: "cancel",
        reason: `${useConnection.getState().name || "The other device"} cancelled.`,
      }),
    )
    leave(o)
  }
  reset()
}

export function reset() {
  teardown()
  revokeUrls()
  useShare.setState({ ...initialShare })
}

export function retry() {
  const action = lastAction
  reset()
  action?.()
}

export function downloadItem(item: { url: string; name: string }) {
  const a = document.createElement("a")
  a.href = item.url
  a.download = item.name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function saveHistory(type: "sent" | "received") {
  const s = useShare.getState()
  if (!s.session) return
  historyDB
    .addTransaction({
      id: s.session.sessionId,
      type,
      peerName: s.peerName ?? "Unknown device",
      files: s.files.map((f) => ({ name: f.name, size: f.size })),
      totalSize: s.totalBytes,
      timestamp: Date.now(),
    })
    .catch(() => {})
}

export function shareLink(): string | null {
  const s = useShare.getState().session
  if (!s) return null
  const origin = signaling.welcome?.publicUrl ?? window.location.origin
  return `${origin}/receive/${s.sessionId}`
}
