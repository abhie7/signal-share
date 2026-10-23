import { test } from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import {
  AWAY_GRACE_MS,
  OPEN_TTL_MS,
  SessionError,
  SessionRegistry,
} from "../server/sessions"
import { TokenBucket } from "../server/rate-limit"
import { presenceKey } from "../server/network"
import { canTransition, TERMINAL, type Phase } from "../lib/machine"
import { parseClientMessage, validateFiles, LIMITS } from "../lib/protocol"
import { backoffDelay } from "../lib/signaling"
import { safeFileName } from "../lib/utils"

const files = [{ name: "a.txt", size: 10, type: "text/plain" }]

function registry() {
  return new SessionRegistry<string>(100)
}

test("session create is idempotent per request id", () => {
  const r = registry()
  const a = r.create({
    kind: "files",
    files,
    ownerName: "A",
    requestId: "req1",
    socket: "s1",
  })
  const b = r.create({
    kind: "files",
    files,
    ownerName: "A",
    requestId: "req1",
    socket: "s2",
  })
  assert.equal(a.id, b.id)
  assert.equal(r.size, 1)
  assert.equal(a.owner.socket, "s2", "retry re-attaches the new socket")
  const c = r.create({
    kind: "files",
    files,
    ownerName: "A",
    requestId: "req2",
    socket: "s1",
  })
  assert.notEqual(c.id, a.id)
  assert.match(a.code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/)
})

test("join: single guest, idempotent retry, single-use code", () => {
  const r = registry()
  const s = r.create({
    kind: "files",
    files,
    ownerName: "A",
    requestId: "c",
    socket: "o",
  })
  const j1 = r.join({
    code: s.code,
    guestName: "B",
    requestId: "j1",
    socket: "g",
  })
  const token = j1.guest!.token
  const retry = r.join({
    sessionId: s.id,
    guestName: "B",
    requestId: "j1",
    socket: "g2",
  })
  assert.equal(retry.guest!.token, token)
  assert.throws(
    () =>
      r.join({ sessionId: s.id, guestName: "C", requestId: "j2", socket: "x" }),
    (e: SessionError) => e.code === "SESSION_FULL",
  )
  assert.throws(
    () =>
      r.join({ code: s.code, guestName: "C", requestId: "j3", socket: "x" }),
    (e: SessionError) => e.code === "INVALID_CODE",
  )
  assert.throws(
    () =>
      r.join({
        sessionId: "nope",
        guestName: "C",
        requestId: "j4",
        socket: "x",
      }),
    (e: SessionError) => e.code === "SESSION_NOT_FOUND",
  )
})

test("resume requires the right token and re-attaches", () => {
  const r = registry()
  const s = r.create({
    kind: "screen",
    files: [],
    ownerName: "A",
    requestId: "c",
    socket: "o",
  })
  r.detach("o", 1000)
  assert.equal(s.owner.socket, null)
  assert.throws(
    () => r.resume(s.id, "wrong", "o2"),
    (e: SessionError) => e.code === "UNAUTHORIZED",
  )
  const { role } = r.resume(s.id, s.owner.token, "o2")
  assert.equal(role, "owner")
  assert.equal(s.owner.socket, "o2")
  assert.equal(s.owner.awaySince, null)
})

test("sweep: unclaimed shares expire; away participants end the share after grace", () => {
  const r = registry()
  const t0 = 1_000_000
  const open = r.create(
    { kind: "files", files, ownerName: "A", requestId: "c1", socket: "o1" },
    t0,
  )
  const paired = r.create(
    { kind: "files", files, ownerName: "A", requestId: "c2", socket: "o2" },
    t0,
  )
  r.join(
    { sessionId: paired.id, guestName: "B", requestId: "j", socket: "g" },
    t0,
  )
  assert.deepEqual(r.sweep(t0 + 1000), [])
  r.detach("g", t0 + 1000)
  assert.deepEqual(r.sweep(t0 + 1000 + AWAY_GRACE_MS - 1), [])
  const ended = r.sweep(t0 + OPEN_TTL_MS + 1)
  assert.deepEqual(
    ended.map((e) => [e.session.id, e.reason]).sort(),
    [
      [open.id, "expired"],
      [paired.id, "peer_gone"],
    ].sort(),
  )
  assert.equal(r.size, 0)
})

test("end is idempotent and frees the code", () => {
  const r = registry()
  const s = r.create({
    kind: "files",
    files,
    ownerName: "A",
    requestId: "c",
    socket: "o",
  })
  assert.ok(r.end(s.id))
  assert.equal(r.end(s.id), null)
  assert.throws(() =>
    r.join({ code: s.code, guestName: "B", requestId: "j", socket: "g" }),
  )
})

test("capacity limit", () => {
  const r = new SessionRegistry<string>(1)
  r.create({
    kind: "files",
    files,
    ownerName: "A",
    requestId: "a",
    socket: "o",
  })
  assert.throws(
    () =>
      r.create({
        kind: "files",
        files,
        ownerName: "A",
        requestId: "b",
        socket: "o",
      }),
    (e: SessionError) => e.code === "LIMIT_EXCEEDED",
  )
})

test("state machine: valid paths allowed, nonsense refused, terminal is final", () => {
  const ok: Array<[Phase, Phase]> = [
    ["idle", "creating"],
    ["creating", "waiting"],
    ["waiting", "connecting"],
    ["connecting", "transferring"],
    ["transferring", "reconnecting"],
    ["reconnecting", "transferring"],
    ["transferring", "completed"],
    ["idle", "requesting_permission"],
    ["requesting_permission", "creating"],
    ["negotiating", "streaming"],
    ["streaming", "ended"],
  ]
  for (const [a, b] of ok) assert.ok(canTransition(a, b), `${a} → ${b}`)
  const bad: Array<[Phase, Phase]> = [
    ["idle", "transferring"],
    ["waiting", "completed"],
    ["completed", "transferring"],
    ["failed", "connecting"],
    ["joining", "streaming"],
  ]
  for (const [a, b] of bad) assert.ok(!canTransition(a, b), `${a} ↛ ${b}`)
  for (const t of TERMINAL) assert.ok(canTransition(t, "idle"))
})

test("protocol validation rejects malformed and oversized input", () => {
  assert.equal(parseClientMessage("nope"), null)
  assert.equal(
    parseClientMessage(
      '{"type":"session.create","id":"a","kind":"files","files":[]}',
    ),
    null,
  )
  assert.equal(
    parseClientMessage(
      '{"type":"session.create","id":"bad id!","kind":"files","files":[{"name":"a","size":1,"type":""}]}',
    ),
    null,
  )
  assert.equal(
    parseClientMessage(
      JSON.stringify({ type: "signal", sessionId: "s", data: "x" }),
    ),
    null,
  )
  assert.equal(parseClientMessage('{"type":"unknown"}'), null)
  assert.equal(parseClientMessage("x".repeat(LIMITS.maxSignalBytes + 1)), null)
  assert.deepEqual(
    parseClientMessage('{"type":"session.join","id":"a1","code":" abc-123 "}'),
    { type: "session.join", id: "a1", code: "ABC123" },
  )
  assert.equal(
    validateFiles("files", [{ name: "evil\u0000.txt", size: 1, type: "" }]),
    null,
  )
  assert.equal(
    validateFiles("files", [{ name: "a", size: -1, type: "" }]),
    null,
  )
  assert.equal(
    validateFiles("text", [
      { name: "Text", size: LIMITS.maxTextBytes + 1, type: "text/plain" },
    ]),
    null,
  )
  assert.deepEqual(validateFiles("screen", []), [])
})

test("backoff is bounded and jittered", () => {
  assert.equal(
    backoffDelay(0, 500, 15000, () => 0),
    250,
  )
  assert.equal(
    backoffDelay(20, 500, 15000, () => 0.9999),
    14998,
  )
  assert.ok(backoffDelay(3, 500, 15000, () => 0.5) <= 2000)
})

test("token bucket refills over time", () => {
  const b = new TokenBucket(2, 1, 0)
  assert.ok(b.take(1, 0))
  assert.ok(b.take(1, 0))
  assert.ok(!b.take(1, 0))
  assert.ok(b.take(1, 1000))
})

test("presence groups by exact public IP, /24 only for private ranges", () => {
  assert.equal(presenceKey("203.0.113.7"), "203.0.113.7")
  assert.notEqual(presenceKey("203.0.113.7"), presenceKey("203.0.113.8"))
  assert.equal(presenceKey("192.168.1.20"), presenceKey("::ffff:192.168.1.99"))
})

test("received file names are sanitised", () => {
  assert.equal(safeFileName("../../etc/passwd"), "_.._etc_passwd")
  assert.equal(safeFileName("a\u0000b<c>.txt"), "a_b_c_.txt")
  assert.equal(safeFileName("..."), "download")
})

test("TURN REST credentials are short-lived HMACs", async () => {
  process.env.TURN_URLS =
    "turn:turn.example.com:3478,turns:turn.example.com:443?transport=tcp"
  process.env.TURN_SECRET = "shh"
  process.env.TURN_TTL_SECONDS = "600"
  const { iceServersFor } = await import("../server/config")
  const servers = iceServersFor("peer1", 1_700_000_000_000)
  const turn = servers.find((s) => String(s.urls).includes("turn:"))!
  assert.equal(turn.username, `${1_700_000_000 + 600}:peer1`)
  assert.equal(
    turn.credential,
    createHmac("sha1", "shh").update(turn.username!).digest("base64"),
  )
})

test("keep-alive: automatic on Render in production, overridable, off elsewhere", async () => {
  const { selfPingTarget } = await import("../server/config")
  assert.equal(
    selfPingTarget({
      NODE_ENV: "production",
      RENDER_EXTERNAL_URL: "https://share.onrender.com/",
    }),
    "https://share.onrender.com/health",
  )
  assert.equal(
    selfPingTarget({
      NODE_ENV: "development",
      RENDER_EXTERNAL_URL: "https://x.onrender.com",
    }),
    null,
  )
  assert.equal(selfPingTarget({ NODE_ENV: "production" }), null)
  assert.equal(
    selfPingTarget({
      NODE_ENV: "production",
      SELF_PING_URL: "https://a.example/health",
    }),
    "https://a.example/health",
  )
  assert.equal(
    selfPingTarget({
      NODE_ENV: "production",
      RENDER_EXTERNAL_URL: "https://x.onrender.com",
      SELF_PING_URL: "",
    }),
    null,
  )
})

test("proxy trust: loopback by default, Render's balancer on Render, explicit wins", async () => {
  const { trustProxySetting } = await import("../server/config")
  assert.equal(trustProxySetting({}), "loopback")
  assert.equal(trustProxySetting({ RENDER: "true" }), true)
  assert.equal(
    trustProxySetting({ RENDER: "true", TRUST_PROXY: "false" }),
    false,
  )
  assert.deepEqual(
    trustProxySetting({ TRUST_PROXY: "10.0.0.0/8, 127.0.0.1" }),
    ["10.0.0.0/8", "127.0.0.1"],
  )
})
