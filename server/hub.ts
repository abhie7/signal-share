import { randomBytes } from "node:crypto"
import type { WebSocket, RawData } from "ws"
import type { FastifyBaseLogger } from "fastify"
import {
  PROTOCOL_VERSION,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from "../lib/protocol.js"
import { config, iceServersFor, turnConfigured } from "./config.js"
import { generateName } from "./names.js"
import { presenceKey } from "./network.js"
import { KeyedLimiter, TokenBucket } from "./rate-limit.js"
import {
  SessionError,
  SessionRegistry,
  type Role,
  type Session,
} from "./sessions.js"
import { RequestRegistry } from "./requests.js"
import { wake } from "./push.js"
import type { DeviceKind } from "../lib/device.js"

const IDLE_TIMEOUT_MS = 60_000
const RELAY_HIGH_WATER = 16 * 1024 * 1024
const RELAY_LOW_WATER = 2 * 1024 * 1024

interface Client {
  id: string
  name: string
  device: DeviceKind
  /** Pair ids this device announced (derived from secrets only the paired devices hold). */
  pairs: Set<string>
  /** Push endpoint for waking this device later, if it allowed notifications. */
  endpoint: string | null
  ip: string
  key: string
  socket: WebSocket
  lastSeen: number
  bucket: TokenBucket
  greeted: boolean
}

interface RelayRoom {
  owner?: WebSocket
  guest?: WebSocket
}

const OPEN = 1

export class Hub {
  readonly registry = new SessionRegistry<WebSocket>(config.maxSessions)
  readonly requests = new RequestRegistry<WebSocket>(config.maxSessions)
  private clients = new Map<WebSocket, Client>()
  private byId = new Map<string, Client>()
  private ipCounts = new Map<string, number>()
  private joinLimiter = new KeyedLimiter(20, 20 / 60)
  private createLimiter = new KeyedLimiter(30, 30 / 60)
  private rooms = new Map<string, RelayRoom>()
  /** pairId → devices online with it. */
  private pairs = new Map<string, Set<Client>>()
  /** pairId → push endpoints of its devices, kept after they go offline (memory only). */
  private wakeups = new Map<string, Set<string>>()
  private wakeLimiter = new KeyedLimiter(2, 1 / 30)
  readonly metrics: Record<string, number> = {}
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private log: FastifyBaseLogger) {}

  start() {
    this.timer = setInterval(() => this.sweep(), 5000)
    this.timer.unref?.()
  }

  count(name: string, by = 1) {
    this.metrics[name] = (this.metrics[name] ?? 0) + by
  }

  get connections() {
    return this.clients.size
  }

  // ── Signaling ──────────────────────────────────────────────────────────────

  accept(socket: WebSocket, ip: string) {
    const n = this.ipCounts.get(ip) ?? 0
    if (n >= config.maxSocketsPerIp) {
      this.count("ws.rejected_ip_limit")
      socket.close(4429, "Too many connections")
      return
    }
    this.ipCounts.set(ip, n + 1)

    const client: Client = {
      id: randomBytes(9).toString("base64url"),
      name: generateName(),
      device: "other",
      pairs: new Set(),
      endpoint: null,
      ip,
      key: presenceKey(ip),
      socket,
      lastSeen: Date.now(),
      // ICE candidate bursts are legitimate; sustained floods are not.
      bucket: new TokenBucket(200, 50),
      greeted: false,
    }
    this.clients.set(socket, client)
    this.count("ws.connected")

    socket.on("message", (raw: RawData, isBinary: boolean) => {
      client.lastSeen = Date.now()
      if (isBinary || !client.bucket.take()) {
        if (!isBinary) this.count("ws.rate_limited")
        return
      }
      const msg = parseClientMessage(raw.toString())
      if (!msg) {
        this.count("ws.malformed")
        this.send(socket, {
          type: "reply",
          re: "",
          ok: false,
          error: { code: "BAD_REQUEST", message: "Malformed message" },
        })
        return
      }
      try {
        this.handle(client, msg)
      } catch (err) {
        this.log.error(
          { err, peer: client.id, type: msg.type },
          "signaling handler failed",
        )
        if ("id" in msg)
          this.fail(socket, msg.id, "INTERNAL", "Something went wrong")
      }
    })
    socket.on("close", () => this.drop(client))
    socket.on("error", (err) =>
      this.log.warn({ err: err.message, peer: client.id }, "ws error"),
    )
  }

  private handle(c: Client, msg: ClientMessage) {
    if (msg.type === "ping") return this.send(c.socket, { type: "pong" })

    if (msg.type === "hello") {
      if (Math.floor(msg.v) !== PROTOCOL_VERSION) {
        this.fail(
          c.socket,
          "hello",
          "UNSUPPORTED_VERSION",
          "Please reload : SignalShare was updated.",
        )
        c.socket.close(4400, "Unsupported protocol version")
        return
      }
      if (msg.name) c.name = msg.name
      if (msg.device) c.device = msg.device
      const first = !c.greeted
      c.greeted = true
      this.byId.set(c.id, c)
      this.send(c.socket, {
        type: "welcome",
        v: PROTOCOL_VERSION,
        peerId: c.id,
        name: c.name,
        iceServers: iceServersFor(c.id),
        iceTransportPolicy: config.iceTransportPolicy,
        relay: config.relayEnabled,
        turn: turnConfigured,
        publicUrl: config.publicUrl,
        vapidKey: config.vapid?.publicKey ?? null,
      })
      if (first) this.broadcastPresence(c.key)
      return
    }

    if (!c.greeted)
      return this.send(c.socket, {
        type: "reply",
        re: "",
        ok: false,
        error: { code: "BAD_REQUEST", message: "hello first" },
      })

    switch (msg.type) {
      case "rename":
        c.name = msg.name
        return this.broadcastPresence(c.key)

      case "session.create": {
        if (!this.createLimiter.take(c.ip))
          return this.fail(
            c.socket,
            msg.id,
            "RATE_LIMITED",
            "Too many shares. Wait a moment.",
          )
        const session = this.registry.create({
          kind: msg.kind,
          files: msg.files,
          ownerName: c.name,
          ownerDevice: c.device,
          requestId: msg.id,
          socket: c.socket,
        })
        this.count("session.created")
        this.log.info(
          {
            event: "session.created",
            logId: session.logId,
            kind: session.kind,
            files: session.files.length,
            bytes: session.totalSize,
          },
          "session",
        )
        return this.ok(c.socket, msg.id, this.registry.view(session, "owner"))
      }

      case "session.join": {
        if (!this.joinLimiter.take(c.ip))
          return this.fail(
            c.socket,
            msg.id,
            "RATE_LIMITED",
            "Too many attempts. Wait a minute and try again.",
          )
        return this.guard(c.socket, msg.id, () => {
          const session = this.registry.join({
            code: msg.code,
            sessionId: msg.sessionId,
            guestName: c.name,
            guestDevice: c.device,
            requestId: msg.id,
            socket: c.socket,
          })
          this.count("session.joined")
          this.log.info(
            {
              event: "session.joined",
              logId: session.logId,
              via: msg.code ? "code" : "link",
            },
            "session",
          )
          this.notify(session, "guest", {
            type: "peer",
            sessionId: session.id,
            state: "joined",
            name: c.name,
            device: c.device,
          })
          return this.registry.view(session, "guest")
        })
      }

      case "session.resume":
        return this.guard(c.socket, msg.id, () => {
          const { session, role } = this.registry.resume(
            msg.sessionId,
            msg.token,
            c.socket,
          )
          this.count("session.resumed")
          this.log.info(
            { event: "session.resumed", logId: session.logId, role },
            "session",
          )
          if (this.registry.other(session, role))
            this.notify(session, role, {
              type: "peer",
              sessionId: session.id,
              state: "back",
              name: c.name,
              device: c.device,
            })
          return this.registry.view(session, role)
        })

      case "session.leave":
        this.leave(msg.sessionId, msg.token, msg.failed)
        return this.ok(c.socket, msg.id, null)

      case "session.invite": {
        const session = this.registry.get(msg.sessionId)
        if (
          !session ||
          this.registry.roleOfSocket(session, c.socket) !== "owner"
        )
          return this.fail(c.socket, msg.id, "UNAUTHORIZED", "Not your share")
        const target = this.byId.get(msg.peerId)
        // Only devices on the same network, or paired with us, can be invited: no unsolicited
        // prompts to strangers.
        const pairId =
          msg.pairId && c.pairs.has(msg.pairId) && target?.pairs.has(msg.pairId)
            ? msg.pairId
            : null
        if (!target || target === c || (target.key !== c.key && !pairId))
          return this.fail(
            c.socket,
            msg.id,
            "PEER_NOT_FOUND",
            "That device is no longer nearby.",
          )
        this.send(target.socket, {
          type: "invite",
          sessionId: session.id,
          from: c.name,
          fromDevice: c.device,
          pairId,
          kind: session.kind,
          files: session.files,
          totalSize: session.totalSize,
        })
        return this.ok(c.socket, msg.id, null)
      }

      case "session.expire":
        return this.guard(c.socket, msg.id, () => {
          const session = this.registry.setExpiry(
            msg.sessionId,
            msg.token,
            msg.minutes,
          )
          return this.registry.view(session, "owner")
        })

      case "request.create": {
        if (!this.createLimiter.take(c.ip))
          return this.fail(
            c.socket,
            msg.id,
            "RATE_LIMITED",
            "Too many requests. Wait a moment.",
          )
        return this.guard(c.socket, msg.id, () => {
          const r = this.requests.create({
            want: msg.want,
            note: msg.note,
            ownerName: c.name,
            requestId: msg.id,
            socket: c.socket,
          })
          this.count("request.created")
          return {
            requestId: r.id,
            token: r.token,
            want: r.want,
            note: r.note,
            expiresAt: r.expiresAt,
          }
        })
      }

      case "request.resume":
        return this.guard(c.socket, msg.id, () => {
          this.requests.resume(msg.requestId, msg.token, c.socket)
          return null
        })

      case "request.cancel":
        return this.guard(c.socket, msg.id, () => {
          this.requests.cancel(msg.requestId, msg.token)
          return null
        })

      case "request.fulfil":
        return this.guard(c.socket, msg.id, () => {
          const session = this.registry.get(msg.sessionId)
          if (
            !session ||
            session.guest ||
            this.registry.roleOfSocket(session, c.socket) !== "owner"
          )
            throw new SessionError("UNAUTHORIZED", "Not your share.")
          const r = this.requests.claim(msg.requestId, session.kind, session.id)
          this.count("request.answered")
          this.send(r.socket!, {
            type: "requested",
            requestId: r.id,
            sessionId: session.id,
            keyed: msg.keyed,
            from: c.name,
            kind: session.kind,
            files: session.files,
            totalSize: session.totalSize,
          })
          return null
        })

      case "request.decline":
        return this.guard(c.socket, msg.id, () => {
          // Only the share that answered this request can be ended this way.
          const answered = this.requests.decline(
            msg.requestId,
            msg.token,
            msg.sessionId,
          )
          const session = answered && this.registry.get(msg.sessionId)
          if (session && !session.guest) {
            this.registry.end(session.id)
            if (session.owner.socket)
              this.send(session.owner.socket, {
                type: "ended",
                sessionId: session.id,
                reason: "declined",
              })
          }
          this.count("request.declined")
          return null
        })

      case "pair.announce":
        return this.announcePairs(c, new Set(msg.pairIds))

      case "pair.forget": {
        if (!c.pairs.has(msg.pairId)) return
        for (const other of this.pairs.get(msg.pairId) ?? [])
          if (other !== c)
            this.send(other.socket, { type: "unpaired", pairId: msg.pairId })
        this.wakeups.delete(msg.pairId)
        const next = new Set(c.pairs)
        next.delete(msg.pairId)
        return this.announcePairs(c, next)
      }

      case "push.register":
        c.endpoint = msg.endpoint
        for (const id of c.pairs) this.rememberWakeup(id, msg.endpoint)
        return

      case "pair.wake": {
        if (!c.pairs.has(msg.pairId) || !config.vapid)
          return this.fail(c.socket, msg.id, "UNAUTHORIZED", "Not paired.")
        if (!this.wakeLimiter.take(msg.pairId))
          return this.fail(
            c.socket,
            msg.id,
            "RATE_LIMITED",
            "Already sent. Give it a moment.",
          )
        const targets = [...(this.wakeups.get(msg.pairId) ?? [])].filter(
          (e) => e !== c.endpoint,
        )
        const vapid = config.vapid
        void Promise.all(targets.map((e) => wake(vapid, e))).then((sent) => {
          this.count("push.sent", sent.filter(Boolean).length)
          if (sent.some(Boolean)) this.ok(c.socket, msg.id, null)
          else
            this.fail(
              c.socket,
              msg.id,
              "PEER_NOT_FOUND",
              "That device can’t be woken up. Open SignalShare on it once with notifications allowed.",
            )
        })
        return
      }

      case "signal": {
        const session = this.registry.get(msg.sessionId)
        const role = session && this.registry.roleOfSocket(session, c.socket)
        if (!session || !role) return this.count("signal.unauthorized")
        const peer = this.registry.other(session, role)?.socket
        if (peer)
          this.send(peer, {
            type: "signal",
            sessionId: session.id,
            data: msg.data,
          })
        else this.count("signal.dropped_peer_away")
        return
      }

      case "telemetry":
        this.count(`client.${msg.event}`)
        this.log.info(
          { event: `client.${msg.event}`, peer: c.id, ...msg.data },
          "telemetry",
        )
        return
    }
  }

  /** Ends a share. Idempotent: unknown sessions and repeated calls are no-ops. */
  leave(sessionId: string, token: string, failed = false): boolean {
    const session = this.registry.get(sessionId)
    if (!session) return true
    const role = this.registry.roleOf(session, token)
    if (!role) return false
    this.registry.end(sessionId)
    this.closeRoom(sessionId, 4001, "Share ended")
    const reason = failed ? "peer_failed" : "left"
    this.notify(session, role, { type: "ended", sessionId, reason })
    this.count(`session.${reason}`)
    this.log.info(
      { event: "session.ended", logId: session.logId, reason, by: role },
      "session",
    )
    return true
  }

  private drop(c: Client) {
    this.clients.delete(c.socket)
    if (this.byId.get(c.id) === c) this.byId.delete(c.id)
    const n = (this.ipCounts.get(c.ip) ?? 1) - 1
    if (n <= 0) this.ipCounts.delete(c.ip)
    else this.ipCounts.set(c.ip, n)
    this.requests.detach(c.socket)
    if (c.greeted) this.announcePairs(c, new Set())
    for (const { session, role } of this.registry.detach(c.socket)) {
      this.notify(session, role, {
        type: "peer",
        sessionId: session.id,
        state: "away",
        name: c.name,
        device: c.device,
      })
    }
    if (c.greeted) this.broadcastPresence(c.key)
  }

  private sweep() {
    const now = Date.now()
    for (const c of this.clients.values()) {
      if (now - c.lastSeen > IDLE_TIMEOUT_MS) {
        this.count("ws.idle_timeout")
        c.socket.terminate()
      }
    }
    for (const { session, reason } of this.registry.sweep(now)) {
      this.closeRoom(session.id, 4001, "Share ended")
      for (const seat of [session.owner, session.guest]) {
        if (seat?.socket)
          this.send(seat.socket, {
            type: "ended",
            sessionId: session.id,
            reason,
          })
      }
      this.count(`session.${reason}`)
      this.log.info(
        { event: "session.ended", logId: session.logId, reason },
        "session",
      )
    }
    this.requests.sweep(now)
    this.joinLimiter.prune()
    this.wakeLimiter.prune()
    this.createLimiter.prune()
  }

  shutdown() {
    if (this.timer) clearInterval(this.timer)
    for (const c of this.clients.values())
      c.socket.close(1012, "Server restarting")
    for (const id of this.rooms.keys())
      this.closeRoom(id, 1012, "Server restarting")
  }

  private broadcastPresence(key: string) {
    const group = [...this.byId.values()].filter((c) => c.key === key)
    for (const c of group) {
      const peers = group
        .filter((p) => p !== c)
        .slice(0, 50)
        .map((p) => ({ id: p.id, name: p.name, device: p.device }))
      this.send(c.socket, { type: "presence", peers })
    }
  }

  private rememberWakeup(pairId: string, endpoint: string) {
    let set = this.wakeups.get(pairId)
    if (!set) this.wakeups.set(pairId, (set = new Set()))
    set.add(endpoint)
    // A pair has two devices; a few endpoints cover re-subscriptions. Keep the newest.
    if (set.size > 4) set.delete(set.values().next().value!)
  }

  /** Updates which pairs a device is in, and tells everyone affected who is online. */
  private announcePairs(c: Client, next: Set<string>) {
    const touched = new Set([...c.pairs, ...next])
    for (const id of c.pairs)
      if (!next.has(id)) {
        this.pairs.get(id)?.delete(c)
        if (!this.pairs.get(id)?.size) this.pairs.delete(id)
      }
    for (const id of next) {
      let set = this.pairs.get(id)
      if (!set) this.pairs.set(id, (set = new Set()))
      set.add(c)
      if (c.endpoint) this.rememberWakeup(id, c.endpoint)
    }
    c.pairs = next
    const affected = new Set<Client>([c])
    for (const id of touched)
      for (const other of this.pairs.get(id) ?? []) affected.add(other)
    for (const member of affected) {
      if (member.socket.readyState !== OPEN) continue
      const online = [...member.pairs].flatMap((id) =>
        [...(this.pairs.get(id) ?? [])]
          .filter((o) => o !== member)
          .map((o) => ({
            pairId: id,
            peerId: o.id,
            name: o.name,
            device: o.device,
          })),
      )
      this.send(member.socket, { type: "pairs", online })
    }
  }

  private notify(session: Session<WebSocket>, from: Role, msg: ServerMessage) {
    const peer = this.registry.other(session, from)?.socket
    if (peer) this.send(peer, msg)
  }

  private guard(socket: WebSocket, id: string, fn: () => unknown) {
    try {
      this.ok(socket, id, fn())
    } catch (err) {
      if (err instanceof SessionError) {
        this.count(`error.${err.code}`)
        return this.fail(socket, id, err.code, err.message)
      }
      throw err
    }
  }

  private ok(socket: WebSocket, re: string, data: unknown) {
    this.send(socket, { type: "reply", re, ok: true, data })
  }

  private fail(
    socket: WebSocket,
    re: string,
    code: ErrorCode,
    message: string,
  ) {
    this.send(socket, {
      type: "reply",
      re,
      ok: false,
      error: { code, message },
    })
  }

  private send(socket: WebSocket, msg: ServerMessage) {
    if (socket.readyState === OPEN) socket.send(JSON.stringify(msg))
  }

  // ── Relay ─────────────────────────────────────────────────────────────────
  // Pipes frames between the two participants of a claimed share. Payloads are end-to-end
  // encrypted by the clients; the server only sees ciphertext and frame sizes.

  /** The participant token arrives as the first frame (never in the URL, which ends up in logs). */
  acceptRelay(socket: WebSocket, sessionId: string) {
    const timer = setTimeout(() => socket.close(4003, "Auth timeout"), 5000)
    socket.once("message", (raw: RawData, isBinary: boolean) => {
      clearTimeout(timer)
      let token = ""
      try {
        token = isBinary ? "" : String(JSON.parse(raw.toString()).token ?? "")
      } catch {}
      this.joinRelay(socket, sessionId, token)
    })
    socket.on("error", () => {})
  }

  private joinRelay(socket: WebSocket, sessionId: string, token: string) {
    const session = this.registry.get(sessionId)
    const role = session ? this.registry.roleOf(session, token) : null
    if (!config.relayEnabled || !session || !role || !session.guest) {
      this.count("relay.rejected")
      socket.close(4003, "Not allowed")
      return
    }

    let room = this.rooms.get(sessionId)
    if (!room) this.rooms.set(sessionId, (room = {}))
    room[role]?.close(4000, "Replaced")
    room[role] = socket
    this.count("relay.connected")

    const peerOf = () => (role === "owner" ? room!.guest : room!.owner)
    if (room.owner?.readyState === OPEN && room.guest?.readyState === OPEN) {
      const hello = JSON.stringify({ relay: "paired" })
      room.owner.send(hello)
      room.guest.send(hello)
      this.log.info({ event: "relay.paired", logId: session.logId }, "relay")
    }

    socket.on("message", (data: RawData, isBinary: boolean) => {
      const peer = peerOf()
      if (!peer || peer.readyState !== OPEN) return
      const size = Array.isArray(data)
        ? data.reduce((n, b) => n + b.length, 0)
        : (data as Buffer).byteLength
      session.relayBytes += size
      if (session.relayBytes > config.relayMaxBytes) {
        this.count("relay.limit_reached")
        this.closeRoom(sessionId, 4002, "Relay limit reached")
        return
      }
      peer.send(data, { binary: isBinary })
      // Server-side backpressure in case a client ignores the protocol's ack window.
      if (peer.bufferedAmount > RELAY_HIGH_WATER) {
        socket.pause()
        const poll = setInterval(() => {
          if (
            peer.readyState !== OPEN ||
            peer.bufferedAmount < RELAY_LOW_WATER
          ) {
            clearInterval(poll)
            socket.resume()
          }
        }, 25)
      }
    })

    socket.on("close", () => {
      if (room![role] !== socket) return
      delete room![role]
      // A half-open relay is useless: close the other side so both clients re-establish.
      peerOf()?.close(4001, "Peer left relay")
      if (!room!.owner && !room!.guest) this.rooms.delete(sessionId)
    })
  }

  private closeRoom(sessionId: string, code: number, reason: string) {
    const room = this.rooms.get(sessionId)
    if (!room) return
    this.rooms.delete(sessionId)
    room.owner?.close(code, reason)
    room.guest?.close(code, reason)
  }
}
