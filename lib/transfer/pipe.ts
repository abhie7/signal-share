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

/**
 * Messages that arrive while no handler is set wait for the next one, so handing a pipe from
 * the path check (connect.ts) to the transfer (sender/receiver) can't drop the first frames.
 */
function addInbox(pipe: Pipe): (data: string | ArrayBuffer) => void {
  let handler: Pipe["onmessage"] = null
  const queue: Array<string | ArrayBuffer> = []
  Object.defineProperty(pipe, "onmessage", {
    get: () => handler,
    set: (fn: Pipe["onmessage"]) => {
      handler = fn
      while (handler && queue.length) handler(queue.shift()!)
    },
  })
  return (data) => (handler ? handler(data) : void queue.push(data))
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
  const deliver = addInbox(pipe)
  dc.onmessage = (e) => deliver(e.data)
  dc.onclose = () => {
    const wasClosed = closed
    closed = true
    if (!wasClosed) onClosed()
    pipe.onclose?.("channel closed")
  }
  return pipe
}

/**
 * Pipe over the server relay WebSocket. Every frame, data and control alike, is AES-GCM sealed
 * with the share's relay key, so the relay only forwards ciphertext and can't forge, reorder,
 * replay or reflect frames: the authenticated data carries the sending role and a per-direction
 * sequence number. Decryption is serialised to keep order.
 *
 *   plaintext : [0][chunk bytes]  or  [1][UTF-8 control JSON]
 *   aad       : [role byte][u32 sequence]
 */
export function relayPipe(
  ws: WebSocket,
  key: CryptoKey,
  role: "sender" | "receiver",
): Pipe {
  ws.binaryType = "arraybuffer"
  let sendChain: Promise<void> = Promise.resolve()
  let recvChain: Promise<void> = Promise.resolve()
  let closed = false
  let sendSeq = 0
  let recvSeq = 0
  const mine = role === "sender" ? 1 : 2
  const theirs = role === "sender" ? 2 : 1
  const aad = (who: number, seq: number) => {
    const a = new DataView(new ArrayBuffer(5))
    a.setUint8(0, who)
    a.setUint32(1, seq)
    return a.buffer
  }
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  const pipe: Pipe = {
    kind: "relay",
    send: (data) => {
      const body =
        typeof data === "string" ? enc.encode(data) : new Uint8Array(data)
      const plain = new Uint8Array(1 + body.byteLength)
      plain[0] = typeof data === "string" ? 1 : 0
      plain.set(body, 1)
      const seq = sendSeq++
      // One chain: frames leave in order, and control frames stay behind chunks being sealed.
      sendChain = sendChain.then(async () => {
        const sealed = await seal(key, plain, aad(mine, seq))
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

  const deliver = addInbox(pipe)
  ws.onmessage = (e) => {
    const data = e.data as string | ArrayBuffer
    if (typeof data === "string") return // the relay's own {"relay":"paired"}: not ours
    recvChain = recvChain.then(async () => {
      try {
        const plain = new Uint8Array(
          await open(key, data, aad(theirs, recvSeq)),
        )
        recvSeq++
        deliver(
          plain[0] === 1
            ? dec.decode(plain.subarray(1))
            : plain.slice(1).buffer,
        )
      } catch {
        // Tampered, replayed or mis-keyed frame: drop the pipe; the receiver resyncs on reconnect.
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
