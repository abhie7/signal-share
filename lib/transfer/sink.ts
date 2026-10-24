import type { FileMeta } from "../protocol"
import { safeFileName } from "../utils"

// Where received bytes go. The receiver writes verified-in-order chunks here and only asks for
// the finished file after its digest matched, so a sink never has to undo a committed file.
//
//   memory : Blobs in the tab (small shares; every browser)
//   disk   : a file or folder the user picked (Chrome/Edge File System Access), nothing to save after
//   opfs   : the browser's private disk storage, downloaded at the end (large shares elsewhere)

export interface FileSink {
  /** The next bytes of file `fi`, strictly in order. */
  write(fi: number, data: Uint8Array): Promise<void>
  /** File `fi` failed its digest: throw it away, it is received again from byte 0. */
  reset(fi: number): Promise<void>
  /** File `fi` is verified: commit it and return its contents (disk-backed when possible). */
  finish(fi: number): Promise<Blob>
  /** Share stopped: drop the unfinished file. */
  abort(): Promise<void>
  /** "disk": already where the user wanted it, so there is nothing left to save. */
  readonly kind: "memory" | "disk" | "opfs"
}

/** Buffer this much before writing: a write per 60 KiB chunk would be slow everywhere. */
const FLUSH_BYTES = 4 * 1024 * 1024
/** Shares this large stay off the JS heap (disk or OPFS) where the browser allows it. */
export const DISK_THRESHOLD = 256 * 1024 * 1024

export function memorySink(files: FileMeta[]): FileSink {
  let parts: Blob[] = []
  let pending: Uint8Array<ArrayBuffer>[] = []
  let bytes = 0
  const flush = () => {
    if (!pending.length) return
    parts.push(new Blob(pending))
    pending = []
    bytes = 0
  }
  return {
    kind: "memory",
    async write(_fi, data) {
      pending.push(data as Uint8Array<ArrayBuffer>)
      bytes += data.byteLength
      if (bytes >= FLUSH_BYTES) flush() // spills into a Blob, leaving the JS heap
    },
    async reset() {
      parts = []
      pending = []
      bytes = 0
    },
    async finish(fi) {
      flush()
      const blob = new Blob(parts, {
        type: files[fi]?.type || "application/octet-stream",
      })
      parts = []
      return blob
    },
    async abort() {
      parts = []
      pending = []
    },
  }
}

/**
 * Folder path segments from a sender-supplied name ("Photos/2024/a.jpg"). Anything that could
 * climb out of the chosen folder ("..", absolute or empty segments) flattens to a single safe name.
 */
export function safePath(name: string): string[] {
  const parts = name.split("/")
  if (parts.some((p) => p === "" || p === "." || p === ".."))
    return [safeFileName(name)]
  return parts.map((p) => safeFileName(p))
}

const notFound = (err: unknown) =>
  err instanceof DOMException && err.name === "NotFoundError"

/** "report.pdf", or "report (2).pdf" when the folder already has one: never overwrite. */
async function freeName(
  dir: FileSystemDirectoryHandle,
  name: string,
  kind: "file" | "directory",
) {
  const dot = kind === "file" ? name.lastIndexOf(".") : -1
  const [stem, ext] =
    dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""]
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`
    try {
      if (kind === "file") await dir.getFileHandle(candidate)
      else await dir.getDirectoryHandle(candidate)
    } catch (err) {
      if (notFound(err)) return candidate
      throw err
    }
  }
  throw new Error("No free file name")
}

/**
 * Writes into a file or folder handle: one the user picked, or one in the browser's private
 * storage. Writes go to a temporary swap file that the browser only commits on close, after
 * the digest matched.
 */
export function fsSink(
  target: FileSystemDirectoryHandle | FileSystemFileHandle,
  files: FileMeta[],
  kind: "disk" | "opfs",
): FileSink {
  let current: {
    fi: number
    handle: FileSystemFileHandle
    w: FileSystemWritableFileStream
    pos: number
  } | null = null
  let pending: Uint8Array<ArrayBuffer>[] = []
  let bytes = 0
  // Top-level names already claimed in the chosen folder, so a folder's files stay together.
  const tops = new Map<string, string>()

  const handleFor = async (fi: number): Promise<FileSystemFileHandle> => {
    if (target.kind === "file") return target
    const path = safePath(files[fi].name)
    const top = path[0]
    // Loose files each get their own free name: two "IMG_0001.jpg" must not share a file.
    if (path.length === 1)
      return target.getFileHandle(await freeName(target, top, "file"), {
        create: true,
      })
    let name = tops.get(top)
    if (!name) {
      name = await freeName(target, top, "directory")
      tops.set(top, name)
    }
    let dir = await target.getDirectoryHandle(name, { create: true })
    for (const segment of path.slice(1, -1))
      dir = await dir.getDirectoryHandle(segment, { create: true })
    return dir.getFileHandle(path.at(-1)!, { create: true })
  }

  const open = async (fi: number) => {
    if (current?.fi === fi) return current
    const handle = await handleFor(fi)
    const w = await handle.createWritable()
    current = { fi, handle, w, pos: 0 }
    return current
  }

  const flush = async () => {
    if (!pending.length || !current) return
    const data = new Blob(pending)
    pending = []
    bytes = 0
    await current.w.write({ type: "write", position: current.pos, data })
    current.pos += data.size
  }

  return {
    kind,
    async write(fi, data) {
      await open(fi)
      pending.push(data as Uint8Array<ArrayBuffer>)
      bytes += data.byteLength
      if (bytes >= FLUSH_BYTES) await flush()
    },
    async reset(fi) {
      const c = await open(fi)
      pending = []
      bytes = 0
      await c.w.truncate(0)
      c.pos = 0
    },
    async finish(fi) {
      const c = await open(fi)
      await flush()
      await c.w.close()
      current = null
      return c.handle.getFile()
    },
    async abort() {
      pending = []
      const c = current
      current = null
      await c?.w.abort().catch(() => {})
    },
  }
}

// ── Choosing a sink ──────────────────────────────────────────────────────────

interface PickerWindow {
  showDirectoryPicker?: (opts?: {
    id?: string
    mode?: "read" | "readwrite"
  }) => Promise<FileSystemDirectoryHandle>
  showSaveFilePicker?: (opts?: {
    id?: string
    suggestedName?: string
  }) => Promise<FileSystemFileHandle>
}

const OPFS_PREFIX = "signalshare-"
const OPFS_MAX_AGE_MS = 12 * 60 * 60 * 1000

async function opfsDir(sessionId: string, total: number) {
  if (
    typeof FileSystemFileHandle === "undefined" ||
    !("createWritable" in FileSystemFileHandle.prototype) ||
    !navigator.storage?.getDirectory
  )
    return null
  const { quota = 0, usage = 0 } = (await navigator.storage.estimate?.()) ?? {}
  if (quota - usage < total * 1.1) return null
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(`${OPFS_PREFIX}${Date.now()}-${sessionId}`, {
    create: true,
  })
}

/** Deletes private-storage folders: one share's (`only`), or every one older than 12 hours. */
export async function cleanOpfs(only?: string) {
  try {
    const root = await navigator.storage.getDirectory()
    for await (const name of (
      root as unknown as { keys(): AsyncIterable<string> }
    ).keys()) {
      if (!name.startsWith(OPFS_PREFIX)) continue
      const age =
        Date.now() - Number(name.slice(OPFS_PREFIX.length).split("-")[0])
      if (only ? name.endsWith(`-${only}`) : age > OPFS_MAX_AGE_MS)
        await root.removeEntry(name, { recursive: true }).catch(() => {})
    }
  } catch {
    // No private storage here: nothing to clean.
  }
}

/**
 * Must run inside the Receive click (pickers need a user gesture). Big shares and folders ask
 * where to save on Chrome/Edge; big shares elsewhere use private storage; the rest stays in memory.
 * Cancelling the picker is not an error: the share continues the default way.
 */
export async function pickSink(
  sessionId: string,
  files: FileMeta[],
): Promise<FileSink> {
  const total = files.reduce((n, f) => n + f.size, 0)
  const folders = files.some((f) => f.name.includes("/"))
  const w = window as unknown as PickerWindow
  if ((total >= DISK_THRESHOLD || folders) && w.showDirectoryPicker) {
    try {
      if (files.length === 1 && !folders && w.showSaveFilePicker) {
        const handle = await w.showSaveFilePicker({
          id: "signalshare",
          suggestedName: safeFileName(files[0].name),
        })
        return fsSink(handle, files, "disk")
      }
      const dir = await w.showDirectoryPicker({
        id: "signalshare",
        mode: "readwrite",
      })
      return fsSink(dir, files, "disk")
    } catch {
      // Cancelled, or no gesture (a reload resuming the share): fall through.
    }
  }
  if (total >= DISK_THRESHOLD) {
    const dir = await opfsDir(sessionId, total).catch(() => null)
    if (dir) return fsSink(dir, files, "opfs")
  }
  return memorySink(files)
}
