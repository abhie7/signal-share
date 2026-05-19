'use client';

import { useCallback, useEffect, useRef } from 'react';
import { signaling } from '@/lib/webrtc/signaling';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { useAppStore } from '@/lib/stores/app-store';
import { useWebRTC } from './use-webrtc';
import { useRelay } from './use-relay';
import { useScreenShare } from './use-screen-share';
import { historyDB } from '@/lib/db/history';
import {
  deriveSharedAesKey,
  encryptText,
  exportPublicKey,
  generateEcdhKeyPair,
  importPublicKey,
} from '@/lib/crypto/text-transfer';

export function useTransfer() {
  const {
    files,
    fileInfos,
    sessionId,
    transferCode,
    shareLink,
    status,
    role,
    pendingText,
    remotePeerId,
    transferKind,
    transferMode,
    screenMode,
    screenPrompt,
    controlEnabled,
    setFiles,
    setPendingText,
    setRole,
    setTransferKind,
    setErrorDetails,
    setStatus,
    setIncomingTransfer,
    updateTextStream,
    setScreenPrompt,
    setScreenStatus,
    setScreenSharer,
    setScreenMode,
    setControlEnabled,
    reset,
  } = useTransferStore();

  const { setView } = useAppStore();
  const { startTransfer: rtcStart, receiveTransfer: rtcReceive, cleanup: rtcCleanup } = useWebRTC();
  const { startSharing, prepareViewer, getRemoteStream, getLocalPreviewStream, cleanup: cleanupScreen } = useScreenShare();
  const { startRelayTransfer, receiveRelayTransfer, cleanupRelay } = useRelay();

  // Guard ref to prevent duplicate WebRTC setup from effect re-runs
  const receiverSetupDone = useRef(false);
  const screenSetupDone = useRef(false);

  // Warn user before closing/refreshing during active transfer
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentStatus = useTransferStore.getState().status;
      if (currentStatus === 'transferring' || currentStatus === 'connecting') {
        e.preventDefault();
        // Send cancel to server before leaving
        const sid = useTransferStore.getState().sessionId;
        if (sid) {
          signaling.send({ type: 'transfer-cancel', sessionId: sid });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Save Transfer History on Complete ──
  // When status becomes 'complete', log it to the IndexedDB
  const historySavedForSession = useRef<string | null>(null);

  useEffect(() => {
    if (status === 'complete' && sessionId && historySavedForSession.current !== sessionId) {
      historySavedForSession.current = sessionId;
      const state = useTransferStore.getState();

      const fallbackFiles = state.incomingTransfer?.files || state.files.map((f) => ({ name: f.name, size: f.size }));
      const filesToSave = state.fileInfos.length > 0 ? state.fileInfos : fallbackFiles;
      const totalSize = filesToSave.reduce((acc, f) => acc + f.size, 0);

      historyDB.addTransaction({
        id: sessionId,
        type: role === 'sender' ? 'sent' : 'received',
        peerName: state.remotePeerName || 'Unknown Peer',
        files: filesToSave.map((f) => ({ name: f.name, size: f.size })),
        totalSize,
        timestamp: Date.now(),
      }).catch((err) => console.error('Failed to save history', err));
    }
  }, [status, sessionId, role]);

  // ── Sender: when receiver joins via code/link (local WebRTC) ──
  // Don't start immediately — wait for receiver to signal it's ready.
  // The sender effect gets the remotePeerId from the 'receiver-joined' message,
  // but the receiver hasn't set up its PeerConnectionManager yet.
  // So we just record that we're in "connecting" state; the actual
  // rtcStart() call is triggered by the 'receiver-rtc-ready' signaling message.

  // ── Receiver: when joining via code/link (local WebRTC) ──
  // Set up PeerConnectionManager to listen for the sender's offer,
  // then signal readiness so the sender can create the offer.
  useEffect(() => {
    if (status === 'connecting' && role === 'receiver' && remotePeerId && sessionId && transferKind === 'file') {
      console.log('[useTransfer] Receiver connecting, setting up WebRTC...', { remotePeerId, sessionId });
      // Guard: only set up once per transfer
      if (receiverSetupDone.current) return;
      receiverSetupDone.current = true;

      rtcReceive(remotePeerId, sessionId);
      console.log('[useTransfer] Sending receiver-rtc-ready to', remotePeerId);
      // Tell the sender we're ready to receive WebRTC offers
      signaling.send({
        type: 'receiver-rtc-ready',
        targetId: remotePeerId,
        sessionId,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role, remotePeerId, transferMode, sessionId, transferKind]);

  useEffect(() => {
    if (status === 'connecting' && role === 'receiver' && remotePeerId && sessionId && transferKind === 'screen') {
      if (screenSetupDone.current) return;
      screenSetupDone.current = true;
      prepareViewer(remotePeerId, sessionId);
      signaling.send({
        type: 'screen-rtc-ready',
        targetId: remotePeerId,
        sessionId,
      });
    }
  }, [prepareViewer, remotePeerId, role, sessionId, status, transferKind]);

  // ── Listen for receiver-rtc-ready (sender side) ──
  // This is the single trigger for the sender to start the WebRTC offer.
  // Uses msg.fromId (added by server relay) instead of state.remotePeerId
  // to avoid race conditions where transfer-accepted hasn't arrived yet.
  useEffect(() => {
    const cleanup = signaling.on('receiver-rtc-ready', (msg) => {
      console.log('[useTransfer] receiver-rtc-ready received', msg);
      const sid = msg.sessionId as string;
      const receiverId = msg.fromId as string;
      const state = useTransferStore.getState();
      if (state.role === 'sender' && state.transferKind === 'file' && state.files.length > 0 && receiverId) {
        console.log('[useTransfer] Sender starting RTC transfer to', receiverId);
        rtcStart(receiverId, sid, state.files);
      } else {
        console.warn('[useTransfer] receiver-rtc-ready ignored:', {
          role: state.role,
          transferKind: state.transferKind,
          fileCount: state.files.length,
          receiverId,
        });
      }
    });
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cleanup = signaling.on('screen-rtc-ready', (msg) => {
      const sid = msg.sessionId as string;
      const viewerId = msg.fromId as string;
      const state = useTransferStore.getState();
      if (
        state.transferKind === 'screen' &&
        state.isScreenSharer &&
        viewerId &&
        sid
      ) {
        void startSharing(viewerId, sid);
      }
    });
    return cleanup;
  }, [startSharing]);

  useEffect(() => {
    const cleanup = signaling.on('screen-share-accepted', (msg) => {
      const state = useTransferStore.getState();
      const sid = (msg.sessionId as string | undefined) ?? state.sessionId;
      const sharerId = msg.fromId as string | undefined;
      if (
        state.transferKind === 'screen' &&
        state.role === 'sender' &&
        !state.isScreenSharer &&
        sid &&
        sharerId
      ) {
        prepareViewer(sharerId, sid);
        signaling.send({
          type: 'screen-rtc-ready',
          targetId: sharerId,
          sessionId: sid,
        });
      }
    });
    return cleanup;
  }, [prepareViewer]);

  // ── Listen for receiver-ready (relay mode) ──
  // This is sent by the server when the receiver connects to the SSE download endpoint
  useEffect(() => {
    const cleanup = signaling.on('receiver-ready', (msg) => {
      const sid = msg.sessionId as string;
      const state = useTransferStore.getState();
      if (state.role === 'sender' && state.transferKind === 'file' && state.files.length > 0) {
        // Only start relay if we are not already transferring via WebRTC
        if (state.status !== 'transferring') {
          startRelayTransfer(sid, state.files);
        }
      }
    });
    return cleanup;
  }, [startRelayTransfer]);

  // ── Cleanup on cancel/error from the other party ──
  // When the peer cancels or disconnects, we need to tear down WebRTC
  // and release the transferLock so the user can start a new transfer.
  useEffect(() => {
    const cleanups = [
      signaling.on('transfer-cancelled', () => {
        rtcCleanup();
        cleanupScreen();
        receiverSetupDone.current = false;
        screenSetupDone.current = false;
      }),
      signaling.on('transfer-error', () => {
        rtcCleanup();
        cleanupScreen();
        cleanupRelay();
        receiverSetupDone.current = false;
        screenSetupDone.current = false;
      }),
    ];
    return () => cleanups.forEach((c) => c());
  }, [cleanupScreen, rtcCleanup, cleanupRelay]);

  // Share files — create session
  const shareFiles = useCallback(
    (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setPendingText(null);
      setRole('sender');
      setTransferKind('file');
      setView('sending');

      const infos = selectedFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
      }));

      signaling.send({
        type: 'create-session',
        transferType: 'file',
        files: infos,
      });

    },
    [setFiles, setPendingText, setRole, setTransferKind, setView],
  );

  // Send to a specific nearby peer
  const sendToPeer = useCallback(
    (targetPeerId: string, selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setPendingText(null);
      setRole('sender');
      setTransferKind('file');
      setView('sending');

      const infos = selectedFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
      }));

      signaling.send({
        type: 'send-to-peer',
        targetPeerId,
        files: infos,
      });
    },
    [setFiles, setPendingText, setRole, setTransferKind, setView],
  );

  const shareText = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value) {
        throw new Error('Text cannot be empty');
      }

      setFiles([]);
      setPendingText(value);
      setRole('sender');
      setTransferKind('text');
      setView('sending');
      const chunkSize = 48 * 1024;
      const textChunks = Math.max(1, Math.ceil(value.length / chunkSize));
      updateTextStream({
        totalBytes: value.length,
        totalChunks: textChunks,
        bytesSent: 0,
        chunksSent: 0,
        assembling: false,
      });

      signaling.send({
        type: 'create-session',
        transferType: 'text',
        textLength: value.length,
        textChunks,
        files: [],
      });
    },
    [setFiles, setPendingText, setRole, setTransferKind, setView, updateTextStream],
  );

  const shareScreen = useCallback((mode: 'share-self' | 'request-remote', enableControl: boolean) => {
    setFiles([]);
    setPendingText(null);
    setRole('sender');
    setTransferKind('screen');
    setScreenMode(mode);
    setControlEnabled(enableControl);
    setScreenSharer(mode === 'share-self');
    setScreenStatus('connecting');
    setView('sending');

    signaling.send({
      type: 'create-session',
      transferType: 'screen',
      screenMode: mode,
      controlEnabled: enableControl,
      autoPromptShare: mode === 'request-remote',
      files: [],
    });
  }, [setControlEnabled, setFiles, setPendingText, setRole, setScreenMode, setScreenSharer, setScreenStatus, setTransferKind, setView]);

  // Join by code
  const joinByCode = useCallback(
    (code: string) => {
      setRole('receiver');
      setView('receiving');
      signaling.send({ type: 'join-by-code', code });
    },
    [setRole, setView],
  );

  // Join by link (session ID)
  const joinByLink = useCallback(
    (linkSessionId: string) => {
      setRole('receiver');
      setView('receiving');
      signaling.send({ type: 'join-by-link', sessionId: linkSessionId });
    },
    [setRole, setView],
  );

  // Accept incoming transfer
  const acceptIncoming = useCallback(
    (incomingSessionId: string, senderId: string) => {
      setRole('receiver');
      setTransferKind('file');
      setView('receiving');
      signaling.send({ type: 'accept-transfer', sessionId: incomingSessionId });
      setIncomingTransfer(null);

      // Start receiving via WebRTC, then notify sender we're ready
      rtcReceive(senderId, incomingSessionId);
      signaling.send({
        type: 'receiver-rtc-ready',
        targetId: senderId,
        sessionId: incomingSessionId,
      });
    },
    [setRole, setTransferKind, setView, setIncomingTransfer, rtcReceive],
  );

  // Decline incoming transfer
  const declineIncoming = useCallback(
    (incomingSessionId: string) => {
      signaling.send({ type: 'decline-transfer', sessionId: incomingSessionId });
      setIncomingTransfer(null);
    },
    [setIncomingTransfer],
  );

  // Cancel current transfer
  const cancelTransfer = useCallback(() => {
    if (sessionId) {
      signaling.send({ type: 'transfer-cancel', sessionId });
    }
    rtcCleanup();
    cleanupScreen();
    cleanupRelay();
    receiverSetupDone.current = false;
    screenSetupDone.current = false;
    reset();
    setView('home');
  }, [sessionId, rtcCleanup, cleanupScreen, cleanupRelay, reset, setView]);

  // Force relay mode (can be called if WebRTC is stuck)
  const forceRelay = useCallback(() => {
    if (!sessionId || !remotePeerId) return;

    // Stop WebRTC
    rtcCleanup();

    if (role === 'sender') {
      setStatus('connecting');
    } else {
      receiveRelayTransfer(sessionId, fileInfos);
    }
  }, [sessionId, remotePeerId, role, rtcCleanup, setStatus, receiveRelayTransfer, fileInfos]);

  // Go back to home
  const goHome = useCallback(() => {
    rtcCleanup();
    cleanupScreen();
    receiverSetupDone.current = false;
    screenSetupDone.current = false;
    reset();
    setView('home');
  }, [rtcCleanup, cleanupScreen, reset, setView]);

  const sendEncryptedText = useCallback(async (targetPeerId: string, plainText: string, activeSessionId?: string) => {
    const text = plainText.trim();
    if (!text) {
      throw new Error('Text cannot be empty');
    }
    const chunkSize = 48 * 1024;
    const chunks = text.match(new RegExp(`.{1,${chunkSize}}`, 'gs')) ?? [''];

    const senderKeys = await generateEcdhKeyPair();
    const senderPublicKey = await exportPublicKey(senderKeys.publicKey);
    const requestId = crypto.randomUUID();

    const receiverPublicKeyJwk = await new Promise<JsonWebKey>((resolve, reject) => {
      let done = false;

      const cleanup = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timeoutId);
        unsubscribe();
      };

      const unsubscribe = signaling.on('text-key-response', (msg) => {
        if (msg.requestId !== requestId || msg.fromId !== targetPeerId) {
          return;
        }

        const key = msg.receiverPublicKey as JsonWebKey | undefined;
        cleanup();
        if (!key) {
          reject(new Error('Receiver key exchange failed'));
          return;
        }
        resolve(key);
      });

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for receiver key exchange'));
      }, 10000);

      signaling.send({
        type: 'text-key-request',
        targetId: targetPeerId,
        requestId,
        senderPublicKey,
      });
    });

    const receiverPublicKey = await importPublicKey(receiverPublicKeyJwk);
    const aesKey = await deriveSharedAesKey(senderKeys.privateKey, receiverPublicKey);
    const firstPayload = await encryptText(chunks[0] ?? '', aesKey);

    updateTextStream({
      totalBytes: text.length,
      totalChunks: chunks.length,
      bytesSent: 0,
      chunksSent: 0,
      assembling: false,
    });

    signaling.send({
      type: 'text-start',
      targetId: targetPeerId,
      requestId,
      sessionId: activeSessionId,
      totalLength: text.length,
      totalChunks: chunks.length,
      iv: firstPayload.iv,
      ciphertext: firstPayload.ciphertext,
    });
    updateTextStream({ bytesSent: chunks[0]?.length ?? 0, chunksSent: 1 });

    for (let index = 1; index < chunks.length; index += 1) {
      const payload = await encryptText(chunks[index], aesKey);
      signaling.send({
        type: 'text-chunk',
        targetId: targetPeerId,
        requestId,
        sessionId: activeSessionId,
        index,
        iv: payload.iv,
        ciphertext: payload.ciphertext,
      });
      const state = useTransferStore.getState().textStream;
      updateTextStream({
        bytesSent: Math.min(text.length, state.bytesSent + chunks[index].length),
        chunksSent: index + 1,
      });
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }

    signaling.send({
      type: 'text-end',
      targetId: targetPeerId,
      requestId,
      sessionId: activeSessionId,
    });

    if (activeSessionId) {
      signaling.send({ type: 'transfer-complete', sessionId: activeSessionId });
    }
  }, [updateTextStream]);

  const textSessionSentRef = useRef<string | null>(null);

  useEffect(() => {
    if (role !== 'sender' || transferKind !== 'text' || status !== 'connecting' || !remotePeerId || !pendingText) {
      return;
    }

    if (sessionId && textSessionSentRef.current === sessionId) {
      return;
    }

    if (sessionId) {
      textSessionSentRef.current = sessionId;
    }

    setStatus('transferring');
    sendEncryptedText(remotePeerId, pendingText, sessionId || undefined)
      .then(() => {
        setStatus('complete');
        setPendingText(null);
      })
      .catch((error) => {
        setErrorDetails(error instanceof Error ? error.message : 'Failed to send encrypted text', { code: 'TEXT_SEND_FAILED' });
      });
  }, [
    pendingText,
    remotePeerId,
    role,
    sendEncryptedText,
    sessionId,
    setErrorDetails,
    setPendingText,
    setStatus,
    status,
    transferKind,
  ]);

  const dismissIncomingTransfer = useCallback(() => {
    setIncomingTransfer(null);
  }, [setIncomingTransfer]);

  const acceptScreenPrompt = useCallback(async () => {
    const state = useTransferStore.getState();
    if (!state.screenPrompt.sessionId || !state.screenPrompt.requesterId) return;

    setScreenPrompt({
      visible: false,
      requesterId: null,
      requesterName: null,
      sessionId: null,
    });
    setRole('receiver');
    setTransferKind('screen');
    setScreenSharer(true);
    setScreenStatus('connecting');
    setView('receiving');

    try {
      signaling.send({
        type: 'screen-share-accept',
        targetId: state.screenPrompt.requesterId,
        sessionId: state.screenPrompt.sessionId,
      });
    } catch (error) {
      setErrorDetails(error instanceof Error ? error.message : 'Failed to start screen sharing', { code: 'SCREEN_START_FAILED' });
    }
  }, [setErrorDetails, setRole, setScreenPrompt, setScreenSharer, setScreenStatus, setTransferKind, setView]);

  const declineScreenPrompt = useCallback(() => {
    const state = useTransferStore.getState();
    if (state.screenPrompt.sessionId && state.screenPrompt.requesterId) {
      signaling.send({
        type: 'screen-share-decline',
        targetId: state.screenPrompt.requesterId,
        sessionId: state.screenPrompt.sessionId,
      });
    }
    setScreenPrompt({
      visible: false,
      requesterId: null,
      requesterName: null,
      sessionId: null,
    });
    setScreenStatus('declined');
  }, [setScreenPrompt, setScreenStatus]);

  return {
    files,
    fileInfos,
    sessionId,
    transferCode,
    shareLink,
    status,
    role,
    transferMode,
    screenMode,
    screenPrompt,
    controlEnabled,
    shareFiles,
    shareText,
    shareScreen,
    sendToPeer,
    joinByCode,
    joinByLink,
    acceptIncoming,
    declineIncoming,
    cancelTransfer,
    goHome,
    forceRelay,
    sendEncryptedText,
    dismissIncomingTransfer,
    acceptScreenPrompt,
    declineScreenPrompt,
    getRemoteStream,
    getLocalPreviewStream,
  };
}
