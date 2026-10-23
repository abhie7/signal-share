import { createHmac } from "node:crypto"
import type { IceServer } from "../lib/protocol.js"

const env = process.env
type Env = Record<string, string | undefined>
const list = (v: string | undefined) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []
const num = (v: string | undefined, fallback: number) =>
  v && Number.isFinite(Number(v)) ? Number(v) : fallback

export const dev = env.NODE_ENV !== "production"

/**
 * Keep-alive target pinged every 14 min so free hosts (Render sleeps after 15 min idle) don't
 * spin down mid-share. SELF_PING_URL wins ("" disables); on Render it defaults to
 * RENDER_EXTERNAL_URL/health in production.
 */
export function selfPingTarget(e: Env = env): string | null {
  if (e.SELF_PING_URL !== undefined) return e.SELF_PING_URL || null
  if (e.NODE_ENV === "production" && e.RENDER_EXTERNAL_URL)
    return `${e.RENDER_EXTERNAL_URL.replace(/\/$/, "")}/health`
  return null
}

/**
 * Which proxies may set X-Forwarded-*. Unset: Render's load balancer on Render (RENDER is set by
 * the platform and the app is only reachable through it), otherwise proxies on this machine.
 */
export function trustProxySetting(e: Env = env): boolean | string | string[] {
  const v = e.TRUST_PROXY
  if (v === undefined || v === "") return e.RENDER ? true : "loopback"
  if (v === "true" || v === "1") return true
  if (v === "false" || v === "0") return false
  return list(v)
}

export const config = {
  port: num(env.PORT, 3000),
  // Loopback in development so macOS does not prompt to allow incoming connections for `node`.
  // Set BIND_HOST=0.0.0.0 to expose the dev server to other devices (and see docs/DEPLOYMENT.md).
  bindHost: env.BIND_HOST || (dev ? "localhost" : "0.0.0.0"),
  // Which proxies may set X-Forwarded-For/-Host. Default "loopback": a request arriving from
  // 127.0.0.1 can only come from a proxy on this machine (cloudflared, nginx), so its headers
  // are trustworthy and each visitor keeps their real IP. TRUST_PROXY=true|false|<cidr list>.
  trustProxy: trustProxySetting(),
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, "") || null,
  allowedOrigins: list(env.ALLOWED_ORIGINS),
  httpsKeyFile: env.HTTPS_KEY_FILE,
  httpsCertFile: env.HTTPS_CERT_FILE,

  stunUrls:
    env.STUN_URLS !== undefined
      ? list(env.STUN_URLS)
      : ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
  turnUrls: list(env.TURN_URLS),
  turnSecret: env.TURN_SECRET,
  turnUsername: env.TURN_USERNAME,
  turnCredential: env.TURN_CREDENTIAL,
  turnTtlSeconds: num(env.TURN_TTL_SECONDS, 3600),
  iceTransportPolicy: (env.ICE_TRANSPORT_POLICY === "relay"
    ? "relay"
    : "all") as "all" | "relay",

  relayEnabled: env.RELAY_ENABLED !== "false",
  relayMaxBytes: num(env.RELAY_MAX_BYTES, 5 * 1024 ** 3),

  maxSocketsPerIp: num(env.MAX_SOCKETS_PER_IP, 30),
  maxSessions: num(env.MAX_SESSIONS, 5000),
  metricsToken: env.METRICS_TOKEN,
  selfPingUrl: selfPingTarget(),
  // Open-source repo shown in the header/footer with its star count. "" hides it.
  githubRepo: env.GITHUB_REPO ?? "abhie7/signal-share",
}

export const turnConfigured =
  config.turnUrls.length > 0 &&
  Boolean(config.turnSecret || (config.turnUsername && config.turnCredential))

/**
 * ICE servers handed to each client. With TURN_SECRET the credentials are short-lived and
 * follow the TURN REST API convention (coturn `use-auth-secret`): username = "<expiry>:<id>",
 * credential = base64(HMAC-SHA1(secret, username)).
 */
export function iceServersFor(peerId: string, now = Date.now()): IceServer[] {
  const servers: IceServer[] = []
  if (config.stunUrls.length) servers.push({ urls: config.stunUrls })
  if (!turnConfigured) return servers

  if (config.turnSecret) {
    const username = `${Math.floor(now / 1000) + config.turnTtlSeconds}:${peerId}`
    const credential = createHmac("sha1", config.turnSecret)
      .update(username)
      .digest("base64")
    servers.push({ urls: config.turnUrls, username, credential })
  } else {
    servers.push({
      urls: config.turnUrls,
      username: config.turnUsername,
      credential: config.turnCredential,
    })
  }
  return servers
}
