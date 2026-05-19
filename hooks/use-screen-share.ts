'use client';

import { useCallback, useRef } from 'react';
import { ScreenConnectionManager } from '@/lib/webrtc/screen-connection';
import { useTransferStore } from '@/lib/stores/transfer-store';

let activeScreenConnection: ScreenConnectionManager | null = null;
let activeShareKey: string | null = null;
let startInFlight: Promise<void> | null = null;

export function useScreenShare() {
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localPreviewStreamRef = useRef<MediaStream | null>(null);
  const { setScreenStatus, setErrorDetails, bumpScreenRenderNonce } = useTransferStore();

  const startSharing = useCallback(async (targetPeerId: string, sessionId: string) => {
    const shareKey = `${sessionId}:${targetPeerId}`;
    if (activeShareKey === shareKey || startInFlight) {
      return;
    }
    activeShareKey = shareKey;

    if (activeScreenConnection) {
      activeScreenConnection.close();
      activeScreenConnection = null;
    }

    startInFlight = (async () => {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      localPreviewStreamRef.current = displayStream;
      bumpScreenRenderNonce();

      const manager = new ScreenConnectionManager(targetPeerId, sessionId, {
        onRemoteStream: (stream) => {
          remoteStreamRef.current = stream;
          bumpScreenRenderNonce();
        },
        onStateChange: (state) => {
          if (state === 'connected') setScreenStatus('live');
          if (state === 'failed' || state === 'disconnected') {
            activeShareKey = null;
            startInFlight = null;
            setScreenStatus('error');
          }
        },
        onError: (error) => {
          activeShareKey = null;
          startInFlight = null;
          setScreenStatus('error');
          setErrorDetails(error.message, { code: 'SCREEN_RTC_ERROR' });
        },
      });

      activeScreenConnection = manager;
      await manager.createOffer(displayStream);
      setScreenStatus('connecting');
    })();

    try {
      await startInFlight;
    } catch (error) {
      activeShareKey = null;
      throw error;
    } finally {
      startInFlight = null;
    }
  }, [setErrorDetails, setScreenStatus]);

  const prepareViewer = useCallback((targetPeerId: string, sessionId: string) => {
    if (activeScreenConnection) {
      activeScreenConnection.close();
      activeScreenConnection = null;
    }

    activeScreenConnection = new ScreenConnectionManager(targetPeerId, sessionId, {
      onRemoteStream: (stream) => {
        remoteStreamRef.current = stream;
        bumpScreenRenderNonce();
        setScreenStatus('live');
      },
      onStateChange: (state) => {
        if (state === 'connected') setScreenStatus('live');
        if (state === 'failed' || state === 'disconnected') setScreenStatus('error');
      },
      onError: (error) => {
        setScreenStatus('error');
        setErrorDetails(error.message, { code: 'SCREEN_RTC_ERROR' });
      },
    });

    setScreenStatus('connecting');
  }, [setErrorDetails, setScreenStatus]);

  const getRemoteStream = useCallback(() => remoteStreamRef.current, []);
  const getLocalPreviewStream = useCallback(() => localPreviewStreamRef.current, []);

  const cleanup = useCallback(() => {
    activeScreenConnection?.close();
    activeScreenConnection = null;
    remoteStreamRef.current = null;
    localPreviewStreamRef.current = null;
    bumpScreenRenderNonce();
    activeShareKey = null;
    startInFlight = null;
    setScreenStatus('ended');
  }, [bumpScreenRenderNonce, setScreenStatus]);

  return { startSharing, prepareViewer, getRemoteStream, getLocalPreviewStream, cleanup };
}
