import { useEffect, useRef } from 'react';
import { signaling } from '@/lib/webrtc/signaling';
import { useAppStore } from '@/lib/stores/app-store';
import { usePeersStore } from '@/lib/stores/peers-store';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { playPeerDiscovered } from '@/lib/sounds';
import {
  decryptText,
  deriveSharedAesKey,
  exportPublicKey,
  generateEcdhKeyPair,
  importPublicKey,
} from '@/lib/crypto/text-transfer';

interface PendingTextKeyExchange {
  senderId: string;
  senderPublicKey: JsonWebKey;
  receiverPrivateKey: CryptoKey;
}

export function useWebSocket() {
  const initialized = useRef(false);
  const pendingTextKeys = useRef<Map<string, PendingTextKeyExchange>>(new Map());
  const setConnected = useAppStore((s) => s.setConnected);
  const setDeviceName = useAppStore((s) => s.setDeviceName);
  const setDeviceId = useAppStore((s) => s.setDeviceId);
  const { addPeer, updatePeer, removePeer, setPeers } = usePeersStore();
  const {
    setSession,
    setStatus,
    setTransferKind,
    setRemotePeer,
    setTransferMode,
    setIncomingTransfer,
    setFileInfos,
    updateProgress,
    setRole,
  } = useTransferStore();

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const cleanups: Array<() => void> = [];

    // Connect
    signaling.connect();

    // Connection state
    cleanups.push(
      signaling.on('_connected', () => setConnected(true)),
      signaling.on('_disconnected', () => setConnected(false)),
    );

    // Welcome message — receive device identity
    cleanups.push(
      signaling.on('welcome', (msg) => {
        const peerId = msg.peerId as string;
        const serverName = msg.name as string;

        // Always use server-assigned peerId (it's the WS connection id)
        setDeviceId(peerId);

        // Check if we have a stored name from a previous session
        const storedName = localStorage.getItem('p2p-device-name');

        if (storedName) {
          // Use stored name, but tell the server to update its registry
          setDeviceName(storedName);
          signaling.send({ type: 'update-identity', name: storedName });
        } else {
          // First visit — use server-generated name and persist it
          setDeviceName(serverName);
          localStorage.setItem('p2p-device-name', serverName);
        }
      }),
    );

    // Nearby peers
    cleanups.push(
      signaling.on('nearby-peers', (msg) => {
        setPeers(msg.peers as Array<{ id: string; name: string }>);
      }),
      signaling.on('peer-joined', (msg) => {
        const peer = msg.peer as { id: string; name: string };
        addPeer(peer);
        playPeerDiscovered();
      }),
      signaling.on('peer-updated', (msg) => {
        const peer = msg.peer as { id: string; name: string };
        updatePeer(peer.id, peer.name);
      }),
      signaling.on('peer-left', (msg) => {
        removePeer(msg.peerId as string);
      }),
    );

    // Session created (sender side)
    cleanups.push(
      signaling.on('session-created', (msg) => {
        const transferType = (msg.transferType as 'file' | 'text' | undefined) ?? 'file';
        setSession({
          sessionId: msg.sessionId as string,
          code: msg.code as string,
          shareLink: msg.shareLink as string | undefined,
        });
        setTransferKind(transferType);
        setStatus('waiting');
        setRole('sender');
      }),
    );

    // Session joined (receiver side)
    cleanups.push(
      signaling.on('session-joined', (msg) => {
        const transferType = (msg.transferType as 'file' | 'text' | undefined) ?? 'file';
        const incomingFiles = msg.files as Array<{ name: string; size: number; type: string }>;

        setStatus('connecting');
        setRole('receiver');
        setTransferKind(transferType);
        setTransferMode(msg.transferMode as 'local' | 'remote');
        setRemotePeer(msg.senderName as string, msg.senderId as string);
        setFileInfos(incomingFiles || []);
        // Store sessionId so the receiver can set up WebRTC
        setSession({
          sessionId: msg.sessionId as string,
          code: '',
        });
      }),
    );

    // Receiver joined (sender side notification)
    cleanups.push(
      signaling.on('receiver-joined', (msg) => {
        setStatus('connecting');
        setTransferKind(((msg.transferType as 'file' | 'text' | undefined) ?? 'file'));
        setRemotePeer(msg.receiverName as string, msg.receiverId as string);
        setTransferMode(msg.transferMode as 'local' | 'remote');
      }),
    );

    // Incoming transfer request (nearby peer sends to you)
    cleanups.push(
      signaling.on('incoming-transfer', (msg) => {
        const incomingFiles = msg.files as Array<{ name: string; size: number; type: string }>;
        setIncomingTransfer({
          transferType: 'file',
          sessionId: msg.sessionId as string,
          senderId: msg.senderId as string,
          senderName: msg.senderName as string,
          files: incomingFiles,
          totalSize: msg.totalSize as number,
        });
        setFileInfos(incomingFiles);
      }),
    );

    cleanups.push(
      signaling.on('text-key-request', async (msg) => {
        try {
          const senderId = msg.fromId as string | undefined;
          const requestId = msg.requestId as string | undefined;
          const senderPublicKey = msg.senderPublicKey as JsonWebKey | undefined;

          if (!senderId || !requestId || !senderPublicKey) {
            return;
          }

          const receiverKeys = await generateEcdhKeyPair();
          const receiverPublicKey = await exportPublicKey(receiverKeys.publicKey);

          pendingTextKeys.current.set(requestId, {
            senderId,
            senderPublicKey,
            receiverPrivateKey: receiverKeys.privateKey,
          });

          signaling.send({
            type: 'text-key-response',
            targetId: senderId,
            requestId,
            receiverPublicKey,
          });
        } catch (error) {
          console.error('Failed text key exchange request:', error);
        }
      }),
      signaling.on('text-message', async (msg) => {
        try {
          const senderId = msg.fromId as string | undefined;
          const requestId = msg.requestId as string | undefined;
          const iv = msg.iv as string | undefined;
          const ciphertext = msg.ciphertext as string | undefined;

          if (!senderId || !requestId || !iv || !ciphertext) {
            return;
          }

          const exchange = pendingTextKeys.current.get(requestId);
          if (!exchange || exchange.senderId !== senderId) {
            return;
          }

          const senderPublicKey = await importPublicKey(exchange.senderPublicKey);
          const aesKey = await deriveSharedAesKey(exchange.receiverPrivateKey, senderPublicKey);
          const textContent = await decryptText({ iv, ciphertext }, aesKey);

          pendingTextKeys.current.delete(requestId);

          const senderName =
            usePeersStore
              .getState()
              .nearbyPeers.find((peer) => peer.id === senderId)?.name || 'Unknown';

          setIncomingTransfer({
            transferType: 'text',
            sessionId: (msg.sessionId as string | undefined) ?? requestId,
            senderId,
            senderName,
            files: [],
            totalSize: textContent.length,
            textContent,
          });

          const linkedSessionId = msg.sessionId as string | undefined;
          if (linkedSessionId) {
            setStatus('complete');
          }
        } catch (error) {
          console.error('Failed to decrypt incoming text:', error);
        }
      }),
    );

    // Transfer accepted (sender gets notification to start WebRTC)
    cleanups.push(
      signaling.on('transfer-accepted', (msg) => {
        setStatus('connecting');
        setRemotePeer(msg.receiverName as string, msg.receiverId as string);
      }),
    );

    // Transfer declined
    cleanups.push(
      signaling.on('transfer-declined', () => {
        setStatus('idle');
      }),
    );

    // Transfer progress
    cleanups.push(
      signaling.on('transfer-progress', (msg) => {
        const progress = msg.progress as {
          bytesTransferred: number;
          totalBytes: number;
          speed: number;
          eta: number;
          currentFile: string;
          fileIndex: number;
          totalFiles: number;
        };
        updateProgress(progress);
      }),
    );

    // Transfer complete
    cleanups.push(
      signaling.on('transfer-complete', () => {
        setStatus('complete');
      }),
    );

    // Transfer cancelled
    cleanups.push(
      signaling.on('transfer-cancelled', () => {
        setStatus('cancelled');
      }),
    );

    // Transfer error from other party
    cleanups.push(
      signaling.on('transfer-error', (msg) => {
        const reason = msg.reason as string || 'Connection lost';
        console.error('Transfer error from peer:', reason);
        const store = useTransferStore.getState();
        store.setErrorDetails(reason, {
          files: store.fileInfos,
          totalSize: store.progress.totalBytes || store.fileInfos.reduce((s, f) => s + f.size, 0),
          code: 'PEER_ERROR',
        });
      }),
    );

    // Errors
    cleanups.push(
      signaling.on('error', (msg) => {
        console.error('Server error:', msg.message);
      }),
    );

    return () => {
      for (const cleanup of cleanups) cleanup();
      pendingTextKeys.current.clear();
      signaling.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
