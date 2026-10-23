import { test } from "node:test"
import assert from "node:assert/strict"
import { FileSender } from "../lib/transfer/sender"
import { FileReceiver } from "../lib/transfer/receiver"
import { memoryPipePair, type Pipe } from "../lib/transfer/pipe"
import {
  CHUNK_BYTES,
  decodeChunk,
  encodeChunk,
  parseControl,
} from "../lib/transfer/frames"

function randomBlob(size: number, seed: number): Blob {
  const bytes = new Uint8Array(size)
  let x = seed
  for (let i = 0; i < size; i++)
    bytes[i] = (x = (x * 1103515245 + 12345) & 0x7fffffff) & 0xff
  return new Blob([bytes])
}

async function same(a: Blob, b: Blob) {
  assert.equal(a.size, b.size)
  assert.deepEqual(
    new Uint8Array(await a.arrayBuffer()),
    new Uint8Array(await b.arrayBuffer()),
  )
}

function setup(blobs: Blob[]) {
  const metas = blobs.map((b, i) => ({ name: `f${i}`, size: b.size, type: "" }))
  const received: Blob[] = []
  const log = {
    senderDone: false,
    receiverDone: false,
    cancel: "" as string | undefined,
    error: "",
    progress: [] as number[],
  }
  let resolveDone!: () => void
  const done = new Promise<void>((r) => (resolveDone = r))
  const check = () => log.senderDone && log.receiverDone && resolveDone()
  const sender = new FileSender(blobs, {
    onProgress: (n) => log.progress.push(n),
    onComplete: () => ((log.senderDone = true), check()),
    onCancel: (r) => (log.cancel = r ?? "cancel"),
    onError: (m) => (log.error = m),
  })
  const receiver = new FileReceiver(metas, {
    onProgress: () => {},
    onFile: (i, blob) => (received[i] = blob),
    onComplete: () => ((log.receiverDone = true), check()),
    onCancel: (r) => (log.cancel = r ?? "cancel"),
    onError: (m) => (log.error = m),
  })
  const connect = (wrap?: (p: Pipe) => Pipe) => {
    const [a, b] = memoryPipePair()
    sender.attach(wrap ? wrap(a) : a)
    receiver.attach(b)
    return [a, b] as const
  }
  return { sender, receiver, received, log, done, connect }
}

test("frames round-trip and reject garbage", () => {
  const payload = new Uint8Array([1, 2, 3]).buffer
  const decoded = decodeChunk(encodeChunk(7, 123456789, payload))
  assert.equal(decoded?.fileIndex, 7)
  assert.equal(decoded?.offset, 123456789)
  assert.deepEqual([...decoded!.payload], [1, 2, 3])
  assert.equal(decodeChunk(new ArrayBuffer(3)), null)
  assert.equal(parseControl('{"t":"ready","fi":-1,"off":0}'), null)
  assert.equal(parseControl('{"t":"end","fi":0,"digest":"nothex"}'), null)
  assert.equal(parseControl("not json"), null)
  assert.deepEqual(parseControl('{"t":"ack","fi":1,"off":5}'), {
    t: "ack",
    fi: 1,
    off: 5,
  })
})

test("transfers several files, including empty and non-aligned sizes, intact", async () => {
  const blobs = [
    randomBlob(CHUNK_BYTES * 3 + 17, 1),
    randomBlob(0, 2),
    randomBlob(5, 3),
    randomBlob(CHUNK_BYTES, 4),
  ]
  const t = setup(blobs)
  t.connect()
  await t.done
  for (let i = 0; i < blobs.length; i++) await same(t.received[i], blobs[i])
  assert.equal(t.log.progress.at(-1), t.sender.total)
  assert.equal(t.log.error, "")
})

test("resumes after the pipe drops mid-file without duplicating or losing bytes", async () => {
  const blobs = [
    randomBlob(CHUNK_BYTES * 40 + 99, 5),
    randomBlob(CHUNK_BYTES * 2, 6),
  ]
  const t = setup(blobs)
  let frames = 0
  // Kill the first pipe after 25 data frames.
  const [a] = t.connect((p) => {
    const send = p.send.bind(p)
    p.send = (d) => {
      if (typeof d !== "string" && ++frames === 25) {
        send(d)
        p.close()
        return
      }
      send(d)
    }
    return p
  })
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(
    t.receiver.received > 0 && t.receiver.received < t.receiver.total,
    "partial before resume",
  )
  void a
  t.sender.detach()
  t.receiver.detach()
  t.connect()
  await t.done
  for (let i = 0; i < blobs.length; i++) await same(t.received[i], blobs[i])
})

test("detects a corrupted chunk via digest and re-sends the file", async () => {
  const blobs = [randomBlob(CHUNK_BYTES * 4, 7)]
  const t = setup(blobs)
  let corrupted = false
  t.connect((p) => {
    const send = p.send.bind(p)
    p.send = (d) => {
      if (!corrupted && typeof d !== "string") {
        corrupted = true
        const copy = new Uint8Array(d.slice(0))
        copy[copy.length - 1] ^= 0xff // flip payload bits, header intact
        return send(copy.buffer)
      }
      send(d)
    }
    return p
  })
  await t.done
  assert.ok(corrupted)
  await same(t.received[0], blobs[0])
})

test("cancel from the sender reaches the receiver", async () => {
  const t = setup([randomBlob(CHUNK_BYTES * 10, 8)])
  const [a] = t.connect()
  a.send(JSON.stringify({ t: "cancel", reason: "stopped" }))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(t.log.cancel, "stopped")
})
