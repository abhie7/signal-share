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

interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  speed: number;
  eta: number;
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
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

function cleanupPeer(peerId: string, subnet: string): void {
  const peer = peerRegistry.remove(peerId);
  if (peer) {
    broadcastToSubnet(subnet, peerId, {
      type: 'peer-left',
      peerId,
    });
  }

  const senderSessions = sessionRegistry.getSessionsBySender(peerId);
  for (const session of senderSessions) {
    if (session.status === 'waiting') {
          sessionRegistry.remove(session.id);
        } else if (session.status === 'connecting' || session.status === 'transferring') {
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
      cleanupPeer(peerId, subnet);
    });

    socket.on('error', (err) => {
      fastify.log.error({ err, peerId }, 'WebSocket error');
    });
  });
}

function handleCreateSession(socket: WebSocket, peerId: string, msg: WsMessage): void {
  const transferType = (msg.transferType as 'file' | 'text' | undefined) ?? 'file';
  const rawTextLength = msg.textLength;
  const textLength = typeof rawTextLength === 'number' ? rawTextLength : undefined;
  const files = msg.files as Array<{ name: string; size: number; type: string }>;
  if (transferType === 'file' && (!files || !Array.isArray(files) || files.length === 0)) {
    safeSend(socket, { type: 'error', message: 'No files provided' });
    return;
  }

  if (transferType === 'text' && (!textLength || textLength <= 0)) {
    safeSend(socket, { type: 'error', message: 'No text provided' });
    return;
  }

  const peer = peerRegistry.get(peerId);
  const sessionFiles =
    transferType === 'text'
      ? [
          {
            name: 'Encrypted Text Snippet',
            size: textLength ?? 0,
            type: 'text/plain',
          },
        ]
      : files;
  const session = sessionRegistry.create(peerId, peer?.name || 'Unknown', sessionFiles, transferType);
  session.senderWs = socket;
  const host = process.env.HOST || "";
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  safeSend(socket, {
    type: 'session-created',
    sessionId: session.id,
    code: session.code,
    transferType: session.transferType,
    shareLink: `${protocol}://${host}/receive/${session.id}`,
  });
}

function handleJoinByCode(socket: WebSocket, peerId: string, subnet: string, msg: WsMessage): void {
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
  const senderPeer = peerRegistry.get(session.senderId);
  const isLocal = senderPeer?.subnet === subnet;
  joined.transferMode = isLocal ? 'local' : 'remote';
  safeSend(socket, {
    type: 'session-joined',
    sessionId: session.id,
    transferType: session.transferType,
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
      transferType: session.transferType,
      receiverId: peerId,
      receiverName: peer?.name || 'Unknown',
      transferMode: joined.transferMode,
    });
  }
}

function handleJoinByLink(socket: WebSocket, peerId: string, subnet: string, msg: WsMessage): void {
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
    transferType: session.transferType,
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
      transferType: session.transferType,
      receiverId: peerId,
      receiverName: peer?.name || 'Unknown',
      transferMode: joined.transferMode,
    });
  }
}

function handleRtcMessage(peerId: string, msg: WsMessage): void {
  const targetId = msg.targetId as string;
  const targetPeer = peerRegistry.get(targetId);
  if (targetPeer) {
    safeSend(targetPeer.ws, { ...msg, fromId: peerId });
  }
}

function handleFileChunk(peerId: string, msg: WsMessage): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
  const chunkData = msg.data as string;
  const chunk = Buffer.from(chunkData, 'base64');
  for (const cb of session.chunkCallbacks) {
    cb(chunk);
  }
}

function handleFileChunkEnd(msg: WsMessage): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
  for (const cb of session.chunkCallbacks) {
    cb(null);
  }
  session.chunkCallbacks = [];
}

function handleTransferProgress(peerId: string, msg: WsMessage): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
  const progress = msg.progress as TransferProgress;
  for (const cb of session.progressCallbacks) {
    cb(progress);
  }
  const targetWs = peerId === session.senderId ? session.receiverWs : session.senderWs;
  if (targetWs) {
    safeSend(targetWs, { type: 'transfer-progress', sessionId, progress });
  }
}

function handleTransferComplete(msg: WsMessage): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
  session.status = 'complete';
  if (session.senderWs) {
    safeSend(session.senderWs, { type: 'transfer-complete', sessionId });
  }
  if (session.receiverWs) {
    safeSend(session.receiverWs, { type: 'transfer-complete', sessionId });
  }
  setTimeout(() => sessionRegistry.remove(sessionId), 60000);
}

function handleTransferCancel(peerId: string, msg: WsMessage): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
    if (peerId !== session.senderId && peerId !== session.receiverId) return;
  const targetWs = peerId === session.senderId ? session.receiverWs : session.senderWs;
  if (targetWs) {
    safeSend(targetWs, { type: 'transfer-cancelled', sessionId });
  }
  sessionRegistry.remove(sessionId);
}

function handleSendToPeer(socket: WebSocket, peerId: string, msg: WsMessage): void {
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
}

function handleAcceptTransfer(peerId: string, msg: WsMessage, socket: WebSocket): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
  const peer = peerRegistry.get(peerId);
  const joined = sessionRegistry.joinSession(sessionId, peerId, peer?.name || 'Unknown');
  if (!joined) return;
  joined.receiverWs = socket;
  joined.transferMode = 'local';
  if (session.senderWs) {
    safeSend(session.senderWs, {
      type: 'transfer-accepted',
      sessionId,
      receiverId: peerId,
      receiverName: peer?.name || 'Unknown',
    });
  }
}

function handleDeclineTransfer(msg: WsMessage): void {
  const sessionId = msg.sessionId as string;
  const session = sessionRegistry.getById(sessionId);
  if (!session) return;
  if (session.senderWs) {
    safeSend(session.senderWs, { type: 'transfer-declined', sessionId });
  }
  sessionRegistry.remove(sessionId);
}

function handleUpdateIdentity(peerId: string, subnet: string, msg: WsMessage): void {
  const newName = msg.name as string;
  if (!newName || typeof newName !== 'string') return;
  const peer = peerRegistry.get(peerId);
  if (peer) {
    const oldName = peer.name;
    peer.name = newName;
    if (oldName !== newName) {
      broadcastToSubnet(subnet, peerId, {
        type: 'peer-updated',
        peer: { id: peerId, name: newName },
      });
    }
  }
}

function handleTransferError(peerId: string, msg: WsMessage): void {
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
  if (sId) {
    const session = sessionRegistry.getById(sId);
    if (session) {
      session.status = 'error';
    }
  }
}

type MessageHandler = (socket: WebSocket, peerId: string, subnet: string, msg: WsMessage) => void;

const messageHandlers: Record<string, MessageHandler> = {
  'create-session': (socket, peerId, _, msg) => handleCreateSession(socket, peerId, msg),
  'join-by-code': (socket, peerId, subnet, msg) => handleJoinByCode(socket, peerId, subnet, msg),
  'join-by-link': (socket, peerId, subnet, msg) => handleJoinByLink(socket, peerId, subnet, msg),
  'rtc-offer': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'rtc-answer': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'rtc-ice-candidate': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'receiver-rtc-ready': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'text-key-request': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'text-key-response': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'text-message': (_, peerId, __, msg) => handleRtcMessage(peerId, msg),
  'file-chunk': (_, peerId, __, msg) => handleFileChunk(peerId, msg),
  'file-chunk-end': (_, __, ___, msg) => handleFileChunkEnd(msg),
  'transfer-progress': (_, peerId, __, msg) => handleTransferProgress(peerId, msg),
  'transfer-complete': (_, __, ___, msg) => handleTransferComplete(msg),
  'transfer-cancel': (_, peerId, __, msg) => handleTransferCancel(peerId, msg),
  'send-to-peer': (socket, peerId, _, msg) => handleSendToPeer(socket, peerId, msg),
  'accept-transfer': (socket, peerId, __, msg) => handleAcceptTransfer(peerId, msg, socket),
  'decline-transfer': (_, __, ___, msg) => handleDeclineTransfer(msg),
  'update-identity': (_, peerId, subnet, msg) => handleUpdateIdentity(peerId, subnet, msg),
  'transfer-error': (_, peerId, __, msg) => handleTransferError(peerId, msg),
};

function handleMessage(
  socket: WebSocket,
  peerId: string,
  subnet: string,
  msg: WsMessage,
): void {
  const handler = messageHandlers[msg.type as string];
  if (handler) {
    handler(socket, peerId, subnet, msg);
  } else {
    safeSend(socket, { type: 'error', message: `Unknown message type: ${msg.type}` });
  }
}
