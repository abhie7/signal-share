import type { FileMeta } from "../protocol"
import { ACK_EVERY_BYTES, decodeChunk, parseControl } from "./frames"
import { foldDigests, sha256 } from "./crypto"
import type { Pipe } from "./pipe"

export interface ReceiverEvents {
  onProgress(receivedBytes: number, totalBytes: number): void
  onFile(index: number, blob: Blob): void
  onComplete(): void
  onCancel(reason?: string): void
  onError(message: string): void
}

/** Spill buffered chunks into a Blob every few MB so file data leaves the JS heap. */
const FLUSH_BYTES = 4 * 1024 * 1024
const MAX_FILE_RETRIES = 2

/**
 * Receives and verifies files. Holds the only authoritative position (file, offset), which it
 * re-announces with `ready` on every newly attached pipe : that is the whole resume protocol.
 */
export class FileReceiver {
  private pipe: Pipe | null = null
  private fi = 0
  private off = 0
  private parts: Blob[] = []
  private pending: Uint8Array<ArrayBuffer>[] = []
  private pendingBytes = 0
  private digests: Uint8Array[] = []
  private lastAck = 0
  private retries = 0
  private chain: Promise<void> = Promise.resolve()
  private offsets: number[]
  readonly total: number
  done = false
  private byeResolve: (() => void) | null = null

  constructor(
    private files: FileMeta[],
    private events: ReceiverEvents,
  ) {
    let acc = 0
    this.offsets = files.map((f) => ((acc += f.size), acc - f.size))
    this.total = acc
  }

  get received() {
    return this.done
      ? this.total
      : (this.offsets[this.fi] ?? this.total) + this.off
  }

  attach(pipe: Pipe) {
    this.pipe = pipe
    pipe.onmessage = (data) => {
      // Digesting is async; serialise so chunks are processed strictly in arrival order.
      this.chain = this.chain
        .then(() => this.handle(pipe, data))
        .catch((err) => this.events.onError(String(err)))
    }
    // A pipe that dropped right after we finished may have lost `complete`: repeat it.
    this.sendCtl(
      this.done
        ? { t: "complete" }
        : { t: "ready", fi: this.fi, off: this.off },
    )
  }

  detach() {
    this.pipe = null
  }

  /** Resolves when the sender acknowledged our `complete` (or after a timeout). */
  waitForBye(ms = 2000): Promise<void> {
    return new Promise((resolve) => {
      this.byeResolve = resolve
      setTimeout(resolve, ms)
    })
  }

  private sendCtl(msg: object) {
    this.pipe?.send(JSON.stringify(msg))
  }

  private async handle(pipe: Pipe, data: string | ArrayBuffer) {
    if (pipe !== this.pipe) return

    if (typeof data !== "string") {
      if (this.done) return
      const chunk = decodeChunk(data)
      if (!chunk) return this.events.onError("Received a malformed data frame.")
      if (chunk.fileIndex === this.fi && chunk.offset < this.off) return // duplicate after resume
      if (chunk.fileIndex !== this.fi || chunk.offset !== this.off) {
        // Out of sync (should not happen on an ordered pipe): ask the sender to restart here.
        return this.sendCtl({ t: "ready", fi: this.fi, off: this.off })
      }
      const meta = this.files[this.fi]
      if (!meta || this.off + chunk.payload.byteLength > meta.size)
        return this.events.onError("Received more data than announced.")

      this.digests.push(await sha256(chunk.payload))
      this.pending.push(chunk.payload)
      this.pendingBytes += chunk.payload.byteLength
      if (this.pendingBytes >= FLUSH_BYTES) this.flush()
      this.off += chunk.payload.byteLength
      this.events.onProgress(this.received, this.total)
      if (this.off - this.lastAck >= ACK_EVERY_BYTES) {
        this.lastAck = this.off
        this.sendCtl({ t: "ack", fi: this.fi, off: this.off })
      }
      return
    }

    const c = parseControl(data)
    if (!c) return
    switch (c.t) {
      case "end": {
        if (this.done || c.fi !== this.fi) return
        const meta = this.files[this.fi]
        if (this.off !== meta.size)
          return this.sendCtl({ t: "ready", fi: this.fi, off: this.off })
        if ((await foldDigests(this.digests)) !== c.digest) {
          if (++this.retries > MAX_FILE_RETRIES)
            return this.events.onError(
              `“${meta.name}” failed its integrity check.`,
            )
          this.resetFile()
          return this.sendCtl({ t: "ready", fi: this.fi, off: 0 })
        }
        this.flush()
        const blob = new Blob(this.parts, {
          type: meta.type || "application/octet-stream",
        })
        this.events.onFile(this.fi, blob)
        this.sendCtl({ t: "ack", fi: this.fi, off: this.off })
        this.sendCtl({ t: "ok", fi: this.fi })
        this.fi++
        this.resetFile()
        this.retries = 0
        if (this.fi >= this.files.length) {
          this.done = true
          this.sendCtl({ t: "complete" })
          this.events.onComplete()
        }
        return
      }
      case "cancel":
        return this.events.onCancel(c.reason)
      case "bye":
        return this.byeResolve?.()
      case "ping":
        return this.sendCtl({ t: "pong" })
    }
  }

  private flush() {
    if (!this.pending.length) return
    this.parts.push(new Blob(this.pending))
    this.pending = []
    this.pendingBytes = 0
  }

  private resetFile() {
    this.off = 0
    this.lastAck = 0
    this.parts = []
    this.pending = []
    this.pendingBytes = 0
    this.digests = []
  }
}
