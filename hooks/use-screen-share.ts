'use client';

import { useCallback, useRef } from 'react';
import { ScreenConnectionManager } from '@/lib/webrtc/screen-connection';
import { useTransferStore } from '@/lib/stores/transfer-store';

let activeScreenConnection: ScreenConnectionManager | null = null;
let activeShareKey: string | null = null;
let startInFlight: Promise<void> | null = null;

type ScreenShareNavigator = Navigator & {
  getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
};

function getDisplayMediaApi() {
  if (typeof navigator === 'undefined') {
    return undefined;
  }

  if (navigator.mediaDevices?.getDisplayMedia) {
    return navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  }

  if ((navigator as ScreenShareNavigator).getDisplayMedia) {
    return (navigator as ScreenShareNavigator).getDisplayMedia!.bind(navigator);
  }

  return undefined;
}

export function useScreenShare() {
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localPreviewStreamRef = useRef<MediaStream | null>(null);
  const { setScreenStatus, setErrorDetails, bumpScreenRenderNonce } = useTransferStore();

  const stopScreenSession = useCallback(() => {
    activeScreenConnection?.close();
    activeScreenConnection = null;
    remoteStreamRef.current = null;
    localPreviewStreamRef.current = null;
    bumpScreenRenderNonce();
    activeShareKey = null;
    startInFlight = null;
    setScreenStatus('ended');
  }, [bumpScreenRenderNonce, setScreenStatus]);

  const startSharing = useCallback(async (targetPeerId: string, sessionId: string) => {
    const shareKey = `${sessionId}:${targetPeerId}`;
    if (activeShareKey === shareKey || startInFlight) {
      return;
    }

    const displayMediaApi = getDisplayMediaApi();
    if (!displayMediaApi) {
      activeShareKey = null;
      setScreenStatus('error');
      setErrorDetails(
        'Screen sharing is not supported in this browser. Use a Chromium-based browser or update to a newer version.',
        { code: 'SCREEN_SHARE_START_ERROR' },
      );
      return;
    }

    activeShareKey = shareKey;

    if (activeScreenConnection) {
      activeScreenConnection.close();
      activeScreenConnection = null;
    }

    startInFlight = (async () => {
      const displayStream = await displayMediaApi({
        video: true,
        audio: false,
      });
      displayStream.getTracks().forEach((track) => {
        track.onended = () => {
          stopScreenSession();
        };
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
      setScreenStatus('error');
      setErrorDetails(
        error instanceof Error ? error.message : 'Failed to start screen sharing',
        { code: 'SCREEN_SHARE_START_ERROR' },
      );
    } finally {
      startInFlight = null;
    }
  }, [bumpScreenRenderNonce, setErrorDetails, setScreenStatus, stopScreenSession]);

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
  }, [bumpScreenRenderNonce, setErrorDetails, setScreenStatus]);

  const getRemoteStream = useCallback(() => remoteStreamRef.current, []);
  const getLocalPreviewStream = useCallback(() => localPreviewStreamRef.current, []);

  const cleanup = useCallback(() => {
    stopScreenSession();
  }, [stopScreenSession]);

  return { startSharing, prepareViewer, getRemoteStream, getLocalPreviewStream, cleanup };
}
