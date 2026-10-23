import { readFileSync } from "node:fs"
import Fastify, { type FastifyRequest } from "fastify"
import fastifyWebsocket from "@fastify/websocket"
import { KeyedLimiter } from "./rate-limit.js"
import { config, dev } from "./config.js"
import { Hub } from "./hub.js"

/** Builds the API server (no Next.js) so tests can run it in-process. */
export async function buildApp(opts: { logger?: boolean } = {}) {
  const https =
    config.httpsKeyFile && config.httpsCertFile
      ? {
          key: readFileSync(config.httpsKeyFile),
          cert: readFileSync(config.httpsCertFile),
        }
      : null

  const fastify = Fastify({
    ...(https ? { https } : {}),
    logger: opts.logger === false ? false : { level: dev ? "info" : "warn" },
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
  })

  const hub = new Hub(fastify.log)
  const state = { ready: false, shuttingDown: false }
  const previewLimiter = new KeyedLimiter(60, 1)

  await fastify.register(fastifyWebsocket, {
    options: { maxPayload: 256 * 1024 },
  })

  fastify.addHook("onSend", async (req, reply) => {
    if (
      req.url.startsWith("/api/") ||
      req.url === "/health" ||
      req.url === "/ready"
    ) {
      reply.header("Cache-Control", "no-store")
      reply.header("X-Content-Type-Options", "nosniff")
    }
  })

  // Same-origin by default; ALLOWED_ORIGINS lists extra origins (e.g. a separately hosted UI).
  const originAllowed = (req: FastifyRequest) => {
    const origin = req.headers.origin
    if (!origin) return true // non-browser clients
    try {
      const url = new URL(origin)
      // req.host honours X-Forwarded-Host from a trusted proxy (e.g. a tunnel).
      return (
        url.host === req.headers.host ||
        url.host === req.host ||
        config.allowedOrigins.includes(origin)
      )
    } catch {
      return false
    }
  }

  fastify.get("/health", async () => ({ status: "ok" }))

  fastify.get("/ready", async (_req, reply) => {
    const ok = state.ready && !state.shuttingDown
    return reply.code(ok ? 200 : 503).send({
      ready: ok,
      connections: hub.connections,
      sessions: hub.registry.size,
    })
  })

  // Repo link + star count. Fetched server-side and cached for an hour, so visitors never
  // contact GitHub and the CSP stays same-origin. Failures keep the last known count.
  const repo = {
    url: config.githubRepo ? `https://github.com/${config.githubRepo}` : null,
    stars: null as number | null,
    fetchedAt: 0,
  }
  fastify.get("/api/repo", async () => {
    if (repo.url && Date.now() - repo.fetchedAt > 60 * 60 * 1000) {
      repo.fetchedAt = Date.now()
      try {
        const res = await fetch(
          `https://api.github.com/repos/${config.githubRepo}`,
          {
            headers: {
              accept: "application/vnd.github+json",
              "user-agent": "signalshare",
            },
            signal: AbortSignal.timeout(4000),
          },
        )
        const body = (await res.json()) as { stargazers_count?: unknown }
        if (res.ok && typeof body.stargazers_count === "number")
          repo.stars = body.stargazers_count
        else repo.fetchedAt = Date.now() - 55 * 60 * 1000 // retry in ~5 min
      } catch {
        repo.fetchedAt = Date.now() - 55 * 60 * 1000
      }
    }
    return { url: repo.url, stars: repo.stars }
  })

  fastify.get("/metrics", async (req, reply) => {
    if (
      !config.metricsToken ||
      req.headers.authorization !== `Bearer ${config.metricsToken}`
    )
      return reply.code(404).send()
    return {
      ...hub.metrics,
      "ws.connections": hub.connections,
      sessions: hub.registry.size,
    }
  })

  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (req, reply) => {
      if (!previewLimiter.take(req.ip))
        return reply
          .code(429)
          .send({ error: { code: "RATE_LIMITED", message: "Slow down" } })
      const session = hub.registry.get(req.params.id)
      if (!session)
        return reply.code(404).send({
          error: {
            code: "SESSION_NOT_FOUND",
            message: "This share has ended or expired.",
          },
        })
      return hub.registry.preview(session)
    },
  )

  // navigator.sendBeacon target so a closing tab ends its share immediately.
  fastify.addContentTypeParser(
    "text/plain",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string))
      } catch {
        done(null, {})
      }
    },
  )
  fastify.post<{ Params: { id: string }; Body: { token?: unknown } }>(
    "/api/sessions/:id/leave",
    async (req, reply) => {
      if (!originAllowed(req)) return reply.code(403).send()
      const token = typeof req.body?.token === "string" ? req.body.token : ""
      return reply.code(hub.leave(req.params.id, token) ? 204 : 403).send()
    },
  )

  const wsGuard = async (
    req: FastifyRequest,
    reply: { code: (n: number) => { send: () => void } },
  ) => {
    if (state.shuttingDown) return reply.code(503).send()
    if (!originAllowed(req)) {
      hub.count("ws.rejected_origin")
      return reply.code(403).send()
    }
  }

  fastify.register(async (scope) => {
    scope.get(
      "/api/ws",
      { websocket: true, preValidation: wsGuard },
      (socket, req) => hub.accept(socket, req.ip),
    )
    scope.get<{ Querystring: { session?: string } }>(
      "/api/relay",
      { websocket: true, preValidation: wsGuard },
      (socket, req) => hub.acceptRelay(socket, String(req.query.session ?? "")),
    )
  })

  hub.start()

  return {
    fastify,
    hub,
    markReady: () => (state.ready = true),
    shutdown: async () => {
      state.shuttingDown = true
      hub.shutdown()
      await fastify.close()
    },
  }
}
