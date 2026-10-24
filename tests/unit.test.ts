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

test("screen share SDP: start bitrate added to every video codec, audio untouched", async () => {
  const { withStartBitrate } = await import("../lib/transfer/rtc")
  const sdp = [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "m=video 9 UDP/TLS/RTP/SAVPF 96 98 102 97",
    "a=rtpmap:96 VP8/90000",
    "a=rtpmap:98 VP9/90000",
    "a=fmtp:98 profile-id=0",
    "a=rtpmap:102 H264/90000",
    "a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f",
    "a=rtpmap:97 rtx/90000",
    "a=fmtp:97 apt=96",
    "",
  ].join("\r\n")
  const out = withStartBitrate(sdp, 4000)
  assert.match(
    out,
    /a=rtpmap:96 VP8\/90000\r\na=fmtp:96 x-google-start-bitrate=4000/,
  )
  assert.match(out, /a=fmtp:98 profile-id=0;x-google-start-bitrate=4000/)
  assert.match(out, /profile-level-id=42e01f;x-google-start-bitrate=4000/)
  assert.match(
    out,
    /a=fmtp:111 minptime=10;useinbandfec=1\r\n/,
    "audio untouched",
  )
  assert.match(out, /a=fmtp:97 apt=96\r\n/, "rtx untouched")
  assert.equal(withStartBitrate(out, 4000), out, "idempotent")
})

test("hero shuffle bag: every phrase once per round, never back-to-back, first fixed", async () => {
  const { shuffleBag } = await import("../lib/shuffle")
  const words = Array.from({ length: 40 }, (_, i) => `w${i}`)
  for (let seed = 1; seed <= 50; seed++) {
    let x = seed
    const random = () =>
      (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x80000000
    const seq = shuffleBag(words, 6, random)
    assert.equal(seq.length, 240)
    assert.equal(seq[0], "w0")
    for (let r = 0; r < 6; r++)
      assert.equal(
        new Set(seq.slice(r * 40, r * 40 + 40)).size,
        40,
        "no repeats within a round",
      )
    for (let i = 1; i < seq.length; i++)
      assert.notEqual(seq[i], seq[i - 1], "no back-to-back repeat")
    assert.notEqual(seq.at(-1), seq[0], "loop wrap has no repeat")
  }
})

test("expiry: owner can change it while unclaimed; a late claim still gets the full lifetime", () => {
  const r = registry()
  const t0 = 1_000_000
  const s = r.create(
    { kind: "files", files, ownerName: "A", requestId: "e1", socket: "s1" },
    t0,
  )
  assert.throws(
    () => r.setExpiry(s.id, "wrong", 60, t0),
    (e: unknown) => e instanceof SessionError && e.code === "UNAUTHORIZED",
  )
  r.setExpiry(s.id, s.owner.token, 1440, t0)
  assert.equal(s.expiresAt, t0 + 1440 * 60_000)
  // Claimed 20 h later: must not be swept as expired.
  const late = t0 + 20 * 3600_000
  r.join({ code: s.code, guestName: "B", requestId: "e2", socket: "s2" }, late)
  assert.equal(r.sweep(late + 1000).length, 0)
  assert.throws(
    () => r.setExpiry(s.id, s.owner.token, 10, late),
    (e: unknown) => e instanceof SessionError && e.code === "SESSION_FULL",
  )
  const ok = parseClientMessage(
    JSON.stringify({
      type: "session.expire",
      id: "x",
      sessionId: "abc",
      token: "tok",
      minutes: 60,
    }),
  )
  assert.equal(ok?.type, "session.expire")
  for (const minutes of [0, 7, 100000, "60"])
    assert.equal(
      parseClientMessage(
        JSON.stringify({
          type: "session.expire",
          id: "x",
          sessionId: "abc",
          token: "tok",
          minutes,
        }),
      ),
      null,
    )
})

test("content: links, code, plain text and receive targets", async () => {
  const {
    asLink,
    classify,
    looksLikeCode,
    receiveTarget,
    langFromType,
    kindFromType,
  } = await import("../lib/content")
  assert.equal(asLink("https://example.com/a?b=1")?.hostname, "example.com")
  assert.equal(asLink("www.example.com")?.protocol, "https:")
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "file:///etc/passwd",
    "see https://example.com",
    "hello",
    "http://intranet",
  ])
    assert.equal(asLink(bad), null, bad)
  assert.equal(classify("https://example.com"), "link")
  assert.equal(classify("function add(a, b) {\n  return a + b\n}\n"), "code")
  assert.equal(classify('{"a": 1, "b": [1, 2]}'), "code")
  assert.equal(
    classify("import os\n\ndef main():\n    print(os.getcwd())\n"),
    "code",
  )
  assert.equal(classify("SELECT id FROM users WHERE active = 1"), "code")
  assert.equal(classify("Meet at 6; bring snacks. See you there!"), "text")
  assert.equal(classify("Buy milk\nCall mum\nPick up the parcel"), "text")
  assert.equal(looksLikeCode("short"), false)
  const origins = ["https://share.example"]
  assert.deepEqual(receiveTarget("ABC234", origins), { code: "ABC234" })
  assert.deepEqual(receiveTarget("ABC·234", origins), { code: "ABC234" })
  assert.equal(
    receiveTarget("abc234", origins),
    null,
    "codes are shown uppercase",
  )
  assert.equal(
    receiveTarget("ABC123", origins),
    null,
    "1 is not in the alphabet",
  )
  assert.deepEqual(
    receiveTarget("https://share.example/receive/x_Y-1#k", origins),
    {
      path: "/receive/x_Y-1#k",
    },
  )
  assert.equal(receiveTarget("https://evil.example/receive/x", origins), null)
  assert.equal(langFromType("text/x-code; lang=python"), "python")
  assert.equal(langFromType("text/x-code; lang=<b>"), null)
  assert.equal(kindFromType("text/uri-list"), "link")
  assert.equal(kindFromType("application/pdf"), null)
})

test("secrets: found precisely, redacted, values only for .env lines", async () => {
  const { findSecrets, redact, describeSecrets } =
    await import("../lib/secrets")
  const text = [
    "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
    "DB_PASSWORD=hunter2hunter2",
    "token ghp_" + "a".repeat(36),
    "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
    "PORT=3000",
    "just a sentence with the word password in it",
  ].join("\n")
  const found = findSecrets(text)
  assert.deepEqual(
    found.map((m) => m.label),
    ["AWS access key", "Secret in .env", "GitHub token", "Private key"],
  )
  const clean = redact(text, found)
  assert.ok(clean.includes("DB_PASSWORD=[redacted]"))
  assert.ok(clean.includes("PORT=3000"))
  assert.ok(!clean.includes("hunter2") && !clean.includes("MIIabc"))
  assert.equal(findSecrets(clean).length, 0)
  assert.equal(
    findSecrets("Meet at 6, the password is on the fridge").length,
    0,
  )
  assert.equal(
    describeSecrets([...found, found[1]]),
    "AWS access key, 2 × Secret in .env, GitHub token, Private key",
  )
})

test("risky files: programs, scripts, macros and disguised names", async () => {
  const { riskOf, riskMessage } = await import("../lib/risky")
  assert.equal(riskOf("Setup.EXE"), "program")
  assert.equal(riskOf("tool.dmg"), "program")
  assert.equal(riskOf("run.ps1"), "script")
  assert.equal(riskOf("budget.xlsm"), "macro")
  assert.equal(riskOf("invoice.pdf.exe"), "disguised")
  assert.equal(riskOf("photo‮gpj.exe"), "disguised")
  for (const ok of [
    "photo.jpg",
    "report.pdf",
    "archive.zip",
    "notes",
    "app.ts",
  ])
    assert.equal(riskOf(ok), null, ok)
  assert.match(
    riskMessage("invoice.pdf.exe", "disguised", "Lucky Koala"),
    /looks like a PDF/,
  )
  assert.match(
    riskMessage("a.exe", "program", "Lucky Koala"),
    /from Lucky Koala/,
  )
  assert.equal(safeFileName("photo‮gpj.exe"), "photogpj.exe")
})

test("previews: type from the extension, markup never rendered", async () => {
  const { previewOf } = await import("../lib/preview")
  assert.deepEqual(previewOf("a.PNG"), { kind: "image", type: "image/png" })
  assert.deepEqual(previewOf("clip.mp4"), { kind: "video", type: "video/mp4" })
  assert.deepEqual(previewOf("doc.pdf"), {
    kind: "pdf",
    type: "application/pdf",
  })
  for (const markup of ["page.html", "logo.svg", "feed.xml"])
    assert.deepEqual(
      previewOf(markup),
      { kind: "text", type: "text/plain" },
      markup,
    )
  assert.equal(previewOf("setup.exe"), null)
  assert.equal(previewOf("README"), null)
})

test("share keys: same secret agrees, a different secret or a swapped key is caught", async () => {
  const {
    keyPair,
    deriveKeys,
    tag,
    checkTag,
    newSecret,
    isSecret,
    sdpFingerprints,
  } = await import("../lib/transfer/handshake")
  const secret = newSecret()
  assert.ok(isSecret(secret))
  const a = await keyPair()
  const b = await keyPair()
  const ka = await deriveKeys(a.pair.privateKey, b.pub, secret, "s1")
  const kb = await deriveKeys(b.pair.privateKey, a.pub, secret, "s1")
  assert.equal(ka.mode, "link")
  assert.equal(ka.sas, kb.sas)
  assert.match(ka.sas, /^\d{4}$/)
  assert.ok(
    await checkTag(kb, "confirm sender", await tag(ka, "confirm sender")),
  )
  assert.ok(
    !(await checkTag(kb, "confirm receiver", await tag(ka, "confirm sender"))),
  )

  // A server in the middle without the link secret can't make matching keys.
  const m = await keyPair()
  const mitm = await deriveKeys(m.pair.privateKey, b.pub, null, "s1")
  assert.ok(
    !(await checkTag(kb, "confirm sender", await tag(mitm, "confirm sender"))),
  )
  // Nor with a guessed secret, nor across sessions.
  const guessed = await deriveKeys(m.pair.privateKey, b.pub, newSecret(), "s1")
  assert.ok(
    !(await checkTag(
      kb,
      "confirm sender",
      await tag(guessed, "confirm sender"),
    )),
  )
  const other = await deriveKeys(a.pair.privateKey, b.pub, secret, "s2")
  assert.ok(
    !(await checkTag(kb, "confirm sender", await tag(other, "confirm sender"))),
  )
  assert.equal(await checkTag(kb, "x", "not a tag"), false)

  // Without a secret both still agree, and the 4 digits are what users compare.
  const sa = await deriveKeys(a.pair.privateKey, b.pub, null, "s1")
  const sb = await deriveKeys(b.pair.privateKey, a.pub, null, "s1")
  assert.equal(sa.mode, "sas")
  assert.equal(sa.sas, sb.sas)

  assert.equal(
    sdpFingerprints(
      "v=0\r\na=fingerprint:SHA-256 ab:cd\r\nm=video\r\na=fingerprint:sha-256 ab:cd\r\n",
    ),
    "sha-256 AB:CD,sha-256 AB:CD",
  )
})

test("device kinds from what the browser reports", async () => {
  const { detectDevice } = await import("../lib/device")
  const ua = {
    iphone:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    android:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36",
    chromeos:
      "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    windows:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
    linux:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
  }
  assert.equal(detectDevice({ userAgent: ua.iphone }), "iphone")
  assert.equal(detectDevice({ userAgent: ua.ipad, maxTouchPoints: 5 }), "ipad")
  assert.equal(detectDevice({ userAgent: ua.ipad, maxTouchPoints: 0 }), "mac")
  assert.equal(
    detectDevice({ userAgent: ua.android, platform: "Linux armv8l" }),
    "android",
  )
  assert.equal(detectDevice({ userAgent: ua.chromeos }), "chromeos")
  assert.equal(
    detectDevice({ userAgent: ua.windows, platform: "Windows" }),
    "windows",
  )
  assert.equal(
    detectDevice({ userAgent: ua.linux, platform: "Linux x86_64" }),
    "linux",
  )
  assert.equal(detectDevice({ userAgent: "Something" }), "other")
  const hello = parseClientMessage(
    JSON.stringify({ type: "hello", v: 3, device: "toaster" }),
  )
  assert.equal(hello?.type === "hello" && hello.device, undefined)
})

test("recent devices: newest first, one entry per device, counts per direction", async () => {
  const { withShare } = await import("../lib/recent")
  let list = withShare(
    [],
    { name: "Clever Lynx", device: "iphone", direction: "sent" },
    1,
  )
  list = withShare(
    list,
    { name: "Zippy Otter", device: "mac", direction: "received" },
    2,
  )
  list = withShare(
    list,
    { name: "Clever Lynx", device: "iphone", direction: "received" },
    3,
  )
  assert.deepEqual(
    list.map((d) => [d.name, d.device, d.sent, d.received, d.lastAt]),
    [
      ["Clever Lynx", "iphone", 1, 1, 3],
      ["Zippy Otter", "mac", 0, 1, 2],
    ],
  )
  for (let i = 0; i < 20; i++)
    list = withShare(
      list,
      { name: `D${i}`, device: "other", direction: "sent" },
      10 + i,
    )
  assert.equal(list.length, 12)
})

test("wake-up pushes: only browser push services, VAPID JWT verifies, env keys round-trip", async () => {
  const { isPushEndpoint, vapidJwt, vapidKeys } = await import("../server/push")
  const { createPublicKey, verify } = await import("node:crypto")
  assert.ok(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"))
  assert.ok(isPushEndpoint("https://web.push.apple.com/QGx"))
  assert.ok(
    isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"),
  )
  for (const bad of [
    "http://fcm.googleapis.com/x",
    "https://evil.example/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example/x",
    "https://169.254.169.254/latest",
    "https://fcm.googleapis.com:8443/x",
    "not a url",
  ])
    assert.equal(isPushEndpoint(bad), false, bad)

  const v = vapidKeys({}, "mailto:test@example.com")
  const raw = Buffer.from(v.publicKey, "base64url")
  assert.equal(raw.length, 65)
  const jwt = vapidJwt(v, "https://fcm.googleapis.com", 1_000_000)
  const [h, c, sig] = jwt.split(".")
  const pub = createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: raw.subarray(1, 33).toString("base64url"),
      y: raw.subarray(33).toString("base64url"),
    },
    format: "jwk",
  })
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${h}.${c}`),
      { key: pub, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    ),
  )
  const claims = JSON.parse(Buffer.from(c, "base64url").toString())
  assert.deepEqual(claims, {
    aud: "https://fcm.googleapis.com",
    exp: 1000 + 43200,
    sub: "mailto:test@example.com",
  })

  const d = (v.key.export({ format: "jwk" }) as { d: string }).d
  const again = vapidKeys(
    { VAPID_PUBLIC_KEY: v.publicKey, VAPID_PRIVATE_KEY: d },
    "x",
  )
  assert.equal(again.publicKey, v.publicKey)
})
