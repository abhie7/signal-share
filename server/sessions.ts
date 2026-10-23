import { randomBytes, randomInt } from "node:crypto"
import type {
  EndReason,
  ErrorCode,
  FileMeta,
  SessionPreview,
  SessionView,
  ShareKind,
} from "../lib/protocol.js"

/** Unambiguous alphabet: no 0/O, 1/I/L. 31^6 ≈ 887M codes. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const CODE_LENGTH = 6

export const OPEN_TTL_MS = 30 * 60 * 1000 // unclaimed share
export const MAX_LIFETIME_MS = 12 * 60 * 60 * 1000 // hard cap, any state
export const AWAY_GRACE_MS = 2 * 60 * 1000 // participant socket gone before session ends
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000

export type Role = "owner" | "guest"

export interface Participant<S> {
  token: string
  name: string
  socket: S | null
  awaySince: number | null
}

export interface Session<S> {
  id: string
  code: string
  logId: string
  kind: ShareKind
  files: FileMeta[]
  totalSize: number
  createdAt: number
  expiresAt: number
  owner: Participant<S>
  guest: Participant<S> | null
  relayBytes: number
}

export class SessionError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}

const token = (bytes = 24) => randomBytes(bytes).toString("base64url")

export function generateCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++)
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/**
 * In-memory session registry. Knows nothing about WebSockets beyond an opaque socket handle;
 * the caller sends notifications. All methods take `now` so tests can drive time.
 *
 * ponytail: single-process state. Horizontal scaling needs sticky sessions or a shared store (Redis).
 */
export class SessionRegistry<S> {
  private sessions = new Map<string, Session<S>>()
  private byCode = new Map<string, string>()
  private idempotency = new Map<
    string,
    { sessionId: string; token: string; at: number }
  >()
  private socketSessions = new Map<S, Set<string>>()

  constructor(private maxSessions = 5000) {}

  get size() {
    return this.sessions.size
  }

  get(id: string): Session<S> | undefined {
    return this.sessions.get(id)
  }

  create(
    input: {
      kind: ShareKind
      files: FileMeta[]
      ownerName: string
      requestId: string
      socket: S
    },
    now = Date.now(),
  ) {
    const seen = this.idempotency.get(input.requestId)
    if (seen) {
      const existing = this.sessions.get(seen.sessionId)
      if (existing && existing.owner.token === seen.token) {
        this.attach(existing, "owner", input.socket)
        return existing
      }
    }
    if (this.sessions.size >= this.maxSessions)
      throw new SessionError(
        "LIMIT_EXCEEDED",
        "Server is at capacity. Try again shortly.",
      )

    let code = generateCode()
    while (this.byCode.has(code)) code = generateCode()

    const session: Session<S> = {
      id: token(12),
      code,
      logId: token(6),
      kind: input.kind,
      files: input.files,
      totalSize: input.files.reduce((s, f) => s + f.size, 0),
      createdAt: now,
      expiresAt: now + OPEN_TTL_MS,
      owner: {
        token: token(),
        name: input.ownerName,
        socket: null,
        awaySince: null,
      },
      guest: null,
      relayBytes: 0,
    }
    this.sessions.set(session.id, session)
    this.byCode.set(code, session.id)
    this.idempotency.set(input.requestId, {
      sessionId: session.id,
      token: session.owner.token,
      at: now,
    })
    this.attach(session, "owner", input.socket)
    return session
  }

  /** Joins as guest. Repeating the same requestId returns the same guest seat. */
  join(
    input: {
      code?: string
      sessionId?: string
      guestName: string
      requestId: string
      socket: S
    },
    now = Date.now(),
  ) {
    const id =
      input.sessionId ?? (input.code ? this.byCode.get(input.code) : undefined)
    const session = id ? this.sessions.get(id) : undefined
    if (!session) {
      throw input.code
        ? new SessionError(
            "INVALID_CODE",
            "That code doesn’t match an active share.",
          )
        : new SessionError(
            "SESSION_NOT_FOUND",
            "This share has ended or expired.",
          )
    }

    const seen = this.idempotency.get(input.requestId)
    if (session.guest) {
      if (
        seen?.sessionId === session.id &&
        seen.token === session.guest.token
      ) {
        this.attach(session, "guest", input.socket)
        return session
      }
      throw new SessionError(
        "SESSION_FULL",
        "Someone else already joined this share.",
      )
    }

    session.guest = {
      token: token(),
      name: input.guestName,
      socket: null,
      awaySince: null,
    }
    // Claimed shares live until a participant leaves or stays away past the grace period.
    session.expiresAt = session.createdAt + MAX_LIFETIME_MS
    this.byCode.delete(session.code) // a code is single-use
    this.idempotency.set(input.requestId, {
      sessionId: session.id,
      token: session.guest.token,
      at: now,
    })
    this.attach(session, "guest", input.socket)
    return session
  }

  /** Re-attaches a (new) socket to a seat after a reconnect or page reload. */
  resume(sessionId: string, tokenValue: string, socket: S) {
    const session = this.sessions.get(sessionId)
    if (!session)
      throw new SessionError(
        "SESSION_NOT_FOUND",
        "This share has ended or expired.",
      )
    const role = this.roleOf(session, tokenValue)
    if (!role)
      throw new SessionError("UNAUTHORIZED", "Not a participant of this share.")
    this.attach(session, role, socket)
    return { session, role }
  }

  roleOf(session: Session<S>, tokenValue: string): Role | null {
    if (session.owner.token === tokenValue) return "owner"
    if (session.guest?.token === tokenValue) return "guest"
    return null
  }

  /** Role of a socket currently attached to the session, if any. */
  roleOfSocket(session: Session<S>, socket: S): Role | null {
    if (session.owner.socket === socket) return "owner"
    if (session.guest?.socket === socket) return "guest"
    return null
  }

  other(session: Session<S>, role: Role): Participant<S> | null {
    return role === "owner" ? session.guest : session.owner
  }

  private attach(session: Session<S>, role: Role, socket: S) {
    const seat = role === "owner" ? session.owner : session.guest!
    if (seat.socket && seat.socket !== socket)
      this.socketSessions.get(seat.socket)?.delete(session.id)
    seat.socket = socket
    seat.awaySince = null
    let set = this.socketSessions.get(socket)
    if (!set) this.socketSessions.set(socket, (set = new Set()))
    set.add(session.id)
  }

  /** Socket closed: mark its seats away. Returns affected sessions for notification. */
  detach(
    socket: S,
    now = Date.now(),
  ): Array<{ session: Session<S>; role: Role }> {
    const ids = this.socketSessions.get(socket)
    this.socketSessions.delete(socket)
    const affected: Array<{ session: Session<S>; role: Role }> = []
    for (const id of ids ?? []) {
      const session = this.sessions.get(id)
      if (!session) continue
      const role = this.roleOfSocket(session, socket)
      if (!role) continue
      const seat = role === "owner" ? session.owner : session.guest!
      seat.socket = null
      seat.awaySince = now
      affected.push({ session, role })
    }
    return affected
  }

  end(sessionId: string): Session<S> | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null
    this.sessions.delete(sessionId)
    this.byCode.delete(session.code)
    for (const seat of [session.owner, session.guest]) {
      if (seat?.socket) this.socketSessions.get(seat.socket)?.delete(sessionId)
    }
    return session
  }

  /** Expires sessions and away participants. Returns what ended so the caller can notify. */
  sweep(now = Date.now()): Array<{ session: Session<S>; reason: EndReason }> {
    const ended: Array<{ session: Session<S>; reason: EndReason }> = []
    for (const session of this.sessions.values()) {
      const away = [session.owner, session.guest].some(
        (p) => p?.awaySince != null && now - p.awaySince > AWAY_GRACE_MS,
      )
      if (now > session.expiresAt) ended.push({ session, reason: "expired" })
      else if (away) ended.push({ session, reason: "peer_gone" })
    }
    for (const { session } of ended) this.end(session.id)
    for (const [key, entry] of this.idempotency)
      if (now - entry.at > IDEMPOTENCY_TTL_MS) this.idempotency.delete(key)
    return ended
  }

  all(): IterableIterator<Session<S>> {
    return this.sessions.values()
  }

  view(session: Session<S>, role: Role): SessionView {
    const peer = this.other(session, role)
    return {
      sessionId: session.id,
      code: session.code,
      token: role === "owner" ? session.owner.token : session.guest!.token,
      logId: session.logId,
      role,
      kind: session.kind,
      files: session.files,
      totalSize: session.totalSize,
      expiresAt: session.expiresAt,
      peerName: peer?.name ?? null,
      peerOnline: Boolean(peer?.socket),
    }
  }

  preview(session: Session<S>): SessionPreview {
    return {
      kind: session.kind,
      senderName: session.owner.name,
      files: session.files,
      totalSize: session.totalSize,
      expiresAt: session.expiresAt,
      available: session.guest === null,
    }
  }
}
