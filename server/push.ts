import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto"

// Web Push without payloads: a wake-up call to a paired device whose tab is closed. Nothing
// about the share is in it (there is no body at all), so no payload encryption is needed; the
// service worker shows a generic notification. Requests are VAPID-signed (RFC 8292).

/** Only browser push services: never let a client make the server call an arbitrary URL. */
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
]

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return (
      url.protocol === "https:" &&
      !url.port &&
      PUSH_HOSTS.some((re) => re.test(url.hostname))
    )
  } catch {
    return false
  }
}

const b64url = (buf: Buffer) => buf.toString("base64url")

export interface Vapid {
  /** Uncompressed P-256 point, base64url: the browser's applicationServerKey. */
  publicKey: string
  key: KeyObject
  subject: string
}

/**
 * Keys from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (base64url raw), or fresh ones per process.
 * Fresh keys are fine for an in-memory server: devices re-subscribe when the key changes.
 */
export function vapidKeys(
  env: Record<string, string | undefined>,
  subject: string,
): Vapid {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    const pub = Buffer.from(env.VAPID_PUBLIC_KEY, "base64url")
    const key = createPrivateKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: b64url(pub.subarray(1, 33)),
        y: b64url(pub.subarray(33, 65)),
        d: env.VAPID_PRIVATE_KEY,
      },
      format: "jwk",
    })
    return { publicKey: env.VAPID_PUBLIC_KEY, key, subject }
  }
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
  const jwk = createPublicKey(privateKey).export({ format: "jwk" })
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x!, "base64url"),
    Buffer.from(jwk.y!, "base64url"),
  ])
  return { publicKey: b64url(raw), key: privateKey, subject }
}

/** VAPID JWT for one push service origin, valid 12 hours. */
export function vapidJwt(v: Vapid, audience: string, now = Date.now()) {
  const header = b64url(
    Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  )
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: v.subject,
      }),
    ),
  )
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
    key: v.key,
    dsaEncoding: "ieee-p1363",
  })
  return `${header}.${claims}.${b64url(signature)}`
}

/** Sends an empty push. Resolves false if the subscription is gone (404/410) or unreachable. */
export async function wake(v: Vapid, endpoint: string): Promise<boolean> {
  if (!isPushEndpoint(endpoint)) return false
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "300",
      Urgency: "high",
      Authorization: `vapid t=${vapidJwt(v, new URL(endpoint).origin)}, k=${v.publicKey}`,
      "Content-Length": "0",
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
  return Boolean(res && res.status >= 200 && res.status < 300)
}
