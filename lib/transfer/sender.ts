import { CHUNK_BYTES, WINDOW_BYTES, encodeChunk, parseControl } from "./frames"
import { foldDigests, sha256 } from "./crypto"
import type { Pipe } from "./pipe"

export interface SenderEvents {
  onProgress(ackedBytes: number, totalBytes: number): void
  onComplete(): void
  onCancel(reason?: string): void
  onError(message: string): void
  /** The receiver paused or resumed. */
  onPause?(on: boolean): void
}

/**
 * Streams blobs over whichever pipe is attached. Survives pipe swaps: the receiver's `ready`
 * says where to resume, so a reconnect (direct → relay or relay → relay) never resends what
 * already arrived and never skips what didn't.
 */
export class FileSender {
  private pipe: Pipe | null = null
  private gen = 0
  private sentAbs = 0
  private ackedAbs = 0
  private wake: (() => void) | null = null
  /** Each side's own pause: the loop holds while either is set. */
  private pausedHere = false
  private pausedThere = false
  private digests: Uint8Array[][]
  private offsets: number[]
  readonly total: number
  done = false

  constructor(
    private blobs: Blob[],
    private events: SenderEvents,
  ) {
    this.digests = blobs.map(() => [])
    let acc = 0
    this.offsets = blobs.map((b) => ((acc += b.size), acc - b.size))
    this.total = acc
  }

  attach(pipe: Pipe) {
    this.detach()
    this.pipe = pipe
    pipe.onmessage = (data) => {
      if (typeof data === "string") this.onControl(data)
    }
  }

  /** Our pause: holds (or releases) the send loop. Unacked bytes in flight still arrive. */
  setPaused(on: boolean) {
    this.pausedHere = on
    this.wake?.()
  }

  /** Stops any send loop bound to the current pipe. */
  detach() {
    this.gen++
    this.pipe = null
    this.wake?.()
  }

  private onControl(raw: string) {
    const c = parseControl(raw)
    if (!c || !this.pipe) return
    switch (c.t) {
      case "ready": {
        if (c.fi > this.blobs.length) return
        const gen = ++this.gen
        this.wake?.()
        void this.sendFrom(c.fi, c.off, gen)
        return
      }
      case "ack": {
        if (c.fi >= this.blobs.length) return
        const abs = this.offsets[c.fi] + Math.min(c.off, this.blobs[c.fi].size)
        if (abs > this.ackedAbs) {
          this.ackedAbs = abs
          this.events.onProgress(abs, this.total)
          this.wake?.()
        }
        return
      }
      case "complete":
        this.pipe.send(JSON.stringify({ t: "bye" }))
        if (this.done) return
        this.done = true
        this.ackedAbs = this.total
        this.events.onProgress(this.total, this.total)
        this.events.onComplete()
        return
      case "cancel":
        this.events.onCancel(c.reason)
        return
      case "pause":
        this.pausedThere = c.on
        this.wake?.()
        this.events.onPause?.(c.on)
        return
      case "ping":
        this.pipe.send(JSON.stringify({ t: "pong" }))
        return
    }
  }

  private async sendFrom(startFile: number, startOffset: number, gen: number) {
    const live = () => gen === this.gen && this.pipe !== null
    try {
      for (let fi = startFile; fi < this.blobs.length; fi++) {
        const blob = this.blobs[fi]
        // Resume points are chunk boundaries (or end of file).
        let pos =
          fi === startFile
            ? Math.min(startOffset - (startOffset % CHUNK_BYTES), blob.size)
            : 0
        if (fi === startFile && startOffset >= blob.size) pos = blob.size
        this.digests[fi].length = Math.ceil(pos / CHUNK_BYTES)
        this.sentAbs = this.ackedAbs = this.offsets[fi] + pos
        this.events.onProgress(this.ackedAbs, this.total)

        while (pos < blob.size) {
          while (
            live() &&
            (this.pausedHere ||
              this.pausedThere ||
              this.sentAbs - this.ackedAbs >= WINDOW_BYTES)
          ) {
            await new Promise<void>((r) => (this.wake = r))
          }
          if (!live()) return
          await this.pipe!.drain()
          const buf = await blob.slice(pos, pos + CHUNK_BYTES).arrayBuffer()
          const digest = await sha256(buf)
          if (!live()) return
          this.digests[fi][pos / CHUNK_BYTES] = digest
          this.pipe!.send(encodeChunk(fi, pos, buf))
          pos += buf.byteLength
          this.sentAbs = this.offsets[fi] + pos
        }

        const digest = await foldDigests(this.digests[fi])
        if (!live()) return
        this.pipe!.send(JSON.stringify({ t: "end", fi, digest }))
      }
    } catch (err) {
      // Reading the source failed (file moved/deleted). Tell the receiver; the controller fails us.
      if (live())
        this.pipe!.send(
          JSON.stringify({
            t: "cancel",
            reason: "The sender could not read the file.",
          }),
        )
      this.events.onError(
        `Couldn’t read the file${err instanceof Error ? ` (${err.message})` : ""}. It may have been moved or deleted.`,
      )
    }
  }
}
