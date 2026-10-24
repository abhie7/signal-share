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

test("pause from the receiver holds the sender; resume finishes intact", async () => {
  const blobs = [randomBlob(CHUNK_BYTES * 300, 9)]
  const t = setup(blobs)
  const paused: boolean[] = []
  const [, b] = t.connect()
  ;(
    t.sender as unknown as { events: { onPause: (on: boolean) => void } }
  ).events.onPause = (on) => paused.push(on)
  b.send(JSON.stringify({ t: "pause", on: true }))
  await new Promise((r) => setTimeout(r, 50))
  const held = t.receiver.received
  await new Promise((r) => setTimeout(r, 50))
  assert.equal(t.receiver.received, held, "nothing new arrives while paused")
  assert.ok(held < t.receiver.total && !t.log.receiverDone)
  b.send(JSON.stringify({ t: "pause", on: false }))
  await t.done
  assert.deepEqual(paused, [true, false])
  await same(t.received[0], blobs[0])
})

test("pause frames are validated", () => {
  assert.deepEqual(parseControl('{"t":"pause","on":true}'), {
    t: "pause",
    on: true,
  })
  assert.equal(parseControl('{"t":"pause","on":"yes"}'), null)
})

// ── Sinks and zip ────────────────────────────────────────────────────────────

/** In-memory stand-in for a File System Access folder. */
class FakeDir {
  kind = "directory" as const
  entries = new Map<string, FakeDir | FakeFile>()
  constructor(public name = "") {}
  private get(name: string, make: () => FakeDir | FakeFile, create?: boolean) {
    const hit = this.entries.get(name)
    if (hit) return hit
    if (!create) throw new DOMException("missing", "NotFoundError")
    const made = make()
    this.entries.set(name, made)
    return made
  }
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    return this.get(name, () => new FakeDir(name), o?.create)
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    return this.get(name, () => new FakeFile(name), o?.create)
  }
}
class FakeFile {
  kind = "file" as const
  bytes = new Uint8Array(0)
  constructor(public name: string) {}
  async createWritable() {
    let draft = new Uint8Array(0)
    return {
      write: async (op: { position: number; data: Blob }) => {
        const add = new Uint8Array(await op.data.arrayBuffer())
        const next = new Uint8Array(
          Math.max(draft.length, op.position + add.length),
        )
        next.set(draft)
        next.set(add, op.position)
        draft = next
      },
      truncate: async (n: number) => void (draft = draft.slice(0, n)),
      close: async () => void (this.bytes = draft),
      abort: async () => void (draft = new Uint8Array(0)),
    }
  }
  async getFile() {
    return new File([this.bytes], this.name)
  }
}

test("folder paths: safe segments only, anything escaping flattens", async () => {
  const { safePath } = await import("../lib/transfer/sink")
  assert.deepEqual(safePath("Photos/2024/a.jpg"), ["Photos", "2024", "a.jpg"])
  assert.deepEqual(safePath("../../etc/passwd"), ["_.._etc_passwd"])
  assert.deepEqual(safePath("/abs/x"), ["_abs_x"])
  assert.deepEqual(safePath("a//b"), ["a__b"])
  assert.deepEqual(safePath("a/b:c"), ["a", "b_c"])
})

test("disk sink recreates folders, never overwrites, and commits only verified files", async () => {
  const { fsSink } = await import("../lib/transfer/sink")
  const root = new FakeDir()
  await root.getDirectoryHandle("Photos", { create: true }) // already there: must not be touched
  await root.getFileHandle("notes.txt", { create: true })
  const files = [
    { name: "Photos/2024/a.bin", size: 6, type: "" },
    { name: "Photos/b.bin", size: 3, type: "" },
    { name: "notes.txt", size: 2, type: "" },
  ]
  const sink = fsSink(
    root as unknown as FileSystemDirectoryHandle,
    files,
    "disk",
  )
  await sink.write(0, new Uint8Array([9, 9, 9]))
  await sink.reset(0) // digest failed: start the file again
  await sink.write(0, new Uint8Array([1, 2, 3]))
  await sink.write(0, new Uint8Array([4, 5, 6]))
  const a = await sink.finish(0)
  assert.deepEqual(
    new Uint8Array(await a.arrayBuffer()),
    new Uint8Array([1, 2, 3, 4, 5, 6]),
  )
  await sink.write(1, new Uint8Array([7, 8, 9]))
  await sink.finish(1)
  await sink.write(2, new Uint8Array([1, 1]))
  await sink.abort() // share stopped: the half-written file is discarded

  // Two loose files with the same name never share one file.
  const twin = fsSink(
    root as unknown as FileSystemDirectoryHandle,
    [
      { name: "IMG.jpg", size: 1, type: "" },
      { name: "IMG.jpg", size: 1, type: "" },
    ],
    "disk",
  )
  await twin.write(0, new Uint8Array([1]))
  await twin.finish(0)
  await twin.write(1, new Uint8Array([2]))
  await twin.finish(1)
  assert.deepEqual(
    (root.entries.get("IMG.jpg") as FakeFile).bytes,
    new Uint8Array([1]),
  )
  assert.deepEqual(
    (root.entries.get("IMG (2).jpg") as FakeFile).bytes,
    new Uint8Array([2]),
  )

  const photos2 = root.entries.get("Photos (2)") as FakeDir
  assert.ok(
    photos2,
    "a second Photos folder instead of writing into the existing one",
  )
  assert.equal((root.entries.get("Photos") as FakeDir).entries.size, 0)
  const y2024 = photos2.entries.get("2024") as FakeDir
  assert.deepEqual(
    (y2024.entries.get("a.bin") as FakeFile).bytes,
    new Uint8Array([1, 2, 3, 4, 5, 6]),
  )
  assert.deepEqual(
    (photos2.entries.get("b.bin") as FakeFile).bytes,
    new Uint8Array([7, 8, 9]),
  )
  assert.equal((root.entries.get("notes (2).txt") as FakeFile).bytes.length, 0)
})

test("a received transfer can be written through a disk sink", async () => {
  const { fsSink } = await import("../lib/transfer/sink")
  const blobs = [randomBlob(CHUNK_BYTES * 3 + 5, 11), randomBlob(10, 12)]
  const metas = [
    { name: "dir/one", size: blobs[0].size, type: "" },
    { name: "dir/two", size: blobs[1].size, type: "" },
  ]
  const root = new FakeDir()
  let done!: () => void
  const finished = new Promise<void>((r) => (done = r))
  const sender = new FileSender(blobs, {
    onProgress: () => {},
    onComplete: () => done(),
    onCancel: () => {},
    onError: () => {},
  })
  const receiver = new FileReceiver(
    metas,
    {
      onProgress: () => {},
      onFile: () => {},
      onComplete: () => {},
      onCancel: () => {},
      onError: (m) => assert.fail(m),
    },
    fsSink(root as unknown as FileSystemDirectoryHandle, metas, "disk"),
  )
  const [a, b] = memoryPipePair()
  sender.attach(a)
  receiver.attach(b)
  await finished
  const dir = root.entries.get("dir") as FakeDir
  await same(await (dir.entries.get("one") as FakeFile).getFile(), blobs[0])
  await same(await (dir.entries.get("two") as FakeFile).getFile(), blobs[1])
})

test("zip of received files: valid archive, paths and bytes intact", async () => {
  const { crc32, zipStore } = await import("../lib/utils/store-zip")
  assert.equal(await crc32(new Blob(["123456789"])), 0xcbf43926)
  const zip = await zipStore([
    { path: "Photos/2024/a.txt", blob: new Blob(["hello"]) },
    { path: "Photos/ünïcode.txt", blob: new Blob(["wörld"]) },
    { path: "empty", blob: new Blob([]) },
  ])
  const { writeFileSync } = await import("node:fs")
  const { execFileSync } = await import("node:child_process")
  const { join } = await import("node:path")
  const { tmpdir } = await import("node:os")
  const file = join(tmpdir(), `signalshare-test-${process.pid}.zip`)
  writeFileSync(file, Buffer.from(await zip.arrayBuffer()))
  const out = execFileSync("python3", [
    "-c",
    "import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))",
    file,
  ]).toString()
  assert.deepEqual(JSON.parse(out), {
    "Photos/2024/a.txt": "hello",
    "Photos/ünïcode.txt": "wörld",
    empty: "",
  })
})

test("a store that runs out of room hands over to the fallback without losing bytes", async () => {
  const { memorySink } = await import("../lib/transfer/sink")
  const blobs = [
    randomBlob(CHUNK_BYTES * 2, 13),
    randomBlob(CHUNK_BYTES * 30 + 7, 14),
  ]
  const metas = blobs.map((b, i) => ({ name: `f${i}`, size: b.size, type: "" }))
  let written = 0
  const full = memorySink(metas)
  const capped = {
    ...full,
    kind: "opfs" as const,
    write: async (fi: number, data: Uint8Array) => {
      written += data.byteLength
      if (written > CHUNK_BYTES * 10)
        throw new DOMException("full", "QuotaExceededError")
      return full.write(fi, data)
    },
  }
  const received: Blob[] = []
  let done!: () => void
  const finished = new Promise<void>((r) => (done = r))
  const sender = new FileSender(blobs, {
    onProgress: () => {},
    onComplete: () => done(),
    onCancel: () => {},
    onError: () => {},
  })
  const receiver = new FileReceiver(
    metas,
    {
      onProgress: () => {},
      onFile: (i, blob) => (received[i] = blob),
      onComplete: () => {},
      onCancel: () => {},
      onError: (m) => assert.fail(m),
    },
    capped,
    () => memorySink(metas),
  )
  const [a, b] = memoryPipePair()
  sender.attach(a)
  receiver.attach(b)
  await finished
  assert.equal(receiver.sink.kind, "memory")
  await same(received[0], blobs[0])
  await same(received[1], blobs[1])
})

test("relay pipe: control and data are sealed; tampering, replays and reflections are refused", async () => {
  const { relayPipe } = await import("../lib/transfer/pipe")
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
  class FakeWs {
    readyState = 1
    binaryType = "blob"
    bufferedAmount = 0
    wire: ArrayBuffer[] = []
    closedWith: number | null = null
    onmessage: ((e: { data: unknown }) => void) | null = null
    onclose: ((e: { code: number; reason: string }) => void) | null = null
    send(d: ArrayBuffer | string) {
      assert.ok(
        d instanceof ArrayBuffer,
        "nothing crosses the relay in clear text",
      )
      this.wire.push(d)
    }
    close(code = 1000) {
      this.closedWith = code
    }
  }
  const a = new FakeWs()
  const b = new FakeWs()
  const sender = relayPipe(a as unknown as WebSocket, key, "sender")
  const receiver = relayPipe(b as unknown as WebSocket, key, "receiver")
  const got: Array<string | ArrayBuffer> = []
  receiver.onmessage = (d) => got.push(d)
  sender.send('{"t":"end","fi":0}')
  sender.send(new Uint8Array([1, 2, 3]).buffer)
  await sender.drain()
  assert.ok(
    !new TextDecoder().decode(a.wire[0]).includes("end"),
    "control frame is ciphertext",
  )
  for (const frame of a.wire) b.onmessage!({ data: frame })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(got[0], '{"t":"end","fi":0}')
  assert.deepEqual(
    new Uint8Array(got[1] as ArrayBuffer),
    new Uint8Array([1, 2, 3]),
  )

  // Replaying an old frame is refused.
  b.onmessage!({ data: a.wire[0] })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(b.closedWith, 4004)

  // Reflecting the sender's own frame back to it is refused.
  const c = new FakeWs()
  const s2 = relayPipe(c as unknown as WebSocket, key, "sender")
  s2.onmessage = () => assert.fail("reflected frame accepted")
  c.onmessage!({ data: a.wire[0] })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(c.closedWith, 4004)

  // A flipped bit is refused.
  const d = new FakeWs()
  const r2 = relayPipe(d as unknown as WebSocket, key, "receiver")
  r2.onmessage = () => assert.fail("tampered frame accepted")
  const bad = new Uint8Array(a.wire[0].slice(0))
  bad[bad.length - 1] ^= 1
  d.onmessage!({ data: bad.buffer })
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(d.closedWith, 4004)
})
