// A zip of already-received files, without compression and without copying them: the archive
// is a Blob made of small headers around the original (often disk-backed) Blobs. Only the CRC
// needs a pass over the bytes, streamed. Classic zip only (under 4 GB, under 65,535 files).

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export async function crc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    for (let i = 0; i < value.length; i++)
      crc = TABLE[(crc ^ value[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export const ZIP_LIMIT = 0xffffffff

function dosTime(d: Date) {
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const date =
    ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, date }
}

export async function zipStore(
  entries: Array<{ path: string; blob: Blob }>,
  now = new Date(),
): Promise<Blob> {
  const total = entries.reduce((n, e) => n + e.blob.size, 0)
  if (entries.length > 0xffff || total + entries.length * 1024 > ZIP_LIMIT)
    throw new Error("Too large for a zip file")
  const { time, date } = dosTime(now)
  const enc = new TextEncoder()
  const parts: BlobPart[] = []
  const central: Uint8Array<ArrayBuffer>[] = []
  let offset = 0

  for (const { path, blob } of entries) {
    const name = enc.encode(path)
    const crc = await crc32(blob)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, blob.size, true)
    local.setUint32(22, blob.size, true)
    local.setUint16(26, name.length, true)
    parts.push(local.buffer, name, blob)

    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true) // made by
    dir.setUint16(6, 20, true) // needed
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(10, 0, true)
    dir.setUint16(12, time, true)
    dir.setUint16(14, date, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, blob.size, true)
    dir.setUint32(24, blob.size, true)
    dir.setUint16(28, name.length, true)
    dir.setUint32(42, offset, true)
    const record = new Uint8Array(46 + name.length)
    record.set(new Uint8Array(dir.buffer), 0)
    record.set(name, 46)
    central.push(record)
    offset += 30 + name.length + blob.size
  }

  const size = central.reduce((n, c) => n + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], {
    type: "application/zip",
  })
}
