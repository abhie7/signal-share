import { randomBytes } from "node:crypto"
import type { RequestPreview, ShareKind } from "../lib/protocol.js"
import { OPEN_TTL_MS, SessionError } from "./sessions.js"

// "Send me your files / show me your screen": a link someone opens to send something back.
// A request is single-use. Answering it creates an ordinary share owned by the person who
// answered; the requester gets an Accept card and joins that share like any receiver.

export interface ShareRequest<S> {
  id: string
  token: string
  ownerName: string
  want: Extract<ShareKind, "files" | "screen">
  note: string
  expiresAt: number
  socket: S | null
  used: boolean
  /** The share that answered it, once claimed. */
  sessionId: string | null
}

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000
const token = (bytes = 24) => randomBytes(bytes).toString("base64url")

export class RequestRegistry<S> {
  private requests = new Map<string, ShareRequest<S>>()
  private idempotency = new Map<string, { id: string; at: number }>()

  constructor(private max = 5000) {}

  get size() {
    return this.requests.size
  }

  get(id: string) {
    return this.requests.get(id)
  }

  create(
    input: {
      want: ShareRequest<S>["want"]
      note: string
      ownerName: string
      requestId: string
      socket: S
    },
    now = Date.now(),
  ) {
    const seen = this.idempotency.get(input.requestId)
    const existing = seen && this.requests.get(seen.id)
    if (existing) {
      existing.socket = input.socket
      return existing
    }
    if (this.requests.size >= this.max)
      throw new SessionError(
        "LIMIT_EXCEEDED",
        "Server is at capacity. Try again shortly.",
      )
    const request: ShareRequest<S> = {
      id: token(12),
      token: token(),
      ownerName: input.ownerName,
      want: input.want,
      note: input.note,
      expiresAt: now + OPEN_TTL_MS,
      socket: input.socket,
      used: false,
      sessionId: null,
    }
    this.requests.set(request.id, request)
    this.idempotency.set(input.requestId, { id: request.id, at: now })
    return request
  }

  private owned(id: string, tokenValue: string) {
    const request = this.requests.get(id)
    if (!request)
      throw new SessionError(
        "SESSION_NOT_FOUND",
        "This request has expired or was cancelled.",
      )
    if (request.token !== tokenValue)
      throw new SessionError("UNAUTHORIZED", "Not your request.")
    return request
  }

  /** The requester's socket came back after a reconnect. */
  resume(id: string, tokenValue: string, socket: S) {
    const request = this.owned(id, tokenValue)
    request.socket = socket
    return request
  }

  cancel(id: string, tokenValue: string) {
    this.owned(id, tokenValue)
    this.requests.delete(id)
  }

  /**
   * Someone answered: the first answer of the right kind uses the request up, so a leaked
   * link can't be used to send a stream of offers.
   */
  claim(id: string, kind: ShareKind, sessionId: string) {
    const request = this.requests.get(id)
    // The same answer repeated (a replayed request after a reconnect) succeeds again.
    if (request?.used && request.sessionId === sessionId) return request
    if (!request || request.used)
      throw new SessionError(
        "SESSION_NOT_FOUND",
        "This request was already answered, cancelled or has expired.",
      )
    if (request.want !== kind)
      throw new SessionError("BAD_REQUEST", "That isn’t what was asked for.")
    if (!request.socket)
      throw new SessionError(
        "PEER_NOT_FOUND",
        `${request.ownerName} isn’t online right now. Try again in a moment.`,
      )
    request.used = true
    request.sessionId = sessionId
    return request
  }

  /** The requester declined the answer `sessionId`. Returns false if that wasn't the answer. */
  decline(id: string, tokenValue: string, sessionId: string): boolean {
    const request = this.owned(id, tokenValue)
    if (request.sessionId !== sessionId) return false
    this.requests.delete(id)
    return true
  }

  detach(socket: S) {
    for (const request of this.requests.values())
      if (request.socket === socket) request.socket = null
  }

  sweep(now = Date.now()) {
    for (const [id, request] of this.requests)
      if (now > request.expiresAt) this.requests.delete(id)
    for (const [key, entry] of this.idempotency)
      if (now - entry.at > IDEMPOTENCY_TTL_MS) this.idempotency.delete(key)
  }

  preview(request: ShareRequest<S>): RequestPreview {
    return {
      requesterName: request.ownerName,
      want: request.want,
      note: request.note,
      expiresAt: request.expiresAt,
      available: !request.used,
    }
  }
}
