'use client';

import { useCallback } from 'react';
import { PeerConnectionManager } from '@/lib/webrtc/peer-connection';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { downloadBlob } from '@/lib/webrtc/file-chunker';
import { signaling } from '@/lib/webrtc/signaling';

// Module-level singleton — prevents duplicate PeerConnectionManagers
// when useWebRTC() is called from multiple component instances
let activePC: PeerConnectionManager | null = null;
let transferLock = false;

export function useWebRTC() {
  const { updateProgress, setStatus, addReceivedFile, setErrorDetails } = useTransferStore();

  const startTransfer = useCallback(
    async (targetPeerId: string, sessionId: string, files: File[]) => {
      // Guard: only one active transfer at a time
      if (transferLock) {
        console.log('[WebRTC] startTransfer skipped — already active');
        return;
      }
      transferLock = true;

      // Clean up any previous connection
      if (activePC) {
        activePC.close();
        activePC = null;
      }

      const startTime = Date.now();

      const pc = new PeerConnectionManager(targetPeerId, sessionId, {
        onProgress: (bytesTransferred, totalBytes, currentFile, fileIndex, totalFiles) => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? bytesTransferred / elapsed : 0;
          const remaining = totalBytes - bytesTransferred;
          const eta = speed > 0 ? remaining / speed : 0;

          updateProgress({
            bytesTransferred,
            totalBytes,
            speed,
            eta,
            currentFile,
            fileIndex,
            totalFiles,
          });
        },
        onFileReceived: (blob, metadata) => {
          addReceivedFile({ blob, name: metadata.name, type: metadata.type });
          downloadBlob(blob, metadata.name);
        },
        onComplete: () => {
          setStatus('complete');
          transferLock = false;
        },
        onError: (error) => {
          console.error('WebRTC transfer error:', error);
          const fileInfos = files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream' }));
          const totalSize = files.reduce((sum, f) => sum + f.size, 0);
          setErrorDetails(error.message, {
            files: fileInfos,
            totalSize,
            code: error.name === 'TimeoutError' ? 'TIMEOUT' : 'CONNECTION_FAILED',
          });
          signaling.send({ type: 'transfer-error', targetId: targetPeerId, sessionId, reason: error.message });
          transferLock = false;
        },
        onStateChange: (state) => {
          if (state === 'connected') {
            setStatus('transferring');
          } else if (state === 'failed' || state === 'disconnected') {
            const fileInfos = files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream' }));
            const totalSize = files.reduce((sum, f) => sum + f.size, 0);
            setErrorDetails(`WebRTC connection ${state}`, {
              files: fileInfos,
              totalSize,
              code: state === 'failed' ? 'RTC_FAILED' : 'RTC_DISCONNECTED',
            });
            signaling.send({ type: 'transfer-error', targetId: targetPeerId, sessionId, reason: `Peer connection ${state}` });
            transferLock = false;
          }
        },
      });

      activePC = pc;

      try {
        await pc.createOffer();
        setStatus('connecting');

        await pc.waitForDataChannel();
        setStatus('transferring');

        await pc.sendFiles(files);
      } catch (error) {
        console.error('Transfer failed:', error);
        const fileInfos = files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream' }));
        const totalSize = files.reduce((sum, f) => sum + f.size, 0);
        const msg = error instanceof Error ? error.message : 'Unknown error';
        setErrorDetails(msg, {
          files: fileInfos,
          totalSize,
          code: msg.includes('timed out') ? 'TIMEOUT' : 'SEND_FAILED',
        });
        signaling.send({ type: 'transfer-error', targetId: targetPeerId, sessionId, reason: msg });
        transferLock = false;
      }
    },
    [updateProgress, setStatus, addReceivedFile, setErrorDetails],
  );

  const receiveTransfer = useCallback(
    (senderPeerId: string, sessionId: string) => {
      // Guard: only one active transfer at a time
      if (transferLock) {
        console.log('[WebRTC] receiveTransfer skipped — already active');
        return;
      }
      transferLock = true;

      // Clean up any previous connection
      if (activePC) {
        activePC.close();
        activePC = null;
      }

      const startTime = Date.now();

      const pc = new PeerConnectionManager(senderPeerId, sessionId, {
        onProgress: (bytesTransferred, totalBytes, currentFile, fileIndex, totalFiles) => {
          const elapsed = (Date.now() - startTime) / 1000;
          const speed = elapsed > 0 ? bytesTransferred / elapsed : 0;
          const remaining = totalBytes - bytesTransferred;
          const eta = speed > 0 ? remaining / speed : 0;

          updateProgress({
            bytesTransferred,
            totalBytes,
            speed,
            eta,
            currentFile,
            fileIndex,
            totalFiles,
          });
          setStatus('transferring');
        },
        onFileReceived: (blob, metadata) => {
          addReceivedFile({ blob, name: metadata.name, type: metadata.type });
          downloadBlob(blob, metadata.name);
        },
        onComplete: () => {
          setStatus('complete');
          transferLock = false;
        },
        onError: (error) => {
          console.error('WebRTC receive error:', error);
          setErrorDetails(error.message, { code: 'RECEIVE_FAILED' });
          transferLock = false;
        },
        onStateChange: (state) => {
          if (state === 'connected') {
            setStatus('transferring');
          }
        },
      });

      activePC = pc;
      setStatus('connecting');
    },
    [updateProgress, setStatus, addReceivedFile, setErrorDetails],
  );

  const cleanup = useCallback(() => {
    activePC?.close();
    activePC = null;
    transferLock = false;
  }, []);

  return { startTransfer, receiveTransfer, cleanup };
}

