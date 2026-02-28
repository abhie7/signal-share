import type { FastifyInstance } from 'fastify';
import { sessionRegistry } from '../utils/sessions.js';

export default async function transferRoutes(fastify: FastifyInstance) {
  // Get session info
  fastify.get<{ Params: { id: string } }>('/api/transfer/:id', async (request, reply) => {
    const session = sessionRegistry.getById(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return {
      id: session.id,
      code: session.code,
      senderName: session.senderName,
      files: session.files,
      totalSize: session.totalSize,
      status: session.status,
      transferMode: session.transferMode,
    };
  });

  // SSE endpoint for remote file download
  // Receiver connects here. When sender pushes chunks via WebSocket,
  // they are forwarded through this SSE stream.
  fastify.get<{ Params: { id: string } }>('/api/transfer/:id/download', async (request, reply) => {
    const session = sessionRegistry.getById(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Register a chunk callback
    const onChunk = (chunk: Buffer | null) => {
      if (chunk === null) {
        // End of transfer
        reply.raw.write(`event: end\ndata: done\n\n`);
        reply.raw.end();
        return;
      }
      const base64 = chunk.toString('base64');
      reply.raw.write(`event: chunk\ndata: ${base64}\n\n`);
    };

    session.chunkCallbacks.push(onChunk);

    // Notify sender that receiver is ready for remote download
    if (session.senderWs && session.senderWs.readyState === session.senderWs.OPEN) {
      session.senderWs.send(
        JSON.stringify({
          type: 'receiver-ready',
          sessionId: session.id,
        }),
      );
    }

    // Cleanup on close
    request.raw.on('close', () => {
      const idx = session.chunkCallbacks.indexOf(onChunk);
      if (idx !== -1) session.chunkCallbacks.splice(idx, 1);
    });

    // Hijack the reply to prevent fastify from sending its own response
    await reply.hijack();
  });

  // SSE endpoint for transfer progress
  fastify.get<{ Params: { id: string } }>('/api/transfer/:id/progress', async (request, reply) => {
    const session = sessionRegistry.getById(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const onProgress = (progress: {
      bytesTransferred: number;
      totalBytes: number;
      speed: number;
      eta: number;
      currentFile: string;
      fileIndex: number;
      totalFiles: number;
    }) => {
      reply.raw.write(`event: progress\ndata: ${JSON.stringify(progress)}\n\n`);
    };

    session.progressCallbacks.push(onProgress);

    request.raw.on('close', () => {
      const idx = session.progressCallbacks.indexOf(onProgress);
      if (idx !== -1) session.progressCallbacks.splice(idx, 1);
    });

    await reply.hijack();
  });
}
