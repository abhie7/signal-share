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
  type ScreenQuality,
  type ShareError,
  type VideoStats,
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
import { PathError, Peer, withStartBitrate } from "./transfer/rtc"
import type { Pipe } from "./transfer/pipe"
import { historyDB } from "./db/history"
import {
  playError,
  playPeerDiscovered,
  playTransferComplete,
  playTransferStart,
} from "./sounds"
import { TEXT_TYPES } from "./content"
import { watchRequests } from "./request"
import { pairFor, pairShareSecret, watchPairs } from "./pairing"
import { recordShare } from "./recent"
import { riskOf } from "./risky"
import { pathOf } from "./utils/zip"
import { cleanOpfs, memorySink, pickSink, safePath } from "./transfer/sink"
import {
  checkTag,
  deriveKeys,
  keyPair,
  newSecret,
  tag,
  dtlsLabel,
  type ShareKeys,
} from "./transfer/handshake"

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
  /** Share secret: from the link's #fragment (receiver) or made here (sender). Never sent. */
  secret: string | null
  /** Receiver: this share came from one of our paired devices (its pairing keys the share). */
  pairId: string | null
  keys: ShareKeys | null
  /** Sender: keys derived for a receiver's hello, waiting for its confirmation. */
  pendingKeys: { n: string; keys: ShareKeys } | null
  keyFailures: number
  /** Sender answering a request link: only a receiver holding that link's secret may connect. */
  strictKeys: boolean
  /** Each side controls its own pause; the sender's loop holds while either is paused. */
  pauseMine: boolean
  pausePeer: boolean
  /** Cuts a receiver's retry back-off short when the other device comes back. */
  wake: (() => void) | null
  /** Removes the signal listener of the previous screen attempt. */
  peerOff: (() => void) | null
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
        fromDevice: m.fromDevice,
        pairId: m.pairId,
        kind: m.kind,
        files: m.files,
        totalSize: m.totalSize,
      },
    })
  })

  void cleanOpfs() // private storage left behind by tabs that closed mid-share
  watchRequests()
  watchPairs()

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
    secret: null,
    pairId: null,
    keys: null,
    pendingKeys: null,
    keyFailures: 0,
    strictKeys: false,
    pauseMine: false,
    pausePeer: false,
    wake: null,
    peerOff: null,
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
  if (o.receiver && !o.receiver.done) void o.receiver.sink.abort() // drop the unfinished file
  o.pipe?.close()
  o.peer?.close()
  o.stream?.getTracks().forEach((t) => {
    t.onended = null
    t.stop()
  })
}

/** Frees received files: object URLs, and the share's private-storage folder if it used one. */
function revokeUrls() {
  const { received, session } = useShare.getState()
  for (const item of received) URL.revokeObjectURL(item.url)
  if (session && received.length) void cleanOpfs(session.sessionId)
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
  notifyDone(error.title, error.detail)
  teardown()
}

/** System notification for a share that finished while the tab was in the background. */
function notifyDone(title: string, body: string) {
  if (
    !useShare.getState().notify ||
    !document.hidden ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return
  try {
    new Notification(title, { body, icon: "/favicon.svg", tag: "signalshare" })
  } catch {
    // Android Chrome only allows notifications from a service worker.
  }
}

/** Opt in to a notification when the current share finishes. Never shows file names. */
export async function enableNotify() {
  if (typeof Notification === "undefined") return
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission().catch(() => "denied" as const)
      : Notification.permission
  patchShare({ notify: permission === "granted" })
  if (permission === "denied")
    toast.error("Notifications are blocked", {
      description:
        "Allow notifications for this site in your browser settings, then try again.",
    })
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

// ── Share keys (handshake.ts) ────────────────────────────────────────────────

const securityError = (): ShareError => ({
  code: "SECURITY",
  title: "Security check failed",
  detail:
    "The two devices couldn’t confirm each other’s keys, so nothing was sent. The link may have been changed, or something between you tried to intercept the share. Start a new share.",
  retryable: false,
})

const sendSignal = (o: Op, data: SignalData) =>
  o.session &&
  signaling.send({ type: "signal", sessionId: o.session.sessionId, data })

function adoptKeys(o: Op, keys: ShareKeys) {
  o.keys = keys
  patchShare({ security: { mode: keys.mode, sas: keys.sas } })
}

/** Sender: a receiver said hello. Derive keys and prove we hold them; it confirms back. */
async function answerHello(o: Op, data: SignalData) {
  if (!o.session || typeof data.pub !== "object" || typeof data.n !== "string")
    return
  // Answering a request: whoever connects must hold the request link's secret.
  if (o.strictKeys && data.mode !== "link") {
    if (++o.keyFailures >= 3) fail(o, securityError())
    return
  }
  // A new hello means the receiver lost its keys (a reload): never use the old ones again.
  o.keys = null
  try {
    const { pair, pub } = await keyPair()
    // Only a receiver that came through the link knows the secret; it checks us with it.
    // A paired device uses the pairing's secret instead.
    const paired =
      data.mode === "pair" && typeof data.pairId === "string"
        ? pairFor(data.pairId)
        : undefined
    const secret = paired
      ? await pairShareSecret(paired.secret, o.session.sessionId)
      : data.mode === "link"
        ? o.secret
        : null
    const derived = await deriveKeys(
      pair.privateKey,
      data.pub as JsonWebKey,
      secret,
      o.session.sessionId,
    )
    const keys: ShareKeys = paired ? { ...derived, mode: "pair" } : derived
    if (op !== o) return
    o.pendingKeys = { n: data.n, keys }
    sendSignal(o, {
      k: "key",
      n: data.n,
      pub,
      confirm: await tag(keys, "confirm sender"),
    })
  } catch {
    // Malformed key from the other side: ignore; it will time out and retry.
  }
}

async function confirmHello(o: Op, data: SignalData) {
  const pending = o.pendingKeys
  if (!pending || data.n !== pending.n) return
  if (await checkTag(pending.keys, "confirm receiver", data.confirm)) {
    o.pendingKeys = null
    adoptKeys(o, pending.keys)
  } else if (++o.keyFailures >= 3) fail(o, securityError())
}

/** Receiver: run the handshake. Rejects with PathError "auth-failed" if the sender can't prove the keys. */
function receiverHandshake(o: Op): Promise<ShareKeys> {
  const session = o.session!
  const n = newId()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    let unsubscribe = () => {}
    void keyPair().then(({ pair, pub }) => {
      unsubscribe = signaling.on("signal", async (m) => {
        if (
          m.sessionId !== session.sessionId ||
          m.data.k !== "key" ||
          m.data.n !== n
        )
          return
        unsubscribe()
        clearTimeout(timer)
        try {
          const derived = await deriveKeys(
            pair.privateKey,
            m.data.pub as JsonWebKey,
            o.secret,
            session.sessionId,
          )
          const keys: ShareKeys = o.pairId
            ? { ...derived, mode: "pair" }
            : derived
          if (!(await checkTag(keys, "confirm sender", m.data.confirm)))
            return reject(new PathError("auth-failed"))
          sendSignal(o, {
            k: "key-ok",
            n,
            confirm: await tag(keys, "confirm receiver"),
          })
          resolve(keys)
        } catch {
          reject(new PathError("auth-failed"))
        }
      })
      timer = setTimeout(() => {
        unsubscribe()
        reject(new PathError("peer-timeout"))
      }, 20_000)
      sendSignal(o, {
        k: "key",
        n,
        pub,
        mode: o.pairId ? "pair" : o.secret ? "link" : "sas",
        ...(o.pairId ? { pairId: o.pairId } : {}),
      })
    }, reject)
  })
}

/** Sender: a connect request only counts once the handshake it follows has been confirmed. */
function waitKeys(o: Op, ms = 10_000): Promise<ShareKeys> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (op !== o) return reject(new PathError("aborted"))
      if (o.keys) return resolve(o.keys)
      if (Date.now() - started > ms)
        return reject(new PathError("peer-timeout"))
      setTimeout(tick, 50)
    }
    tick()
  })
}

function watchSession(o: Op, onConnect: (data: SignalData) => void) {
  onSession(o, "peer", (m) => {
    patchShare({
      peerName: m.name,
      peerDevice: m.device,
      peerOnline: m.state !== "away",
    })
    // The other device is reachable again: retry now instead of waiting out a timeout.
    if (
      m.state === "back" &&
      useShare.getState().role === "receiver" &&
      !o.pipe
    ) {
      if (o.receiver) {
        o.wake?.() // in the back-off pause
        o.attemptAbort?.abort("retry") // or mid-attempt
      } else if (o.peer && useShare.getState().phase !== "streaming")
        retryViewer(o, o.peer)
    }
  })
  onSession(o, "ended", (m) => {
    const s = useShare.getState()
    if (TERMINAL.has(s.phase)) return
    if (o.sender?.done || o.receiver?.done) return
    const who =
      s.peerName ??
      s.answering ??
      (s.role === "sender" ? "The recipient" : "The sender")
    if (s.kind === "screen" && m.reason === "left") {
      setPhase("ended", {
        note:
          s.role === "receiver" ? `${who} stopped sharing.` : `${who} left.`,
      })
      return teardown()
    }
    if (m.reason === "declined") {
      setPhase("cancelled", { note: `${who} said no thanks.` })
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
    else if (useShare.getState().role === "sender") {
      if (m.data.k === "key") void answerHello(o, m.data)
      else if (m.data.k === "key-ok") void confirmHello(o, m.data)
    }
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

const ROUTE_TEXT = {
  direct: "a direct connection",
  turn: "the TURN relay",
  relay: "the encrypted relay",
} as const

const percent = (s: { doneBytes: number; totalBytes: number }) =>
  s.totalBytes ? Math.floor((s.doneBytes / s.totalBytes) * 100) : 0

/** Shows a status line, then clears it after a while unless something replaced it. */
function flashNote(o: Op, note: string, ms = 6000) {
  patchShare({ note })
  setTimeout(() => {
    if (op === o && useShare.getState().note === note)
      patchShare({ note: null })
  }, ms)
}

function adoptPipe(o: Op, pipe: Pipe, attempts: Attempt[]) {
  o.pipe = pipe
  if (o.sender) o.sender.attach(pipe)
  if (o.receiver) o.receiver.attach(pipe)
  pipe.onclose = () => onPipeClosed(o, pipe)
  const fellBack = attempts.some((a) => !a.ok)
  const s = useShare.getState()
  // A pause made while the path was down still has to reach the other side.
  // Tell the other side our pause state on every new path: a pause made while the path was
  // down arrives, and a reloaded peer's stale view is corrected.
  pipe.send(JSON.stringify({ t: "pause", on: o.pauseMine }))
  const resumed = s.phase === "reconnecting" && s.startedAt !== null
  const moved = resumed && s.path && s.path !== pipe.kind
  setPhase("transferring", {
    path: pipe.kind,
    attempts: [...s.attempts, ...attempts],
    startedAt: s.startedAt ?? Date.now(),
    note:
      pipe.kind === "relay" && fellBack && !resumed
        ? "Direct connection blocked : using the encrypted relay."
        : null,
  })
  if (resumed)
    flashNote(
      o,
      `${moved ? `Switched to ${ROUTE_TEXT[pipe.kind]}. ` : ""}Resumed at ${percent(s)}%, nothing lost.`,
    )
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
  const s = useShare.getState()
  setPhase("reconnecting", {
    note: `Connection dropped at ${percent(s)}%, reconnecting… Nothing received so far is lost.`,
  })
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

/** Answering someone's request link: the share is offered to them instead of shown as a code. */
export interface Answer {
  requestId: string
  to: string
  /** The request link's #secret; it becomes this share's secret, so the asker can check keys. */
  secret: string | null
}

export function shareFiles(files: File[], answer?: Answer) {
  if (!files.length || !secureOrFail()) return
  lastAction = () => shareFiles(files, answer)
  const metas = files.map((f) => ({
    name: pathOf(f), // folder files carry their path ("Photos/a.jpg")
    size: f.size,
    type: f.type || "application/octet-stream",
  }))
  void startSending("files", files, metas, answer)
}

/** `type` says how the text was meant (TEXT_TYPES); the receiver re-checks it either way. */
export function shareText(text: string, type: string = TEXT_TYPES.text) {
  // Keep the first line's indentation: code pasted from an editor starts indented.
  const value = text.replace(/^(?:[ \t]*\n)+/, "").trimEnd()
  if (!value.trim() || !secureOrFail()) return
  lastAction = () => shareText(text, type)
  const blob = new Blob([value], { type: "text/plain;charset=utf-8" })
  void startSending("text", [blob], [{ name: "Text", size: blob.size, type }])
}

/** Offers a freshly created share to the person who asked for it. False if that failed. */
async function offerToRequester(o: Op, answer: Answer): Promise<boolean> {
  patchShare({ answering: answer.to })
  try {
    await signaling.request(
      {
        type: "request.fulfil",
        id: newId(),
        requestId: answer.requestId,
        sessionId: o.session!.sessionId,
        keyed: Boolean(answer.secret),
      },
      10_000,
      o.abort.signal,
    )
    return true
  } catch (err) {
    if (op === o)
      fail(o, {
        code: err instanceof SignalingError ? err.code : "INTERNAL",
        title: "Couldn’t answer the request",
        detail: err instanceof Error ? err.message : String(err),
        retryable: false,
      })
    return false
  }
}

async function startSending(
  kind: ShareKind,
  blobs: Blob[],
  metas: FileMeta[],
  answer?: Answer,
) {
  const o = begin()
  if (!o) return
  o.secret = answer?.secret ?? newSecret()
  o.strictKeys = Boolean(answer?.secret)
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
      notifyDone("Sent", `Delivered to ${s.peerName ?? "the other device"}.`)
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
    onPause: (on) => op === o && peerPaused(o, on),
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

    waitKeys(o)
      .then((keys) =>
        offerPath(
          o.session!.sessionId,
          o.session!.token,
          req,
          keys,
          attempt.signal,
        ),
      )
      .then(({ pipe, attempts }) => {
        if (op !== o || attempt.signal.aborted) return pipe.close()
        adoptPipe(o, pipe, attempts)
      })
      .catch((err) => {
        if (op !== o || attempt.signal.aborted) return
        if (err instanceof PathError && err.reason === "auth-failed")
          return fail(o, securityError())
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
  // Only now: the requester may accept at once, and their join must find us listening.
  if (answer) await offerToRequester(o, answer)
}

// ── File & text: receiver ────────────────────────────────────────────────────

/** Joins by code or link. Code errors are returned for inline display instead of a failure screen. */
export async function join(
  target:
    | { code: string }
    | { sessionId: string; secret?: string | null; pairId?: string | null },
): Promise<ShareError | null> {
  if (!secureOrFail()) return null
  const o = begin()
  if (!o) return null
  lastAction = () => void join(target)
  const secretKey = (id: string) => `signalshare-secret:${id}`
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
          "code" in target
            ? { type: "session.join", id: newId(), code: target.code }
            : {
                type: "session.join",
                id: newId(),
                sessionId: target.sessionId,
              },
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
  // The link's secret, kept with the seat so a reload can redo the handshake.
  o.secret =
    ("secret" in target && target.secret) ||
    safeStorage(() => sessionStorage.getItem(secretKey(view.sessionId))) ||
    null
  // From a paired device: the pairing's secret keys this share.
  const paired =
    "pairId" in target && target.pairId ? pairFor(target.pairId) : undefined
  if (paired) {
    o.pairId = paired.id
    o.secret = await pairShareSecret(paired.secret, view.sessionId)
  }
  if (o.secret)
    safeStorage(() =>
      sessionStorage.setItem(secretKey(view.sessionId), o.secret!),
    )
  patchShare({
    session: view,
    kind: view.kind,
    files: view.files,
    totalBytes: view.totalSize,
    peerName: view.peerName,
    peerDevice: view.peerDevice,
    peerOnline: view.peerOnline,
  })

  if (view.kind === "screen") {
    watchSession(o, () => {})
    setPhase("connecting")
    void viewerConnect(o)
    return null
  }

  // Still inside the Receive click: big shares and folders may ask where to save.
  const sink =
    view.kind === "files"
      ? await pickSink(view.sessionId, view.files)
      : undefined
  if (op !== o) {
    void sink?.abort()
    return null
  }
  if (sink?.kind === "disk") patchShare({ savedToDisk: true })

  const progress = throttledProgress()
  let textDecoded: Promise<void> = Promise.resolve()
  o.receiver = new FileReceiver(
    view.files,
    {
      onProgress: progress,
      onFile: (i, blob) => {
        const meta = view.files[i]
        const item = {
          name: safePath(meta.name).join("/"),
          size: meta.size,
          type: meta.type,
          url: URL.createObjectURL(blob),
          blob,
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
        notifyDone(
          "Received",
          view.kind === "text"
            ? `Text from ${s.peerName ?? "the other device"}.`
            : `${s.files.length} ${s.files.length === 1 ? "file" : "files"} from ${s.peerName ?? "the other device"}.`,
        )
        saveHistory("received")
        leave(o)
        teardown()
        // One file saves itself, unless it's a program: that one waits for a deliberate click.
        if (
          view.kind === "files" &&
          s.received.length === 1 &&
          !s.savedToDisk &&
          !riskOf(view.files[0].name)
        )
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
      onPause: (on) => op === o && peerPaused(o, on),
    },
    sink,
    // Private browsing caps disk storage (about 128 MB per file): finish in memory instead.
    sink?.kind === "opfs" ? () => memorySink(view.files) : undefined,
  )

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
      let attempt: AbortController | null = null
      try {
        await waitAttached(o)
        if (!o.keys) adoptKeys(o, await receiverHandshake(o))
        o.attempt += 1
        o.attemptAbort?.abort()
        attempt = new AbortController()
        o.attemptAbort = attempt
        const { pipe, attempts } = await requestPath(
          o.session!.sessionId,
          o.session!.token,
          o.attempt,
          o.keys!,
          attempt.signal,
        )
        if (op !== o) return pipe.close()
        return adoptPipe(o, pipe, attempts)
      } catch (err) {
        if (op !== o) return
        if (attempt?.signal.reason === "retry") {
          i-- // peer came back mid-attempt: retry immediately, doesn't count
          continue
        }
        const reason = err instanceof PathError ? err.reason : "ice-failed"
        if (reason === "aborted") return
        if (reason === "auth-failed") return fail(o, securityError())
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
        // The sender may never have seen our key confirmation: redo the handshake next time.
        o.keys = null
        setPhase("reconnecting", {
          note: "Still trying to reach the other device…",
        })
        await new Promise<void>((r) => {
          o.wake = r
          setTimeout(r, RECEIVER_RETRY_MS[i])
        })
        o.wake = null
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

// Two encoder profiles. "smooth" (default) keeps 60 fps and gives up resolution first under
// pressure; "sharp" keeps text crisp and gives up frame rate first.
const QUALITY = {
  smooth: {
    hint: "motion",
    degradation: "maintain-framerate",
    fps: 60,
    maxBitrate: 12_000_000,
  },
  sharp: {
    hint: "detail",
    degradation: "maintain-resolution",
    fps: 30,
    maxBitrate: 8_000_000,
  },
} as const

// Capture is capped at 1080p: full Retina/4K resolution makes the encoder CPU-bound, which is
// what made the old stream stutter.
const CAPTURE_SIZE = {
  width: { ideal: 1920, max: 1920 },
  height: { ideal: 1080, max: 1080 },
}

function tuneTrack(track: MediaStreamTrack, q: ScreenQuality) {
  const p = QUALITY[q]
  track.contentHint = p.hint
  track
    .applyConstraints({
      ...CAPTURE_SIZE,
      frameRate: { ideal: p.fps, max: p.fps },
    })
    .catch(() => {})
}

/** Bitrate ceiling, frame rate and what to sacrifice first. Needs a negotiated sender. */
function tuneSender(sender: RTCRtpSender, q: ScreenQuality) {
  const p = QUALITY[q]
  const params = sender.getParameters()
  if (!params.encodings?.length) return
  params.degradationPreference = p.degradation
  params.encodings[0] = {
    ...params.encodings[0],
    maxBitrate: p.maxBitrate,
    maxFramerate: p.fps,
    priority: "high",
    networkPriority: "high",
  }
  sender.setParameters(params).catch(() => {})
}

/** H.264 first: hardware-encoded on most Macs and PCs, so 1080p60 doesn't saturate the CPU. */
function preferHardwareCodec(transceiver: RTCRtpTransceiver) {
  try {
    const caps =
      RTCRtpReceiver.getCapabilities?.("video") ??
      RTCRtpSender.getCapabilities?.("video")
    if (!caps || !transceiver.setCodecPreferences) return
    const rank = (mime: string) =>
      ({ "video/H264": 0, "video/VP9": 1, "video/VP8": 2 })[mime] ?? 3
    transceiver.setCodecPreferences(
      [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType)),
    )
  } catch {
    // Keep the browser's default order.
  }
}

/** Sharer: switch between smooth 60 fps and sharp text while live. */
export function setScreenQuality(q: ScreenQuality) {
  const o = op
  patchShare({ screenQuality: q })
  const track = o?.stream?.getVideoTracks()[0]
  if (!track) return
  tuneTrack(track, q)
  const sender = o?.peer?.pc.getSenders().find((s) => s.track?.kind === "video")
  if (sender) tuneSender(sender, q)
}

/** Live resolution, frame rate, round trip and packet loss of the stream, for both ends. */
function watchVideoStats(
  o: Op,
  peer: Peer,
  type: "inbound-rtp" | "outbound-rtp",
) {
  let prevLost = 0
  let prevReceived = 0
  const timer = setInterval(async () => {
    if (op !== o || o.peer !== peer) return clearInterval(timer)
    const stats = await peer.pc.getStats().catch(() => null)
    if (!stats) return
    // Assigned inside the callback below, which TypeScript's narrowing can't see.
    let frame = null as Omit<VideoStats, "rtt" | "loss"> | null
    let rtt: number | null = null
    let loss: number | null = null
    stats.forEach((s) => {
      if (s.type === "candidate-pair" && s.nominated && s.state === "succeeded")
        rtt =
          s.currentRoundTripTime != null ? s.currentRoundTripTime * 1000 : rtt
      if (s.kind !== "video") return
      if (s.type === "remote-inbound-rtp" && s.fractionLost != null)
        loss = s.fractionLost // what the viewer reports back to the sharer
      if (s.type === "inbound-rtp") {
        const lost = s.packetsLost ?? 0
        const received = s.packetsReceived ?? 0
        const total = lost - prevLost + (received - prevReceived)
        if (total > 0) loss = Math.max(0, (lost - prevLost) / total)
        prevLost = lost
        prevReceived = received
      }
      if (s.type === type && s.frameHeight)
        frame = {
          width: s.frameWidth,
          height: s.frameHeight,
          fps: Math.round(s.framesPerSecond ?? 0),
        }
    })
    if (frame) patchShare({ videoStats: { ...frame, rtt, loss } })
  }, 1000)
  o.cleanups.push(() => clearInterval(timer))
}

function captureOptions(): DisplayMediaStreamOptions {
  // Unknown members are ignored by browsers that don't support them.
  return {
    video: { ...CAPTURE_SIZE, frameRate: { ideal: 60, max: 60 } },
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
export function shareScreen(answer?: Answer) {
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
  o.secret = answer?.secret ?? newSecret()
  o.strictKeys = Boolean(answer?.secret)
  lastAction = () => shareScreen(answer)
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
    tuneTrack(track, useShare.getState().screenQuality)
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
    if (answer) await offerToRequester(o, answer)
  })()
}

async function sharerConnect(o: Op, attempt: number) {
  if (!o.session || !o.stream) return
  let keys: ShareKeys
  try {
    keys = await waitKeys(o)
  } catch {
    return // the viewer retries with a fresh handshake
  }
  if (op !== o || !o.session || !o.stream) return
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

  // Start near 4 Mbps instead of ~0.3 Mbps so the first seconds aren't soft and juddery.
  peer.mungeAnswer = (sdp) => withStartBitrate(sdp, 4000)
  const quality = useShare.getState().screenQuality
  // Tracks are attached only after the viewer proved the keys (below): until then a
  // man-in-the-middle would see nothing but an empty stream.
  const held: Array<[RTCRtpSender, MediaStreamTrack]> = []
  for (const track of o.stream.getTracks()) {
    if (track.kind !== "video") {
      const t = peer.pc.addTransceiver(track, {
        direction: "sendonly",
        streams: [o.stream],
      })
      held.push([t.sender, track])
      continue
    }
    // Encoding limits must be given here: Chrome refuses to add them after creation.
    const transceiver = peer.pc.addTransceiver(track, {
      direction: "sendonly",
      streams: [o.stream],
      sendEncodings: [
        {
          maxBitrate: QUALITY[quality].maxBitrate,
          maxFramerate: QUALITY[quality].fps,
          priority: "high",
          networkPriority: "high",
        },
      ],
    })
    preferHardwareCodec(transceiver)
    held.push([transceiver.sender, track])
  }
  await Promise.all(held.map(([sender]) => sender.replaceTrack(null)))

  let unlocked = false
  const unsubscribe = signaling.on("signal", (m) => {
    if (m.sessionId !== o.session?.sessionId || op !== o) return
    if (m.data.k !== "auth" || m.data.a !== attempt)
      return void peer.handle(m.data).catch(() => {})
    void checkTag(
      keys,
      dtlsLabel("receiver", peer.pc, "theirs"),
      m.data.tag,
    ).then(async (ok) => {
      if (op !== o || o.peer !== peer) return
      if (!ok) return fail(o, securityError())
      if (unlocked) return
      unlocked = true
      await Promise.all(
        held.map(([sender, track]) => sender.replaceTrack(track)),
      )
      const video = held.find(([, t]) => t.kind === "video")?.[0]
      if (video) tuneSender(video, useShare.getState().screenQuality)
    })
  })
  o.peerOff?.() // the previous attempt's listener
  o.peerOff = unsubscribe
  o.cleanups.push(unsubscribe)
  watchPeer(o, peer, () => {
    if (useShare.getState().phase !== "streaming") setPhase("negotiating")
    void tag(keys, dtlsLabel("sender", peer.pc, "mine")).then((t) =>
      peer.signal({ k: "auth", tag: t }),
    )
  })
  watchVideoStats(o, peer, "outbound-rtp")
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
      tuneTrack(track, useShare.getState().screenQuality)
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
    if (!o.keys) adoptKeys(o, await receiverHandshake(o))
  } catch (err) {
    if (op !== o) return
    if (err instanceof PathError && err.reason === "auth-failed")
      return fail(o, securityError())
    if (err instanceof PathError && err.reason === "peer-timeout") {
      o.attempt += 1 // bounded: the sharer isn't answering
      setTimeout(() => void viewerConnect(o), 1000)
    }
    return
  }
  if (op !== o || !o.session) return
  const keys = o.keys!
  o.attempt += 1
  o.peer?.close()
  const peer = new Peer(o.session.sessionId, o.attempt)
  const attempt = o.attempt
  o.peer = peer
  peer.pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track])
    patchShare({ remoteStream: stream })
  }
  const unsubscribe = signaling.on("signal", (m) => {
    if (m.sessionId !== o.session?.sessionId || op !== o) return
    if (m.data.k !== "auth" || m.data.a !== attempt)
      return void peer.handle(m.data).catch(() => {})
    // The sharer vouches for the connection first; answer only if its view matches ours.
    void checkTag(
      keys,
      dtlsLabel("sender", peer.pc, "theirs"),
      m.data.tag,
    ).then(async (ok) => {
      if (op !== o || o.peer !== peer) return
      if (!ok) return fail(o, securityError())
      peer.signal({
        k: "auth",
        tag: await tag(keys, dtlsLabel("receiver", peer.pc, "mine")),
      })
    })
  })
  o.peerOff?.() // the previous attempt's listener
  o.peerOff = unsubscribe
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
  o.keys = null // redo the handshake: the sharer may have missed our confirmation
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
      watchVideoStats(o, peer, "inbound-rtp")
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

/** Offer the current share to a nearby device, or to one of our paired devices (`pairId`). */
export function invite(peerId: string, pairId?: string) {
  const s = op?.session
  if (!s) return
  signaling
    .request(
      {
        type: "session.invite",
        id: newId(),
        sessionId: s.sessionId,
        peerId,
        ...(pairId ? { pairId } : {}),
      },
      8000,
    )
    .then(() => toast.success("Invitation sent"))
    .catch((err) => toast.error(errorFrom(err).detail))
}

function showPause(o: Op) {
  patchShare({
    pausedBy: o.pauseMine
      ? "you"
      : o.pausePeer
        ? (useShare.getState().peerName ?? "the other device")
        : null,
    speed: 0,
  })
}

function peerPaused(o: Op, on: boolean) {
  o.pausePeer = on
  showPause(o)
}

/** Pause or resume our side of a file transfer. Each side resumes only its own pause. */
export function setTransferPaused(on: boolean) {
  const o = op
  if (!o || !(o.sender || o.receiver)) return
  o.pauseMine = on
  o.sender?.setPaused(on)
  o.pipe?.send(JSON.stringify({ t: "pause", on }))
  showPause(o)
}

/** Sender: how long the share stays open if nobody claims it. The server enforces it. */
export async function setExpiry(minutes: number) {
  const o = op
  const s = o?.session
  if (!o || !s) return
  try {
    const view = await signaling.request<SessionView>(
      {
        type: "session.expire",
        id: newId(),
        sessionId: s.sessionId,
        token: s.token,
        minutes,
      },
      8000,
    )
    if (op !== o) return
    o.session = view
    patchShare({ session: view })
  } catch (err) {
    toast.error(errorFrom(err).title)
  }
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
  if (s.peerName)
    recordShare({
      name: s.peerName,
      device: s.peerDevice ?? "other",
      direction: type,
    })
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

/** The share link. Its #secret never reaches a server: browsers don't send fragments. */
export function shareLink(): string | null {
  const s = useShare.getState().session
  if (!s) return null
  const origin = signaling.welcome?.publicUrl ?? window.location.origin
  return `${origin}/receive/${s.sessionId}${op?.secret ? `#${op.secret}` : ""}`
}
