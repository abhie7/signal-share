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

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveKey",
  ]) as Promise<CryptoKeyPair>
}

export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return subtle().exportKey("jwk", key)
}

export async function deriveKey(
  privateKey: CryptoKey,
  remote: JsonWebKey,
): Promise<CryptoKey> {
  const pub = await subtle().importKey(
    "jwk",
    remote,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  )
  return subtle().deriveKey(
    { name: "ECDH", public: pub },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

/** AES-GCM with a random 96-bit IV prefixed to the ciphertext. */
export async function seal(
  key: CryptoKey,
  plain: ArrayBuffer,
): Promise<ArrayBuffer> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await subtle().encrypt({ name: "AES-GCM", iv }, key, plain),
  )
  const out = new Uint8Array(12 + cipher.byteLength)
  out.set(iv)
  out.set(cipher, 12)
  return out.buffer
}

export async function open(
  key: CryptoKey,
  sealed: ArrayBuffer,
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(sealed)
  return subtle().decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    key,
    bytes.subarray(12),
  )
}
