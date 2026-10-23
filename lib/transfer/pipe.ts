import { open, seal } from "./crypto"

export type PathKind = "direct" | "turn" | "relay"

/** A reliable, ordered message pipe between the two devices. Transport-agnostic. */
export interface Pipe {
  kind: PathKind
  send(data: string | ArrayBuffer): void
  /** Resolves once the transport's send buffer has room again. */
  drain(): Promise<void>
  onmessage: ((data: string | ArrayBuffer) => void) | null
  onclose: ((reason: string) => void) | null
  close(): void
}

const HIGH_WATER = 4 * 1024 * 1024
const LOW_WATER = 1024 * 1024

export function dataChannelPipe(
  dc: RTCDataChannel,
  kind: PathKind,
  onClosed: () => void,
): Pipe {
  dc.binaryType = "arraybuffer"
  dc.bufferedAmountLowThreshold = LOW_WATER
  let closed = false
  const pipe: Pipe = {
    kind,
    send: (data) => {
      if (dc.readyState === "open") dc.send(data as ArrayBuffer)
    },
    drain: () =>
      dc.bufferedAmount <= HIGH_WATER || dc.readyState !== "open"
        ? Promise.resolve()
        : new Promise((resolve) => {
            const done = () => {
              dc.removeEventListener("bufferedamountlow", done)
              dc.removeEventListener("close", done)
              resolve()
            }
            dc.addEventListener("bufferedamountlow", done)
            dc.addEventListener("close", done)
          }),
    onmessage: null,
    onclose: null,
    close: () => {
      if (closed) return
      closed = true
      dc.close()
      onClosed()
    },
  }
  dc.onmessage = (e) => pipe.onmessage?.(e.data)
  dc.onclose = () => {
    const wasClosed = closed
    closed = true
    if (!wasClosed) onClosed()
    pipe.onclose?.("channel closed")
  }
  return pipe
}

/**
 * Pipe over the server relay WebSocket. Binary frames are AES-GCM sealed with a key both devices
 * derived via ECDH, so the relay only forwards ciphertext. Decryption is serialised to keep order.
 */
export function relayPipe(ws: WebSocket, key: CryptoKey): Pipe {
  ws.binaryType = "arraybuffer"
  let sendChain: Promise<void> = Promise.resolve()
  let recvChain: Promise<void> = Promise.resolve()
  let closed = false

  const pipe: Pipe = {
    kind: "relay",
    send: (data) => {
      if (typeof data === "string") {
        // Keep control frames ordered behind any chunk still being sealed.
        sendChain = sendChain.then(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data)
        })
        return
      }
      sendChain = sendChain.then(async () => {
        const sealed = await seal(key, data)
        if (ws.readyState === WebSocket.OPEN) ws.send(sealed)
      })
    },
    drain: async () => {
      await sendChain
      while (
        ws.readyState === WebSocket.OPEN &&
        ws.bufferedAmount > HIGH_WATER
      ) {
        await new Promise((r) => setTimeout(r, 15))
      }
    },
    onmessage: null,
    onclose: null,
    close: () => {
      closed = true
      ws.close()
    },
  }

  ws.onmessage = (e) => {
    const data = e.data as string | ArrayBuffer
    recvChain = recvChain.then(async () => {
      if (typeof data === "string") {
        if (!data.startsWith('{"relay"')) pipe.onmessage?.(data)
        return
      }
      try {
        pipe.onmessage?.(await open(key, data))
      } catch {
        // Tampered or mis-keyed frame: drop the pipe; the receiver will resync on reconnect.
        ws.close(4004, "decrypt failed")
      }
    })
  }
  ws.onclose = (e) => {
    void recvChain.then(() =>
      pipe.onclose?.(
        closed ? "closed" : e.reason || `relay closed (${e.code})`,
      ),
    )
  }
  return pipe
}

/** Two connected in-memory pipes. Used by tests to exercise the protocol without a network. */
export function memoryPipePair(kind: PathKind = "direct"): [Pipe, Pipe] {
  const make = (): Pipe & {
    peer?: Pipe & { _closed?: boolean }
    _closed?: boolean
  } => ({
    kind,
    send(data) {
      const peer = this.peer!
      if (this._closed || peer._closed) return
      const copy = typeof data === "string" ? data : data.slice(0)
      queueMicrotask(() => !peer._closed && peer.onmessage?.(copy))
    },
    drain: () => Promise.resolve(),
    onmessage: null,
    onclose: null,
    close() {
      if (this._closed) return
      this._closed = true
      this.peer!._closed = true
      queueMicrotask(() => {
        this.onclose?.("closed")
        this.peer!.onclose?.("peer closed")
      })
    },
  })
  const a = make()
  const b = make()
  a.peer = b
  b.peer = a
  return [a, b]
}
