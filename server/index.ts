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
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: dev ? 'info' : 'warn',
    },
    // Increase body size limit for file metadata
    bodyLimit: 10 * 1024 * 1024, // 10MB
  });

  // Register plugins
  await fastify.register(fastifyCors, {
    origin: true,
  });

  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 2 * 1024 * 1024, // 2MB per WS message (for file chunks)
    },
  });

  // Register API routes
  await fastify.register(healthRoutes);
  await fastify.register(wsRoutes);
  await fastify.register(transferRoutes);

  // Pass all other requests to Next.js
  // Use a raw handler instead of fastify.all to avoid route conflicts with CORS plugin
  fastify.route({
    method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    url: '/*',
    handler: async (request, reply) => {
      const parsedUrl = parse(request.url, true);
      await handle(request.raw, reply.raw, parsedUrl);
      reply.hijack();
    },
  });

  // Start server
  try {
    await fastify.listen({ port, host: hostname });
    console.log(`\n  🚀 P2P Share running at http://localhost:${port}\n`);

    // Ping health endpoint every 14 minutes to prevent Render sleep mode
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
      console.log('Health check pinging enabled (every 14 minutes)\n');
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
