// Signaling protocol shared by the browser client and the Fastify server.
// Every frame is JSON. Requests carry an `id`; the server answers with `reply` and `re: id`.
// Both sides validate everything they receive : never trust the other end.

export const PROTOCOL_VERSION = 2

export const LIMITS = {
  maxSignalBytes: 64 * 1024,
  maxFiles: 500,
  maxNameLength: 255,
  maxTotalBytes: 50 * 1024 ** 3,
  maxTextBytes: 1024 * 1024,
  maxDeviceName: 40,
} as const

export type ShareKind = "files" | "text" | "screen"

export interface FileMeta {
  name: string
  size: number
  type: string
}

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNSUPPORTED_VERSION"
  | "RATE_LIMITED"
  | "SESSION_NOT_FOUND"
  | "SESSION_FULL"
  | "INVALID_CODE"
  | "UNAUTHORIZED"
  | "LIMIT_EXCEEDED"
  | "PEER_NOT_FOUND"
  | "INTERNAL"

export type EndReason = "left" | "peer_failed" | "expired" | "peer_gone"

export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface Welcome {
  type: "welcome"
  v: number
  peerId: string
  name: string
  iceServers: IceServer[]
  iceTransportPolicy: "all" | "relay"
  relay: boolean
  turn: boolean
  publicUrl: string | null
}

/** Opaque peer-to-peer payload routed by the server to the other participant of a session. */
export type SignalData = { k: string; [key: string]: unknown }

export type ClientMessage =
  | { type: "hello"; v: number; name?: string }
  | { type: "ping" }
  | { type: "rename"; name: string }
  | { type: "session.create"; id: string; kind: ShareKind; files: FileMeta[] }
  | { type: "session.join"; id: string; code?: string; sessionId?: string }
  | { type: "session.resume"; id: string; sessionId: string; token: string }
  | {
      type: "session.leave"
      id: string
      sessionId: string
      token: string
      failed?: boolean
    }
  | { type: "session.invite"; id: string; sessionId: string; peerId: string }
  | { type: "signal"; sessionId: string; data: SignalData }
  | {
      type: "telemetry"
      event: string
      data: Record<string, string | number | boolean>
    }

export interface SessionView {
  sessionId: string
  code: string
  token: string
  logId: string
  role: "owner" | "guest"
  kind: ShareKind
  files: FileMeta[]
  totalSize: number
  expiresAt: number
  peerName: string | null
  peerOnline: boolean
}

export interface SessionPreview {
  kind: ShareKind
  senderName: string
  files: FileMeta[]
  totalSize: number
  expiresAt: number
  available: boolean
}

export type ServerMessage =
  | Welcome
  | { type: "pong" }
  | { type: "reply"; re: string; ok: true; data: unknown }
  | {
      type: "reply"
      re: string
      ok: false
      error: { code: ErrorCode; message: string }
    }
  | {
      type: "peer"
      sessionId: string
      state: "joined" | "away" | "back"
      name: string
    }
  | { type: "ended"; sessionId: string; reason: EndReason }
  | { type: "signal"; sessionId: string; data: SignalData }
  | { type: "presence"; peers: Array<{ id: string; name: string }> }
  | {
      type: "invite"
      sessionId: string
      from: string
      kind: ShareKind
      files: FileMeta[]
      totalSize: number
    }

// ── Validation ───────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
const isStr = (v: unknown, max = 256): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max
const isId = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)
const KINDS: readonly ShareKind[] = ["files", "text", "screen"]

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function isValidFileMeta(v: unknown): v is FileMeta {
  return (
    isObj(v) &&
    isStr(v.name, LIMITS.maxNameLength) &&
    !CONTROL_CHARS.test(v.name) &&
    Number.isSafeInteger(v.size) &&
    (v.size as number) >= 0 &&
    typeof v.type === "string" &&
    v.type.length <= 128
  )
}

export function validateFiles(
  kind: ShareKind,
  files: unknown,
): FileMeta[] | null {
  if (!Array.isArray(files)) return null
  if (kind === "screen") return files.length === 0 ? [] : null
  if (kind === "text") {
    if (files.length !== 1 || !isValidFileMeta(files[0])) return null
    return files[0].size > 0 && files[0].size <= LIMITS.maxTextBytes
      ? files
      : null
  }
  if (
    files.length === 0 ||
    files.length > LIMITS.maxFiles ||
    !files.every(isValidFileMeta)
  )
    return null
  const total = files.reduce((sum, f) => sum + f.size, 0)
  return total <= LIMITS.maxTotalBytes ? files : null
}

/** Normalises a user-typed share code: uppercase, strips spaces/dashes. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "")
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > LIMITS.maxSignalBytes) return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(m) || typeof m.type !== "string") return null

  switch (m.type) {
    case "hello":
      return typeof m.v === "number" &&
        (m.name === undefined || isStr(m.name, LIMITS.maxDeviceName))
        ? { type: "hello", v: m.v, name: m.name as string | undefined }
        : null
    case "ping":
      return { type: "ping" }
    case "rename":
      return isStr(m.name, LIMITS.maxDeviceName) && !CONTROL_CHARS.test(m.name)
        ? { type: "rename", name: m.name }
        : null
    case "session.create": {
      if (!isId(m.id) || !KINDS.includes(m.kind as ShareKind)) return null
      const files = validateFiles(m.kind as ShareKind, m.files)
      return files
        ? { type: "session.create", id: m.id, kind: m.kind as ShareKind, files }
        : null
    }
    case "session.join":
      if (!isId(m.id)) return null
      if (isStr(m.code, 16))
        return { type: "session.join", id: m.id, code: normalizeCode(m.code) }
      if (isId(m.sessionId))
        return { type: "session.join", id: m.id, sessionId: m.sessionId }
      return null
    case "session.resume":
      return isId(m.id) && isId(m.sessionId) && isId(m.token)
        ? {
            type: "session.resume",
            id: m.id,
            sessionId: m.sessionId,
            token: m.token,
          }
        : null
    case "session.leave":
      return isId(m.id) && isId(m.sessionId) && isId(m.token)
        ? {
            type: "session.leave",
            id: m.id,
            sessionId: m.sessionId,
            token: m.token,
            failed: m.failed === true,
          }
        : null
    case "session.invite":
      return isId(m.id) && isId(m.sessionId) && isId(m.peerId)
        ? {
            type: "session.invite",
            id: m.id,
            sessionId: m.sessionId,
            peerId: m.peerId,
          }
        : null
    case "signal":
      return isId(m.sessionId) && isObj(m.data) && typeof m.data.k === "string"
        ? { type: "signal", sessionId: m.sessionId, data: m.data as SignalData }
        : null
    case "telemetry": {
      if (!isStr(m.event, 64) || !isObj(m.data)) return null
      const data: Record<string, string | number | boolean> = {}
      for (const [k, v] of Object.entries(m.data).slice(0, 20)) {
        if (
          typeof v === "number" ||
          typeof v === "boolean" ||
          (typeof v === "string" && v.length <= 200)
        )
          data[k] = v
      }
      return { type: "telemetry", event: m.event, data }
    }
    default:
      return null
  }
}
