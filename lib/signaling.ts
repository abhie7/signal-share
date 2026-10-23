import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
  type Welcome,
} from "./protocol"

export type SignalingStatus = "connecting" | "online" | "offline" | "outdated"

export class SignalingError extends Error {
  constructor(
    public code: ErrorCode | "TIMEOUT" | "ABORTED",
    message: string,
  ) {
    super(message)
  }
}

type Listener = (msg: ServerMessage) => void
type Pending = {
  msg: ClientMessage
  resolve: (v: unknown) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const PING_EVERY_MS = 20_000
const DEAD_AFTER_MS = 45_000
const MAX_BACKOFF_MS = 15_000
const NAME_KEY = "signalshare-device-name"

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Exponential backoff with full jitter. Exported for tests. */
export function backoffDelay(
  attempt: number,
  base = 500,
  max = MAX_BACKOFF_MS,
  random = Math.random,
): number {
  return Math.max(
    250,
    Math.floor(random() * Math.min(max, base * 2 ** attempt)),
  )
}

/**
 * Single WebSocket to the coordination server for the lifetime of the page.
 * Reconnects forever with backoff, heartbeats both ways, and replays in-flight requests after a
 * reconnect (every request type is idempotent server-side, keyed by its id).
 */
class Signaling {
  status: SignalingStatus = "offline"
  welcome: Welcome | null = null

  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private statusListeners = new Set<(s: SignalingStatus) => void>()
  private pending = new Map<string, Pending>()
  private attempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private lastMessageAt = 0
  private started = false

  start() {
    if (this.started || typeof window === "undefined") return
    this.started = true
    window.addEventListener("online", () => this.reconnectNow())
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.reconnectNow()
    })
    this.open()
  }

  private setStatus(s: SignalingStatus) {
    if (this.status === s) return
    this.status = s
    for (const fn of this.statusListeners) fn(s)
  }

  private open() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.setStatus("connecting")

    const proto = location.protocol === "https:" ? "wss" : "ws"
    const ws = new WebSocket(`${proto}://${location.host}/api/ws`)
    this.ws = ws

    ws.onopen = () => {
      this.lastMessageAt = Date.now()
      const name =
        safeStorage(() => localStorage.getItem(NAME_KEY)) || undefined
      ws.send(
        JSON.stringify({
          type: "hello",
          v: PROTOCOL_VERSION,
          name,
        } satisfies ClientMessage),
      )
    }

    ws.onmessage = (event) => {
      this.lastMessageAt = Date.now()
      let msg: ServerMessage
      try {
        msg = JSON.parse(event.data as string)
      } catch {
        return
      }
      if (msg.type === "welcome") {
        this.welcome = msg
        this.attempt = 0
        safeStorage(
          () =>
            localStorage.getItem(NAME_KEY) ||
            localStorage.setItem(NAME_KEY, msg.name),
        )
        this.setStatus("online")
        // Replay requests that were in flight when the previous socket died.
        for (const p of this.pending.values()) this.rawSend(p.msg)
      } else if (msg.type === "reply") {
        if (
          msg.re === "hello" &&
          !msg.ok &&
          msg.error.code === "UNSUPPORTED_VERSION"
        )
          this.setStatus("outdated")
        const p = this.pending.get(msg.re)
        if (p) {
          this.pending.delete(msg.re)
          clearTimeout(p.timer)
          if (msg.ok) p.resolve(msg.data)
          else p.reject(new SignalingError(msg.error.code, msg.error.message))
        }
      }
      this.emit(msg)
    }

    ws.onclose = (event) => {
      if (this.ws !== ws) return
      this.ws = null
      if (event.code === 4400) return this.setStatus("outdated")
      this.setStatus("offline")
      this.reconnectTimer = setTimeout(
        () => this.open(),
        backoffDelay(this.attempt++),
      )
    }

    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
        if (Date.now() - this.lastMessageAt > DEAD_AFTER_MS) {
          // Half-open socket (sleep, network change): force a reconnect.
          this.ws.close()
          return
        }
        this.rawSend({ type: "ping" })
      }, PING_EVERY_MS)
    }
  }

  reconnectNow() {
    if (!this.started || this.status === "online" || this.status === "outdated")
      return
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return
    this.attempt = 0
    this.open()
  }

  private rawSend(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(msg))
    return true
  }

  /** Fire-and-forget (signals, telemetry). Returns false when offline : callers must not assume delivery. */
  send(msg: ClientMessage): boolean {
    return this.status === "online" && this.rawSend(msg)
  }

  /** Request/response with a deadline. Survives reconnects; rejects with SignalingError. */
  request<T>(
    msg: ClientMessage & { id: string },
    timeoutMs = 12_000,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id)
        reject(
          new SignalingError(
            "TIMEOUT",
            "Can’t reach the SignalShare server. Check your connection.",
          ),
        )
      }, timeoutMs)
      signal?.addEventListener("abort", () => {
        clearTimeout(timer)
        this.pending.delete(msg.id)
        reject(new SignalingError("ABORTED", "Cancelled"))
      })
      this.pending.set(msg.id, {
        msg,
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })
      if (this.status === "online") this.rawSend(msg)
    })
  }

  on<T extends ServerMessage["type"]>(
    type: T,
    fn: (msg: Extract<ServerMessage, { type: T }>) => void,
  ): () => void {
    let set = this.listeners.get(type)
    if (!set) this.listeners.set(type, (set = new Set()))
    set.add(fn as Listener)
    return () => set!.delete(fn as Listener)
  }

  onStatus(fn: (s: SignalingStatus) => void): () => void {
    this.statusListeners.add(fn)
    return () => this.statusListeners.delete(fn)
  }

  rename(name: string) {
    safeStorage(() => localStorage.setItem(NAME_KEY, name))
    this.send({ type: "rename", name })
  }

  telemetry(event: string, data: Record<string, string | number | boolean>) {
    this.send({ type: "telemetry", event, data })
  }

  private emit(msg: ServerMessage) {
    for (const fn of this.listeners.get(msg.type) ?? []) {
      try {
        fn(msg)
      } catch (err) {
        console.error("[signaling] listener failed", msg.type, err)
      }
    }
  }
}

export function safeStorage<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

export const signaling = new Signaling()
