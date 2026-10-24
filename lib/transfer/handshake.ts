// Share keys that the SignalShare server can't learn or swap.
//
// Every share does one ephemeral ECDH (P-256) through signaling. The result is mixed (HKDF)
// with the share secret from the link's #fragment, which browsers never send to a server.
// The sender proves it holds the same keys (HMAC confirmation), so whoever opened the link
// catches a server that swapped keys before anything reaches them. Without a secret (code
// entry, nearby invites, a link whose fragment was stripped) the keys are still fresh per
// share, and both screens show a 4-digit security code to compare.
//
// Limit: the sender accepts a secret-less (code) join, because codes are a normal way in. So
// a malicious server could claim the share first, pretending to be a code join; the sender then
// shows a security code nobody can match, and the real recipient gets an error. Only request
// answers (strictKeys) refuse secret-less joins outright.
//
// The keys then authenticate every path: the relay is sealed with them, and WebRTC (data and
// screen) is accepted only after both sides MAC their view of the DTLS fingerprints.

/** link: the link's secret; pair: a device pairing's secret; sas: compare the 4 digits. */
export type KeyMode = "link" | "pair" | "sas"

export interface ShareKeys {
  mode: KeyMode
  /** HMAC key for confirmations and path checks. */
  mac: CryptoKey
  /** AES-GCM key for the encrypted relay. */
  relay: CryptoKey
  /** Four digits both screens show; equal means nobody is in the middle. */
  sas: string
}

const subtle = () => globalThis.crypto.subtle
const enc = new TextEncoder()

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** 128-bit share secret for the link fragment. */
export const newSecret = () =>
  b64url(globalThis.crypto.getRandomValues(new Uint8Array(16)))

export const isSecret = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s)

export async function keyPair() {
  const pair = (await subtle().generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  )) as CryptoKeyPair
  return { pair, pub: await subtle().exportKey("jwk", pair.publicKey) }
}

/** Both sides call this with the same secret (or none) and get the same keys. */
export async function deriveKeys(
  priv: CryptoKey,
  remote: JsonWebKey,
  secret: string | null,
  sessionId: string,
): Promise<ShareKeys> {
  const pub = await subtle().importKey(
    "jwk",
    remote,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  )
  const shared = await subtle().deriveBits(
    { name: "ECDH", public: pub },
    priv,
    256,
  )
  const ikm = await subtle().importKey("raw", shared, "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ])
  const salt = secret ? fromB64url(secret) : new Uint8Array(0)
  const hkdf = (info: string) => ({
    name: "HKDF",
    hash: "SHA-256",
    salt,
    info: enc.encode(`signalshare/3 ${info} ${sessionId}`),
  })
  const mac = await subtle().deriveKey(
    hkdf("mac"),
    ikm,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  )
  const relay = await subtle().deriveKey(
    hkdf("relay"),
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
  const sasBits = new Uint8Array(
    await subtle().deriveBits(hkdf("sas"), ikm, 32),
  )
  const sas = String(
    new DataView(sasBits.buffer).getUint32(0) % 10_000,
  ).padStart(4, "0")
  return { mode: secret ? "link" : "sas", mac, relay, sas }
}

export async function tag(keys: ShareKeys, label: string): Promise<string> {
  return b64url(
    new Uint8Array(await subtle().sign("HMAC", keys.mac, enc.encode(label))),
  )
}

/** Constant-time check (WebCrypto's verify) of a tag from the other side. */
export async function checkTag(
  keys: ShareKeys,
  label: string,
  value: unknown,
): Promise<boolean> {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
    return false
  return subtle().verify("HMAC", keys.mac, fromB64url(value), enc.encode(label))
}

/** DTLS certificate fingerprints from an SDP, normalised so both sides compare equal. */
export function sdpFingerprints(sdp: string | undefined): string {
  return [...(sdp ?? "").matchAll(/^a=fingerprint:(\S+) (\S+)\s*$/gim)]
    .map((m) => `${m[1].toLowerCase()} ${m[2].toUpperCase()}`)
    .sort()
    .join(",")
}

/**
 * The label a side MACs to vouch for a WebRTC connection: who it is, and the fingerprints of
 * both ends as it sees them. A relaying man-in-the-middle makes the two views differ.
 */
export function dtlsLabel(
  role: "sender" | "receiver",
  pc: RTCPeerConnection,
  side: "mine" | "theirs",
) {
  const local = sdpFingerprints(pc.localDescription?.sdp)
  const remote = sdpFingerprints(pc.remoteDescription?.sdp)
  // "mine": I am `role`; "theirs": the label the other side (`role`) should have sent.
  const [a, b] = side === "mine" ? [local, remote] : [remote, local]
  return `dtls ${role} ${a} | ${b}`
}
