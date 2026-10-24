// WebCrypto helpers. Requires a secure context (HTTPS or localhost).

const subtle = () => globalThis.crypto.subtle

export async function sha256(data: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest("SHA-256", data))
}

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

/** Per-file digest: SHA-256 over the concatenated SHA-256 of each chunk. */
export async function foldDigests(chunkDigests: Uint8Array[]): Promise<string> {
  const all = new Uint8Array(chunkDigests.length * 32)
  chunkDigests.forEach((d, i) => all.set(d, i * 32))
  return toHex(await sha256(all))
}

/** AES-GCM with a random 96-bit IV prefixed to the ciphertext. */
export async function seal(
  key: CryptoKey,
  plain: BufferSource,
  aad?: BufferSource,
): Promise<ArrayBuffer> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, ...(aad ? { additionalData: aad } : {}) },
      key,
      plain,
    ),
  )
  const out = new Uint8Array(12 + cipher.byteLength)
  out.set(iv)
  out.set(cipher, 12)
  return out.buffer
}

export async function open(
  key: CryptoKey,
  sealed: ArrayBuffer,
  aad?: BufferSource,
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(sealed)
  return subtle().decrypt(
    {
      name: "AES-GCM",
      iv: bytes.subarray(0, 12),
      ...(aad ? { additionalData: aad } : {}),
    },
    key,
    bytes.subarray(12),
  )
}
