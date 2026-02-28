import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { networkInterfaces } from 'os';
import { generateName } from '../utils/names.js';
import { peerRegistry } from '../utils/peers.js';
import { sessionRegistry } from '../utils/sessions.js';
import { extractSubnet, getClientIP, isPrivateIP } from '../utils/network.js';

function getLanAddress(port: number): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return `${net.address}:${port}`;
      }
    }
  }
  return `localhost:${port}`;
}

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

function safeSend(ws: WebSocket, data: WsMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToSubnet(subnet: string, excludeId: string, data: WsMessage): void {
  const peers = peerRegistry.getSubnetPeers(subnet, excludeId);
  const message = JSON.stringify(data);
  for (const peer of peers) {
    if (peer.ws.readyState === peer.ws.OPEN) {
      peer.ws.send(message);
    }
  }
}

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/ws', { websocket: true }, (socket: WebSocket, request) => {
    const peerId = nanoid(10);
    const ip = getClientIP(request);
    const subnet = extractSubnet(ip);
    const name = generateName();

    // Register this peer
    peerRegistry.add({
      id: peerId,
      name,
      ip,
      subnet,
      ws: socket,
      connectedAt: Date.now(),
    });

    // Send welcome with peer info
    safeSend(socket, {
      type: 'welcome',
      peerId,
      name,
      subnet,
      isLocal: isPrivateIP(ip),
    });

    // Broadcast to same-subnet peers
    broadcastToSubnet(subnet, peerId, {
      type: 'peer-joined',
      peer: { id: peerId, name },
    });

    // Send existing nearby peers to the new peer
    const nearbyPeers = peerRegistry.getSubnetPeers(subnet, peerId);
    safeSend(socket, {
      type: 'nearby-peers',
      peers: nearbyPeers.map((p) => ({ id: p.id, name: p.name })),
    });

    socket.on('message', (raw: Buffer) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      handleMessage(socket, peerId, subnet, msg);
    });

    socket.on('close', () => {
      const peer = peerRegistry.remove(peerId);
      if (peer) {
        broadcastToSubnet(subnet, peerId, {
          type: 'peer-left',
          peerId,
        });
      }

      // Clean up any sessions this peer was part of — notify the other party
      const senderSessions = sessionRegistry.getSessionsBySender(peerId);
      for (const session of senderSessions) {
        if (session.status === 'waiting' || session.status === 'connecting') {
          sessionRegistry.remove(session.id);
        } else if (session.status === 'transferring') {
          // Transfer was in progress — notify receiver
          session.status = 'cancelled';
          if (session.receiverWs) {
            safeSend(session.receiverWs, {
              type: 'transfer-error',
              sessionId: session.id,
              reason: 'Sender disconnected (page closed or refreshed)',
              fromId: peerId,
            });
          }
          sessionRegistry.remove(session.id);
        }
      }

      // Also check sessions where this peer is receiver
      const receiverSessions = sessionRegistry.getSessionsByReceiver(peerId);
      for (const session of receiverSessions) {
        if (session.status === 'transferring' || session.status === 'connecting') {
          session.status = 'cancelled';
          if (session.senderWs) {
            safeSend(session.senderWs, {
              type: 'transfer-error',
              sessionId: session.id,
              reason: 'Receiver disconnected (page closed or refreshed)',
              fromId: peerId,
            });
          }
          sessionRegistry.remove(session.id);
        }
      }
    });

    socket.on('error', (err) => {
      fastify.log.error({ err, peerId }, 'WebSocket error');
    });
  });
}

function handleMessage(
  socket: WebSocket,
  peerId: string,
  subnet: string,
  msg: WsMessage,
): void {
  switch (msg.type) {
    case 'create-session': {
      const files = msg.files as Array<{ name: string; size: number; type: string }>;
      if (!files || !Array.isArray(files) || files.length === 0) {
        safeSend(socket, { type: 'error', message: 'No files provided' });
        return;
      }

      const peer = peerRegistry.get(peerId);
      const session = sessionRegistry.create(peerId, peer?.name || 'Unknown', files);
      session.senderWs = socket;

      const port = parseInt(process.env.PORT || '3000', 10);
      const host = process.env.HOST || getLanAddress(port);
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

      safeSend(socket, {
        type: 'session-created',
        sessionId: session.id,
        code: session.code,
        shareLink: `${protocol}://${host}/receive/${session.id}`,
      });
      break;
    }

    case 'join-by-code': {
      const code = msg.code as string;
      if (!code) {
        safeSend(socket, { type: 'error', message: 'No code provided' });
        return;
      }

      const session = sessionRegistry.getByCode(code);
      if (!session) {
        safeSend(socket, { type: 'error', message: 'Invalid code', errorCode: 'INVALID_CODE' });
        return;
      }

      const peer = peerRegistry.get(peerId);
      const joined = sessionRegistry.joinSession(session.id, peerId, peer?.name || 'Unknown');
      if (!joined) {
        safeSend(socket, { type: 'error', message: 'Cannot join session' });
        return;
      }

      joined.receiverWs = socket;

      // Check if sender and receiver are on the same subnet -> local WebRTC transfer
      const senderPeer = peerRegistry.get(session.senderId);
      const isLocal = senderPeer?.subnet === subnet;
      joined.transferMode = isLocal ? 'local' : 'remote';

      safeSend(socket, {
        type: 'session-joined',
        sessionId: session.id,
        senderId: session.senderId,
        senderName: session.senderName,
        files: session.files,
        totalSize: session.totalSize,
        transferMode: joined.transferMode,
      });

      // Notify sender
      if (session.senderWs) {
        safeSend(session.senderWs, {
          type: 'receiver-joined',
          sessionId: session.id,
          receiverId: peerId,
          receiverName: peer?.name || 'Unknown',
          transferMode: joined.transferMode,
        });
      }
      break;
    }

    case 'join-by-link': {
      const sessionId = msg.sessionId as string;
      if (!sessionId) {
        safeSend(socket, { type: 'error', message: 'No session ID provided' });
        return;
      }

      const session = sessionRegistry.getById(sessionId);
      if (!session) {
        safeSend(socket, { type: 'error', message: 'Session not found', errorCode: 'SESSION_NOT_FOUND' });
        return;
      }

      const peer = peerRegistry.get(peerId);
      const joined = sessionRegistry.joinSession(sessionId, peerId, peer?.name || 'Unknown');
      if (!joined) {
        safeSend(socket, { type: 'error', message: 'Cannot join session' });
        return;
      }

      joined.receiverWs = socket;

      const senderPeer = peerRegistry.get(session.senderId);
      const isLocal = senderPeer?.subnet === subnet;
      joined.transferMode = isLocal ? 'local' : 'remote';

      safeSend(socket, {
        type: 'session-joined',
        sessionId: session.id,
        senderId: session.senderId,
        senderName: session.senderName,
        files: session.files,
        totalSize: session.totalSize,
        transferMode: joined.transferMode,
      });

      if (session.senderWs) {
        safeSend(session.senderWs, {
          type: 'receiver-joined',
          sessionId: session.id,
          receiverId: peerId,
          receiverName: peer?.name || 'Unknown',
          transferMode: joined.transferMode,
        });
      }
      break;
    }

    // WebRTC signaling relay
    case 'rtc-offer':
    case 'rtc-answer':
    case 'rtc-ice-candidate':
    case 'receiver-rtc-ready': {
      const targetId = msg.targetId as string;
      const targetPeer = peerRegistry.get(targetId);
      if (targetPeer) {
        safeSend(targetPeer.ws, {
          ...msg,
          fromId: peerId,
        });
      }
      break;
    }

    // Remote transfer: sender pushes file chunks to server
    case 'file-chunk': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      const chunkData = msg.data as string; // base64 encoded
      const chunk = Buffer.from(chunkData, 'base64');

      // Forward to all registered chunk callbacks (SSE receivers)
      for (const cb of session.chunkCallbacks) {
        cb(chunk);
      }
      break;
    }

    case 'file-chunk-end': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      // Signal end to all chunk callbacks
      for (const cb of session.chunkCallbacks) {
        cb(null);
      }
      session.chunkCallbacks = [];
      break;
    }

    case 'transfer-progress': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      const progress = msg.progress as {
        bytesTransferred: number;
        totalBytes: number;
        speed: number;
        eta: number;
        currentFile: string;
        fileIndex: number;
        totalFiles: number;
      };

      for (const cb of session.progressCallbacks) {
        cb(progress);
      }

      // Also forward to the other party via WS
      const targetWs = peerId === session.senderId ? session.receiverWs : session.senderWs;
      if (targetWs) {
        safeSend(targetWs, {
          type: 'transfer-progress',
          sessionId,
          progress,
        });
      }
      break;
    }

    case 'transfer-complete': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      session.status = 'complete';

      // Notify both parties
      if (session.senderWs) {
        safeSend(session.senderWs, { type: 'transfer-complete', sessionId });
      }
      if (session.receiverWs) {
        safeSend(session.receiverWs, { type: 'transfer-complete', sessionId });
      }

      // Clean up after a delay
      setTimeout(() => sessionRegistry.remove(sessionId), 60000);
      break;
    }

    case 'transfer-cancel': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      session.status = 'cancelled';

      const targetWs = peerId === session.senderId ? session.receiverWs : session.senderWs;
      if (targetWs) {
        safeSend(targetWs, { type: 'transfer-cancelled', sessionId });
      }

      sessionRegistry.remove(sessionId);
      break;
    }

    // Send file to a nearby peer directly (initiates a session + offer)
    case 'send-to-peer': {
      const targetPeerId = msg.targetPeerId as string;
      const files = msg.files as Array<{ name: string; size: number; type: string }>;
      const targetPeer = peerRegistry.get(targetPeerId);
      if (!targetPeer) {
        safeSend(socket, { type: 'error', message: 'Peer not found' });
        return;
      }

      const peer = peerRegistry.get(peerId);
      const session = sessionRegistry.create(peerId, peer?.name || 'Unknown', files);
      session.senderWs = socket;
      session.transferMode = 'local';

      // Notify target peer of incoming transfer request
      safeSend(targetPeer.ws, {
        type: 'incoming-transfer',
        sessionId: session.id,
        senderId: peerId,
        senderName: peer?.name || 'Unknown',
        files: session.files,
        totalSize: session.totalSize,
      });

      safeSend(socket, {
        type: 'session-created',
        sessionId: session.id,
        code: session.code,
        targetPeerId,
      });
      break;
    }

    case 'accept-transfer': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      const peer = peerRegistry.get(peerId);
      const joined = sessionRegistry.joinSession(sessionId, peerId, peer?.name || 'Unknown');
      if (!joined) return;

      joined.receiverWs = socket;
      joined.transferMode = 'local';

      // Notify sender to start WebRTC
      if (session.senderWs) {
        safeSend(session.senderWs, {
          type: 'transfer-accepted',
          sessionId,
          receiverId: peerId,
          receiverName: peer?.name || 'Unknown',
        });
      }
      break;
    }

    case 'decline-transfer': {
      const sessionId = msg.sessionId as string;
      const session = sessionRegistry.getById(sessionId);
      if (!session) return;

      if (session.senderWs) {
        safeSend(session.senderWs, {
          type: 'transfer-declined',
          sessionId,
        });
      }

      sessionRegistry.remove(sessionId);
      break;
    }

    case 'update-identity': {
      const newName = msg.name as string;
      if (!newName || typeof newName !== 'string') return;

      const peer = peerRegistry.get(peerId);
      if (peer) {
        const oldName = peer.name;
        peer.name = newName;

        // Broadcast name change to subnet peers
        if (oldName !== newName) {
          broadcastToSubnet(subnet, peerId, {
            type: 'peer-updated',
            peer: { id: peerId, name: newName },
          });
        }
      }
      break;
    }

    case 'transfer-error': {
      const targetId = msg.targetId as string;
      const reason = msg.reason as string;
      const sId = msg.sessionId as string;
      const targetPeer = peerRegistry.get(targetId);
      if (targetPeer) {
        safeSend(targetPeer.ws, {
          type: 'transfer-error',
          sessionId: sId,
          reason: reason || 'Unknown error',
          fromId: peerId,
        });
      }
      // Also update session status
      if (sId) {
        const session = sessionRegistry.getById(sId);
        if (session) {
          session.status = 'error';
        }
      }
      break;
    }

    default:
      safeSend(socket, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}
