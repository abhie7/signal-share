import { signaling } from "../signaling"
import type { ServerMessage, SignalData } from "../protocol"
import { deriveKey, exportPublicKey, generateKeyPair } from "./crypto"
import { dataChannelPipe, relayPipe, type Pipe } from "./pipe"
import { PathError, Peer, waitConnected, type FailReason } from "./rtc"

// Connection manager for file/text transfers. One deterministic ladder:
//   1. WebRTC data channel (host / STUN / TURN candidates, whatever ICE finds)
//   2. Server relay over WSS, end-to-end encrypted
// Every rung has a deadline and records why it failed. A path only counts once a ping/pong
// round-trip crossed it : a working signaling socket proves nothing about the data path.
//
// The receiver initiates (`connect`), the sender decides the rung. Only the receiver retries,
// so the two sides can never run competing attempts.

export interface Attempt {
  transport: "webrtc" | "relay"
  ok: boolean
  reason?: FailReason
  ms: number
}

export interface Established {
  pipe: Pipe
  attempts: Attempt[]
}

export class NoPathError extends PathError {
  constructor(
    public attempts: Attempt[],
    reason: FailReason,
  ) {
    super(reason)
  }
}

export const TIMEOUTS = {
  ice: 10_000,
  channel: 5_000,
  verify: 5_000,
  relay: 12_000,
  receiver: 50_000,
}

type ConnectRequest = { a: number; pub: JsonWebKey; webrtc: boolean }

const hasWebRTC = () => typeof RTCPeerConnection !== "undefined"

function onSessionSignal(sessionId: string, fn: (data: SignalData) => void) {
  return signaling.on(
    "signal",
    (m: Extract<ServerMessage, { type: "signal" }>) => {
      if (m.sessionId === sessionId) fn(m.data)
    },
  )
}

function sendSignal(sessionId: string, data: SignalData) {
  signaling.send({ type: "signal", sessionId, data })
}

const timeout = <T>(
  p: Promise<T>,
  ms: number,
  reason: FailReason,
  signal: AbortSignal,
) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PathError(reason)), ms)
    const onAbort = () => reject(new PathError("aborted"))
    signal.addEventListener("abort", onAbort, { once: true })
    p.then(resolve, reject).finally(() => {
      clearTimeout(timer)
      signal.removeEventListener("abort", onAbort)
    })
  })

function channelOpen(dc: RTCDataChannel): Promise<void> {
  if (dc.readyState === "open") return Promise.resolve()
  return new Promise((resolve, reject) => {
    dc.addEventListener("open", () => resolve(), { once: true })
    dc.addEventListener(
      "close",
      () => reject(new PathError("channel-timeout")),
      { once: true },
    )
  })
}

/** Sender side of the round-trip check. The receiver answers via `answerPing`. */
function ping(pipe: Pipe): Promise<void> {
  return new Promise((resolve) => {
    pipe.onmessage = (d) => {
      if (typeof d === "string" && d.includes('"pong"')) resolve()
    }
    pipe.send(JSON.stringify({ t: "ping" }))
  })
}

function answerPing(pipe: Pipe): Promise<void> {
  return new Promise((resolve) => {
    pipe.onmessage = (d) => {
      if (typeof d === "string" && d.includes('"ping"')) {
        pipe.send(JSON.stringify({ t: "pong" }))
        resolve()
      }
    }
  })
}

function openRelay(sessionId: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === "https:" ? "wss" : "ws"
    const ws = new WebSocket(
      `${proto}://${location.host}/api/relay?session=${encodeURIComponent(sessionId)}`,
    )
    ws.onopen = () => ws.send(JSON.stringify({ token }))
    ws.onmessage = (e) => {
      if (typeof e.data === "string" && e.data.includes('"paired"')) {
        ws.onmessage = null
        resolve(ws)
      }
    }
    ws.onclose = (e) =>
      reject(
        new PathError(e.code === 4003 ? "relay-rejected" : "relay-timeout"),
      )
  })
}

/** Sender: answer a receiver's `connect` request by walking the ladder. */
export async function offerPath(
  sessionId: string,
  token: string,
  req: ConnectRequest,
  signal: AbortSignal,
): Promise<Established> {
  const attempts: Attempt[] = []
  const keys = await generateKeyPair()
  const pub = await exportPublicKey(keys.publicKey)
  let peer: Peer | null = null
  const unsubscribe = onSessionSignal(
    sessionId,
    (data) => void peer?.handle(data).catch(() => {}),
  )

  try {
    // relay-only ICE policy with no TURN server can never produce a candidate pair.
    const iceImpossible =
      signaling.welcome?.iceTransportPolicy === "relay" &&
      !signaling.welcome.turn
    if (iceImpossible)
      attempts.push({
        transport: "webrtc",
        ok: false,
        reason: "ice-failed",
        ms: 0,
      })
    else if (req.webrtc && hasWebRTC()) {
      const t0 = performance.now()
      try {
        peer = new Peer(sessionId, req.a)
        const dc = peer.pc.createDataChannel("transfer", { ordered: true })
        await peer.offer()
        await waitConnected(peer.pc, TIMEOUTS.ice, signal)
        await timeout(
          channelOpen(dc),
          TIMEOUTS.channel,
          "channel-timeout",
          signal,
        )
        const p = peer
        const pipe = dataChannelPipe(dc, await p.pathKind(), () => p.close())
        await timeout(ping(pipe), TIMEOUTS.verify, "verify-timeout", signal)
        attempts.push({
          transport: "webrtc",
          ok: true,
          ms: performance.now() - t0,
        })
        return { pipe, attempts }
      } catch (err) {
        peer?.close()
        peer = null
        const reason = err instanceof PathError ? err.reason : "ice-failed"
        if (reason === "aborted") throw err
        attempts.push({
          transport: "webrtc",
          ok: false,
          reason,
          ms: performance.now() - t0,
        })
      }
    } else {
      attempts.push({
        transport: "webrtc",
        ok: false,
        reason: "webrtc-unsupported",
        ms: 0,
      })
    }

    if (!signaling.welcome?.relay) {
      sendSignal(sessionId, { k: "fail", a: req.a, reason: "relay-disabled" })
      throw new NoPathError(attempts, "relay-disabled")
    }
    const t0 = performance.now()
    try {
      const key = await deriveKey(keys.privateKey, req.pub)
      sendSignal(sessionId, { k: "relay", a: req.a, pub })
      const ws = await timeout(
        openRelay(sessionId, token),
        TIMEOUTS.relay,
        "relay-timeout",
        signal,
      )
      const pipe = relayPipe(ws, key)
      await timeout(ping(pipe), TIMEOUTS.verify, "verify-timeout", signal)
      attempts.push({
        transport: "relay",
        ok: true,
        ms: performance.now() - t0,
      })
      return { pipe, attempts }
    } catch (err) {
      const reason = err instanceof PathError ? err.reason : "relay-timeout"
      if (reason === "aborted") throw err
      attempts.push({
        transport: "relay",
        ok: false,
        reason,
        ms: performance.now() - t0,
      })
      sendSignal(sessionId, { k: "fail", a: req.a, reason })
      throw new NoPathError(attempts, reason)
    }
  } finally {
    unsubscribe()
  }
}

export function parseConnectRequest(data: SignalData): ConnectRequest | null {
  return data.k === "connect" &&
    Number.isSafeInteger(data.a) &&
    typeof data.pub === "object" &&
    data.pub
    ? {
        a: data.a as number,
        pub: data.pub as JsonWebKey,
        webrtc: data.webrtc === true,
      }
    : null
}

/** Receiver: ask the sender for a path and follow its lead. */
export async function requestPath(
  sessionId: string,
  token: string,
  attempt: number,
  signal: AbortSignal,
): Promise<Established> {
  const keys = await generateKeyPair()
  const pub = await exportPublicKey(keys.publicKey)
  let peer = null as Peer | null
  let unsubscribe = () => {}
  const started = performance.now()

  const result = new Promise<Established>((resolve, reject) => {
    const finish = (
      err: PathError | null,
      pipe?: Pipe,
      transport?: Attempt["transport"],
    ) => {
      if (err) {
        peer?.close()
        reject(err)
      } else {
        resolve({
          pipe: pipe!,
          attempts: [
            {
              transport: transport!,
              ok: true,
              ms: performance.now() - started,
            },
          ],
        })
      }
    }

    unsubscribe = onSessionSignal(sessionId, async (data) => {
      if (data.a !== attempt) return
      try {
        if (data.k === "offer") {
          peer = new Peer(sessionId, attempt)
          const p = peer
          p.pc.ondatachannel = (e) => {
            const dc = e.channel
            void channelOpen(dc).then(async () => {
              // Listen for the sender's ping before any await, or it could arrive unheard.
              const pipe = dataChannelPipe(dc, "direct", () => p.close())
              const answered = answerPing(pipe)
              pipe.kind = await p.pathKind()
              await answered
              finish(null, pipe, "webrtc")
            })
          }
          await p.handle(data)
        } else if (data.k === "ice") {
          await peer?.handle(data)
        } else if (data.k === "relay") {
          peer?.close()
          peer = null
          const key = await deriveKey(keys.privateKey, data.pub as JsonWebKey)
          const pipe = relayPipe(await openRelay(sessionId, token), key)
          await answerPing(pipe)
          finish(null, pipe, "relay")
        } else if (data.k === "fail") {
          finish(new PathError((data.reason as FailReason) ?? "ice-failed"))
        }
      } catch (err) {
        finish(
          err instanceof PathError
            ? err
            : new PathError("ice-failed", String(err)),
        )
      }
    })
  })

  sendSignal(sessionId, { k: "connect", a: attempt, pub, webrtc: hasWebRTC() })
  try {
    return await timeout(result, TIMEOUTS.receiver, "peer-timeout", signal)
  } catch (err) {
    peer?.close()
    throw err
  } finally {
    unsubscribe()
  }
}
