import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import next from 'next';
import { parse } from 'url';
import cron from 'node-cron';

import wsRoutes from './routes/ws.js';
import transferRoutes from './routes/transfer.js';
import healthRoutes from './routes/health.js';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';

async function main() {
  // Prepare Next.js
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: dev ? 'info' : 'warn',
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
  });

  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 2 * 1024 * 1024, // 2MB
    },
  });

  // Register API routes
  await fastify.register(healthRoutes);
  await fastify.register(wsRoutes);
  await fastify.register(transferRoutes);

  // Skip Next.js handling for WebSocket upgrade requests entirely —
  // otherwise Fastify sends a reply and then @fastify/websocket also tries to,
  // causing the "Reply was already sent" error on /api/ws
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.headers.upgrade?.toLowerCase() === 'websocket') return;

    const url = request.raw.url || '';
    if (url.startsWith('/_next/') || url.startsWith('/__nextjs_')) {
      reply.hijack();
      await handle(request.raw, reply.raw, parse(url, true));
    }
  });

  // Catch-all for all other pages/routes → Next.js
  fastify.setNotFoundHandler(async (request, reply) => {
    reply.hijack();
    await handle(request.raw, reply.raw, parse(request.url, true));
  });

  await fastify.listen({ port, host: hostname });

  // Hijack upgrade listeners so HMR is handled BEFORE @fastify/websocket sees it.
  // @fastify/websocket registers its own 'upgrade' listener during plugin registration,
  // so we snapshot those, wipe them, and prepend our own router.
  const existingUpgradeListeners = fastify.server.listeners('upgrade').slice();
  fastify.server.removeAllListeners('upgrade');

  fastify.server.on('upgrade', (req, socket, head) => {
    const url = req.url || '';

    if (dev && url.startsWith('/_next/webpack-hmr')) {
      // Hand off directly to Next.js internal HMR handler
      app.getUpgradeHandler()(req, socket, head);
      return;
    }

    // All other WS upgrades (your /api/ws etc.) → @fastify/websocket
    for (const listener of existingUpgradeListeners) {
      (listener as Function)(req, socket, head);
    }
  });

  console.log(`\n  🚀 P2P Share running at http://localhost:${port}\n`);

  if (process.env.NODE_ENV === 'production') {
    cron.schedule('*/14 * * * *', async () => {
      try {
        const host = process.env.HOST || `localhost:${port}`;
        await fetch(`http://${host}/health`);
        console.log(`[${new Date().toISOString()}] Health check ping sent`);
      } catch (err) {
        console.error('Health check ping failed:', err);
      }
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});