// Wire format of the transfer protocol. Identical over a WebRTC data channel and the server relay.
//
//   binary frame : [u32 fileIndex][f64 offset][payload ≤ CHUNK_BYTES]
//   text frame   : JSON control message (see Control)
//
// The receiver drives: it says where to (re)start with `ready`, acknowledges bytes with `ack`,
// verifies each file's digest and finally confirms `complete`. The sender never declares success
// on its own.

/** Keeps header + payload under 64 KiB : the data channel message size every browser accepts. */
export const CHUNK_BYTES = 60 * 1024
/** Max bytes sent but not yet acknowledged. Bounds memory on the relay and keeps progress honest. */
export const WINDOW_BYTES = 8 * 1024 * 1024
export const ACK_EVERY_BYTES = 1024 * 1024
const HEADER_BYTES = 12

export type Control =
  | { t: "ready"; fi: number; off: number }
  | { t: "ack"; fi: number; off: number }
  | { t: "end"; fi: number; digest: string }
  | { t: "ok"; fi: number }
  | { t: "complete" }
  | { t: "bye" }
  | { t: "cancel"; reason?: string }
  | { t: "ping" }
  | { t: "pong" }

const nonNegInt = (v: unknown): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0

export function parseControl(raw: string): Control | null {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof m !== "object" || m === null) return null
  switch (m.t) {
    case "ready":
    case "ack":
      return nonNegInt(m.fi) && nonNegInt(m.off)
        ? { t: m.t, fi: m.fi, off: m.off }
        : null
    case "end":
      return nonNegInt(m.fi) &&
        typeof m.digest === "string" &&
        /^[0-9a-f]{64}$/.test(m.digest)
        ? { t: "end", fi: m.fi, digest: m.digest }
        : null
    case "ok":
      return nonNegInt(m.fi) ? { t: "ok", fi: m.fi } : null
    case "cancel":
      return {
        t: "cancel",
        reason:
          typeof m.reason === "string" ? m.reason.slice(0, 200) : undefined,
      }
    case "complete":
    case "bye":
    case "ping":
    case "pong":
      return { t: m.t }
    default:
      return null
  }
}

export function encodeChunk(
  fileIndex: number,
  offset: number,
  payload: ArrayBuffer,
): ArrayBuffer {
  const out = new Uint8Array(HEADER_BYTES + payload.byteLength)
  const view = new DataView(out.buffer)
  view.setUint32(0, fileIndex)
  view.setFloat64(4, offset)
  out.set(new Uint8Array(payload), HEADER_BYTES)
  return out.buffer
}

export function decodeChunk(buf: ArrayBuffer): {
  fileIndex: number
  offset: number
  payload: Uint8Array<ArrayBuffer>
} | null {
  if (
    buf.byteLength < HEADER_BYTES ||
    buf.byteLength > HEADER_BYTES + CHUNK_BYTES
  )
    return null
  const view = new DataView(buf)
  const offset = view.getFloat64(4)
  if (!Number.isSafeInteger(offset) || offset < 0) return null
  return {
    fileIndex: view.getUint32(0),
    offset,
    payload: new Uint8Array(buf, HEADER_BYTES),
  }
}
