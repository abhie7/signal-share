import next from "next"
import { buildApp } from "./app.js"
import { config, dev, turnConfigured } from "./config.js"

async function main() {
  const nextApp = next({ dev })
  const handle = nextApp.getRequestHandler()
  await nextApp.prepare()

  const { fastify, markReady, shutdown } = await buildApp()

  // Next.js assets are served before Fastify routing; WebSocket upgrades are left alone.
  fastify.addHook("onRequest", async (request, reply) => {
    if (request.headers.upgrade?.toLowerCase() === "websocket") return
    const url = request.raw.url || ""
    if (url.startsWith("/_next/") || url.startsWith("/__nextjs_")) {
      reply.hijack()
      await handle(request.raw, reply.raw)
    }
  })

  fastify.setNotFoundHandler(async (request, reply) => {
    reply.hijack()
    await handle(request.raw, reply.raw)
  })

  await fastify.listen({ port: config.port, host: config.bindHost })

  // Route Next's dev HMR socket before @fastify/websocket sees the upgrade.
  // Any /_next/ upgrade belongs to Next (the path moved from /_next/webpack-hmr
  // to /_next/hmr in Next 16.4; matching only the old one stalled navigation in dev).
  const fastifyUpgrade = fastify.server.listeners("upgrade").slice() as Array<
    (...args: unknown[]) => void
  >
  fastify.server.removeAllListeners("upgrade")
  fastify.server.on("upgrade", (req, socket, head) => {
    if (dev && (req.url || "").startsWith("/_next/")) {
      nextApp.getUpgradeHandler()(req, socket, head)
      return
    }
    for (const listener of fastifyUpgrade) listener(req, socket, head)
  })

  markReady()
  const proto = config.httpsCertFile ? "https" : "http"
  fastify.log.warn(
    { relay: config.relayEnabled, turn: turnConfigured, bind: config.bindHost },
    `SignalShare listening on ${proto}://${config.bindHost === "0.0.0.0" ? "localhost" : config.bindHost}:${config.port}`,
  )

  if (config.selfPingUrl) {
    // Free hosts (Render) sleep after 15 min without inbound traffic; ping ourselves every 14.
    const url = config.selfPingUrl
    fastify.log.warn({ url }, "keep-alive: pinging every 14 min")
    setInterval(
      () =>
        fetch(url, { signal: AbortSignal.timeout(10_000) }).catch((err) =>
          fastify.log.warn({ err: String(err) }, "keep-alive ping failed"),
        ),
      14 * 60 * 1000,
    ).unref()
  }

  let closing = false
  const stop = async (signal: string) => {
    if (closing) return
    closing = true
    fastify.log.warn({ signal }, "shutting down")
    const force = setTimeout(() => process.exit(1), 10_000)
    force.unref()
    await shutdown().catch((err) =>
      fastify.log.error({ err }, "shutdown error"),
    )
    process.exit(0)
  }
  process.on("SIGTERM", () => void stop("SIGTERM"))
  process.on("SIGINT", () => void stop("SIGINT"))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
