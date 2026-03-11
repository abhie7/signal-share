'use client';

import { useCallback, useEffect, useRef } from 'react';
import { signaling } from '@/lib/webrtc/signaling';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { useAppStore } from '@/lib/stores/app-store';
import { useWebRTC } from './use-webrtc';
import { useRelay } from './use-relay';
import { historyDB } from '@/lib/db/history';

export function useTransfer() {
  const {
    files,
    fileInfos,
    sessionId,
    transferCode,
    shareLink,
    status,
    role,
    remotePeerId,
    transferMode,
    setFiles,
    setRole,
    setStatus,
    setIncomingTransfer,
    reset,
  } = useTransferStore();

  const { setView } = useAppStore();
  const { startTransfer: rtcStart, receiveTransfer: rtcReceive, cleanup: rtcCleanup } = useWebRTC();
  const { startRelayTransfer, receiveRelayTransfer, cleanupRelay } = useRelay();

  // Guard ref to prevent duplicate WebRTC setup from effect re-runs
  const receiverSetupDone = useRef(false);

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
    if (status === 'connecting' && role === 'receiver' && remotePeerId && sessionId) {
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
  }, [status, role, remotePeerId, transferMode, sessionId]);

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
      if (state.role === 'sender' && state.files.length > 0 && receiverId) {
        console.log('[useTransfer] Sender starting RTC transfer to', receiverId);
        rtcStart(receiverId, sid, state.files);
      } else {
        console.warn('[useTransfer] receiver-rtc-ready ignored:', { role: state.role, fileCount: state.files.length, receiverId });
      }
    });
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for receiver-ready (relay mode) ──
  // This is sent by the server when the receiver connects to the SSE download endpoint
  useEffect(() => {
    const cleanup = signaling.on('receiver-ready', (msg) => {
      const sid = msg.sessionId as string;
      const state = useTransferStore.getState();
      if (state.role === 'sender' && state.files.length > 0) {
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
        receiverSetupDone.current = false;
      }),
      signaling.on('transfer-error', () => {
        rtcCleanup();
        cleanupRelay();
        receiverSetupDone.current = false;
      }),
    ];
    return () => cleanups.forEach((c) => c());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rtcCleanup, cleanupRelay]);

  // Share files — create session
  const shareFiles = useCallback(
    (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setRole('sender');
      setView('sending');

      const infos = selectedFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type || 'application/octet-stream',
      }));

      signaling.send({
        type: 'create-session',
        files: infos,
      });
    },
    [setFiles, setRole, setView],
  );

  // Send to a specific nearby peer
  const sendToPeer = useCallback(
    (targetPeerId: string, selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setRole('sender');
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
    [setFiles, setRole, setView],
  );

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
    [setRole, setView, setIncomingTransfer, rtcReceive],
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
    cleanupRelay();
    receiverSetupDone.current = false;
    reset();
    setView('home');
  }, [sessionId, rtcCleanup, cleanupRelay, reset, setView]);

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
    receiverSetupDone.current = false;
    reset();
    setView('home');
  }, [rtcCleanup, reset, setView]);

  return {
    files,
    fileInfos,
    sessionId,
    transferCode,
    shareLink,
    status,
    role,
    transferMode,
    shareFiles,
    sendToPeer,
    joinByCode,
    joinByLink,
    acceptIncoming,
    declineIncoming,
    cancelTransfer,
    goHome,
    forceRelay,
  };
}
