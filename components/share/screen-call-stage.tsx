'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

interface ScreenCallStageProps {
  remotePeerName: string | null;
  isSharer: boolean;
  viewerStream: MediaStream | null;
  localPreviewStream: MediaStream | null;
  onAbort: () => void;
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function ScreenCallStage({
  remotePeerName,
  isSharer,
  viewerStream,
  localPreviewStream,
  onAbort,
}: ScreenCallStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const displayStream = isSharer ? localPreviewStream ?? viewerStream : viewerStream ?? localPreviewStream;

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!displayStream) return;
    videoRef.current.srcObject = displayStream;
    videoRef.current.muted = true;
    void videoRef.current.play().catch(() => {});
  }, [displayStream]);

  useEffect(() => {
    const onFullScreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullscreen(true);
      return;
    }
    await document.exitFullscreen();
    setIsFullscreen(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[calc(100vh-6.5rem)] min-h-130 w-full overflow-hidden rounded-3xl border border-primary/25 bg-black shadow-[0_20px_120px_rgba(0,0,0,0.45)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(var(--primary),0.22),transparent_42%),radial-gradient(circle_at_80%_84%,rgba(var(--primary),0.14),transparent_45%)]" />
      <div className="relative h-full w-full">
        {displayStream ? (
          <video ref={videoRef} autoPlay playsInline muted={isSharer} className="relative h-full w-full object-contain bg-black" />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center bg-black/60">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-white/70">Connecting screen stream...</p>
          </div>
        )}
      </div>

      {isSharer && (
        <div className="absolute bottom-6 left-1/2 z-30 w-[min(92%,40rem)] -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-amber-500/12 px-4 py-3 backdrop-blur-md">
          <p className="text-[11px] font-mono uppercase tracking-wider text-amber-200">
            Mirror effect warning: preview can recursively repeat while sharing this same app window. Prefer sharing a full screen or another app window.
          </p>
        </div>
      )}

      <div className="absolute left-4 right-4 top-4 z-30 flex items-start justify-between gap-3">
        <div className="rounded-2xl border border-white/20 bg-black/45 px-4 py-3 backdrop-blur-md">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/70">Screen shared by</p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white">{isSharer ? 'You' : remotePeerName || 'Unknown'}</p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-black/45 px-4 py-3 text-right backdrop-blur-md">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/70">Call time</p>
          <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-white">{formatClock(elapsedSeconds)}</p>
        </div>
      </div>

      <div className="absolute left-3 top-1/2 z-30 -translate-y-1/2">
        <Button
          onClick={() => void toggleFullscreen()}
          size="icon"
          className="h-10 w-10 rounded-full border border-white/30 bg-black/55 text-white hover:bg-black/75"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
            <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
          </svg>
        </Button>
      </div>

      <div className="absolute right-3 top-1/2 z-30 -translate-y-1/2">
        <Button
          onClick={onAbort}
          size="icon"
          className="h-10 w-10 rounded-full border border-destructive/50 bg-destructive/75 text-white hover:bg-destructive"
          aria-label="Abort call"
          title="Abort call"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Button>
      </div>
    </div>
  );
}
