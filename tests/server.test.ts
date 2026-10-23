import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import WebSocket from "ws"
import { buildApp } from "../server/app"
import {
  PROTOCOL_VERSION,
  type ServerMessage,
  type SessionView,
} from "../lib/protocol"

let base = ""
let app: Awaited<ReturnType<typeof buildApp>>

before(async () => {
  app = await buildApp({ logger: false })
  await app.fastify.listen({ port: 0, host: "127.0.0.1" })
  app.markReady()
  const addr = app.fastify.server.address() as { port: number }
  base = `127.0.0.1:${addr.port}`
})
after(() => app.shutdown())

async function client(
  opts: { origin?: string; v?: number; headers?: Record<string, string> } = {},
) {
  const ws = new WebSocket(`ws://${base}/api/ws`, {
    headers: {
      ...(opts.origin ? { origin: opts.origin } : {}),
      ...opts.headers,
    },
  })
  const inbox: ServerMessage[] = []
  const waiters: Array<{
    match: (m: ServerMessage) => boolean
    resolve: (m: ServerMessage) => void
  }> = []
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString()) as ServerMessage
    const i = waiters.findIndex((w) => w.match(m))
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m)
    else inbox.push(m)
  })
  const next = <T extends ServerMessage>(
    match: (m: ServerMessage) => boolean,
    ms = 2000,
  ) =>
    new Promise<T>((resolve, reject) => {
      const i = inbox.findIndex(match)
      if (i >= 0) return resolve(inbox.splice(i, 1)[0] as T)
      const timer = setTimeout(
        () => reject(new Error("timeout waiting for message")),
        ms,
      )
      waiters.push({
        match,
        resolve: (m) => (clearTimeout(timer), resolve(m as T)),
      })
    })
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve())
    ws.once("error", reject)
  })
  ws.send(JSON.stringify({ type: "hello", v: opts.v ?? PROTOCOL_VERSION }))
  const closed = new Promise<number>((r) => ws.once("close", (code) => r(code)))
  let n = 0
  const request = async <T = unknown>(msg: Record<string, unknown>) => {
    const id =
      (msg.id as string) ?? `r${++n}${Math.random().toString(36).slice(2, 8)}`
    ws.send(JSON.stringify({ ...msg, id }))
    const reply = await next<Extract<ServerMessage, { type: "reply" }>>(
      (m) => m.type === "reply" && m.re === id,
    )
    if (!reply.ok)
      throw Object.assign(new Error(reply.error.message), {
        code: reply.error.code,
      })
    return reply.data as T
  }
  return {
    ws,
    next,
    request,
    closed,
    send: (m: object) => ws.send(JSON.stringify(m)),
    welcome: () => next((m) => m.type === "welcome"),
  }
}

const files = [{ name: "photo.jpg", size: 1234, type: "image/jpeg" }]

async function pair() {
  const owner = await client()
  await owner.welcome()
  const guest = await client()
  await guest.welcome()
  const o = await owner.request<SessionView>({
    type: "session.create",
    kind: "files",
    files,
  })
  const g = await guest.request<SessionView>({
    type: "session.join",
    code: o.code,
  })
  return { owner, guest, o, g }
}

test("welcome carries ICE config and no secrets beyond the caller’s own", async () => {
  const c = await client()
  const w = await c.welcome()
  assert.equal(w.type, "welcome")
  if (w.type === "welcome") {
    assert.equal(w.v, PROTOCOL_VERSION)
    assert.ok(Array.isArray(w.iceServers))
    assert.equal(w.relay, true)
  }
  c.ws.close()
})

test("duplicate create requests return one session", async () => {
  const c = await client()
  await c.welcome()
  const a = await c.request<SessionView>({
    type: "session.create",
    id: "dupe1",
    kind: "files",
    files,
  })
  const b = await c.request<SessionView>({
    type: "session.create",
    id: "dupe1",
    kind: "files",
    files,
  })
  assert.equal(a.sessionId, b.sessionId)
  assert.equal(a.token, b.token)
  c.ws.close()
})

test("join by code notifies the owner, rejects a second device, routes signals only within the session", async () => {
  const { owner, guest, o, g } = await pair()
  assert.equal(g.role, "guest")
  assert.deepEqual(g.files, files)
  const joined = await owner.next((m) => m.type === "peer")
  assert.equal(joined.type === "peer" && joined.state, "joined")

  const intruder = await client()
  await intruder.welcome()
  await assert.rejects(
    intruder.request({ type: "session.join", sessionId: o.sessionId }),
    (e: Error & { code: string }) => e.code === "SESSION_FULL",
  )
  await assert.rejects(
    intruder.request({ type: "session.join", code: o.code }),
    (e: Error & { code: string }) => e.code === "INVALID_CODE",
  )

  guest.send({
    type: "signal",
    sessionId: o.sessionId,
    data: { k: "connect", a: 1 },
  })
  const sig = await owner.next((m) => m.type === "signal")
  assert.deepEqual(sig.type === "signal" && sig.data, { k: "connect", a: 1 })

  intruder.send({ type: "signal", sessionId: o.sessionId, data: { k: "evil" } })
  await assert.rejects(
    owner.next((m) => m.type === "signal" && m.data.k === "evil", 300),
  )
  for (const c of [owner, guest, intruder]) c.ws.close()
})

test("a participant dropping is reported as away, not as the share ending", async () => {
  const { owner, guest, o } = await pair()
  await owner.next((m) => m.type === "peer")
  guest.ws.close()
  const away = await owner.next((m) => m.type === "peer")
  assert.equal(away.type === "peer" && away.state, "away")
  assert.equal(
    (await fetch(`http://${base}/api/sessions/${o.sessionId}`)).status,
    200,
    "share still exists during the grace period",
  )
  owner.ws.close()
})

test("resume with the guest token re-attaches", async () => {
  const { owner, guest, o, g } = await pair()
  await owner.next((m) => m.type === "peer")
  guest.ws.close()
  await owner.next((m) => m.type === "peer" && m.state === "away")
  const back = await client()
  await back.welcome()
  const view = await back.request<SessionView>({
    type: "session.resume",
    sessionId: o.sessionId,
    token: g.token,
  })
  assert.equal(view.role, "guest")
  const msg = await owner.next((m) => m.type === "peer")
  assert.equal(msg.type === "peer" && msg.state, "back")
  await assert.rejects(
    back.request({
      type: "session.resume",
      sessionId: o.sessionId,
      token: "notthetoken",
    }),
    (e: Error & { code: string }) => e.code === "UNAUTHORIZED",
  )
  owner.ws.close()
  back.ws.close()
})

test("leave ends the share for both, is idempotent, and reports failures distinctly", async () => {
  const { owner, guest, o, g } = await pair()
  await guest.request({
    type: "session.leave",
    sessionId: g.sessionId,
    token: g.token,
    failed: true,
  })
  const ended = await owner.next((m) => m.type === "ended")
  assert.equal(ended.type === "ended" && ended.reason, "peer_failed")
  await owner.request({
    type: "session.leave",
    sessionId: o.sessionId,
    token: o.token,
  })
  await owner.request({
    type: "session.leave",
    sessionId: o.sessionId,
    token: o.token,
  })
  const res = await fetch(`http://${base}/api/sessions/${o.sessionId}`)
  assert.equal(res.status, 404)
  owner.ws.close()
  guest.ws.close()
})

test("preview exposes what the recipient needs and nothing secret", async () => {
  const owner = await client()
  await owner.welcome()
  const o = await owner.request<SessionView>({
    type: "session.create",
    kind: "files",
    files,
  })
  const res = await fetch(`http://${base}/api/sessions/${o.sessionId}`)
  const body = await res.json()
  assert.equal(res.headers.get("cache-control"), "no-store")
  assert.deepEqual(Object.keys(body).sort(), [
    "available",
    "expiresAt",
    "files",
    "kind",
    "senderName",
    "totalSize",
  ])
  assert.equal((await fetch(`http://${base}/api/sessions/unknown`)).status, 404)
  owner.ws.close()
})

test("relay pipes frames only between authenticated participants", async () => {
  const { owner, guest, o, g } = await pair()
  const open = (token: string) =>
    new Promise<{
      ws: WebSocket
      messages: Array<{ data: Buffer; binary: boolean }>
      closed: Promise<number>
    }>((resolve) => {
      const ws = new WebSocket(`ws://${base}/api/relay?session=${o.sessionId}`)
      const messages: Array<{ data: Buffer; binary: boolean }> = []
      const closed = new Promise<number>((r) =>
        ws.on("close", (code) => r(code)),
      )
      ws.on("message", (data, binary) =>
        messages.push({ data: data as Buffer, binary }),
      )
      ws.on("open", () => {
        ws.send(JSON.stringify({ token }))
        resolve({ ws, messages, closed })
      })
    })

  const bad = await open("wrong-token")
  assert.equal(await bad.closed, 4003)

  const a = await open(o.token)
  const b = await open(g.token)
  const until = async (cond: () => boolean) => {
    for (let i = 0; i < 100 && !cond(); i++)
      await new Promise((r) => setTimeout(r, 10))
    assert.ok(cond())
  }
  await until(() => a.messages.length > 0 && b.messages.length > 0)
  assert.match(a.messages[0].data.toString(), /paired/)

  a.ws.send(Buffer.from([1, 2, 3]))
  b.ws.send('{"t":"ack"}')
  await until(() => b.messages.length > 1 && a.messages.length > 1)
  assert.deepEqual([...b.messages[1].data], [1, 2, 3])
  assert.equal(b.messages[1].binary, true)
  assert.equal(a.messages[1].data.toString(), '{"t":"ack"}')

  // One side leaving the relay closes the other so both re-establish.
  a.ws.close()
  assert.equal(await b.closed, 4001)
  owner.ws.close()
  guest.ws.close()
})

test("malformed messages get an error; the connection survives", async () => {
  const c = await client()
  await c.welcome()
  c.ws.send("{not json")
  const err = await c.next((m) => m.type === "reply" && !m.ok)
  assert.equal(err.type === "reply" && !err.ok && err.error.code, "BAD_REQUEST")
  c.send({ type: "ping" })
  assert.equal((await c.next((m) => m.type === "pong")).type, "pong")
  c.ws.close()
})

test("old clients are told to reload", async () => {
  const c = await client({ v: 1 })
  assert.equal(await c.closed, 4400)
})

test("cross-origin WebSocket upgrades are refused", async () => {
  await assert.rejects(client({ origin: "https://evil.example" }))
})

test("nearby invites only reach devices on the same network", async () => {
  const { owner, guest, o } = await pair()
  const other = await client()
  const w = await other.welcome()
  const peerId = w.type === "welcome" ? w.peerId : ""
  await owner.request({
    type: "session.invite",
    sessionId: o.sessionId,
    peerId,
  })
  const inv = await other.next((m) => m.type === "invite")
  assert.equal(inv.type === "invite" && inv.sessionId, o.sessionId)
  await assert.rejects(
    guest.request({ type: "session.invite", sessionId: o.sessionId, peerId }),
    (e: Error & { code: string }) => e.code === "UNAUTHORIZED",
  )
  for (const c of [owner, guest, other]) c.ws.close()
})

test("health and readiness", async () => {
  assert.equal((await fetch(`http://${base}/health`)).status, 200)
  const ready = await fetch(`http://${base}/ready`)
  assert.equal(ready.status, 200)
})

test("behind a local tunnel: forwarded host is accepted and each visitor keeps their own IP", async () => {
  const tunnel = (ip: string) =>
    client({
      origin: "https://abc.trycloudflare.com",
      headers: {
        "x-forwarded-host": "abc.trycloudflare.com",
        "x-forwarded-for": ip,
      },
    })
  const a = await tunnel("203.0.113.9")
  await a.welcome()
  const b = await tunnel("198.51.100.4")
  await b.welcome()
  const c = await tunnel("203.0.113.9")
  await c.welcome()
  // c shares a's public IP (same network); b is elsewhere and must not appear.
  const seen = await a.next((m) => m.type === "presence" && m.peers.length > 0)
  assert.equal(seen.type === "presence" && seen.peers.length, 1)
  for (const x of [a, b, c]) x.ws.close()
})

test("a foreign origin is still refused even with forwarded headers", async () => {
  await assert.rejects(
    client({
      origin: "https://evil.example",
      headers: { "x-forwarded-host": "abc.trycloudflare.com" },
    }),
  )
})

test("repo link: star count fetched server-side, cached, and resilient to GitHub failures", async () => {
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).startsWith("https://api.github.com/"))
      return realFetch(input, init)
    calls++
    throw new Error("offline")
  }) as typeof fetch
  try {
    const get = async () => (await realFetch(`http://${base}/api/repo`)).json()
    const first = await get()
    assert.equal(first.url, "https://github.com/abhie7/signal-share")
    assert.equal(first.stars, null, "GitHub down: link still shown, no count")
    assert.equal(calls, 1)
    const again = await get()
    assert.equal(calls, 1, "a failure is not retried on every request")
    assert.equal(again.stars, null)
  } finally {
    globalThis.fetch = realFetch
  }
})
