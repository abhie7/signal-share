"use client"

import { useEffect, useRef, useState } from "react"
import {
  FullScreenIcon,
  PauseIcon,
  PlayIcon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { Btn, Spinner } from "@/components/ui-kit"
import { cancel, changeSource, setPaused } from "@/lib/controller"
import { useShare } from "@/lib/store"
import { cn } from "@/lib/utils"

function useVideo(stream: MediaStream | null, muted: boolean) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.srcObject = stream
    setPlaying(false)
    if (!stream) return
    // Autoplay policies allow muted playback; audio is opt-in via the unmute button.
    video.muted = muted
    video.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    )
    return () => {
      video.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream])
  useEffect(() => {
    if (ref.current) ref.current.muted = muted
  }, [muted])
  return { ref, playing }
}

/** Viewer: the shared screen, as large as the window allows. */
export function ScreenStage() {
  const s = useShare()
  const [muted, setMuted] = useState(true)
  const { ref, playing } = useVideo(s.remoteStream, muted)
  const box = useRef<HTMLDivElement>(null)
  const hasAudio = Boolean(s.remoteStream?.getAudioTracks().length)
  const live = s.phase === "streaming"

  return (
    <div className='enter mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 pb-6 pt-4 sm:px-6'>
      <div className='liquid liquid-pill mb-3 flex flex-wrap items-center justify-between gap-3 py-2 pl-4 pr-2'>
        <div className='flex items-center gap-2.5'>
          <span
            className={cn(
              "size-2.5 rounded-full",
              live ? "bg-success" : "bg-warning",
            )}
            aria-hidden
          />
          <h1
            className='text-[17px] font-semibold tracking-tight'
            aria-live='polite'
          >
            {live
              ? `${s.peerName ?? "Shared"} screen`
              : s.phase === "reconnecting"
                ? "Reconnecting…"
                : "Waiting for the picture…"}
          </h1>
          {s.paused && (
            <span className='rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground'>
              Paused
            </span>
          )}
        </div>
        <div className='flex gap-2'>
          {hasAudio && (
            <Btn
              size='sm'
              onClick={() => setMuted((m) => !m)}
              aria-pressed={!muted}
            >
              <Icon
                icon={muted ? VolumeOffIcon : VolumeHighIcon}
                className='size-4'
              />{" "}
              {muted ? "Unmute" : "Mute"}
            </Btn>
          )}
          <Btn
            size='sm'
            onClick={() => box.current?.requestFullscreen?.().catch(() => {})}
          >
            <Icon icon={FullScreenIcon} className='size-4' /> Full screen
          </Btn>
          <Btn size='sm' variant='danger' onClick={cancel}>
            Leave
          </Btn>
        </div>
      </div>
      <div
        ref={box}
        className='relative flex min-h-[50vh] flex-1 items-center justify-center overflow-hidden rounded-3xl bg-black shadow-[0_30px_80px_-30px_color-mix(in_oklch,var(--teal)_45%,black)] ring-1 ring-white/10'
      >
        <video
          ref={ref}
          playsInline
          autoPlay
          muted
          className='max-h-[calc(100dvh-10rem)] w-full object-contain'
          aria-label='Shared screen'
        />
        {(!playing || !live) && (
          <div className='absolute inset-0 grid place-items-center bg-black/50 text-white/80'>
            <span className='flex items-center gap-2 text-sm'>
              <Spinner className='size-4' /> {s.note ?? "Connecting…"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sharer: small self-preview plus controls. */
export function SharerPreview() {
  const s = useShare()
  const { ref } = useVideo(s.localStream, true)
  const track = s.localStream?.getVideoTracks()[0]
  const surface = (
    track?.getSettings() as MediaTrackSettings & { displaySurface?: string }
  )?.displaySurface
  const what =
    surface === "monitor"
      ? "your entire screen"
      : surface === "window"
        ? "a window"
        : surface === "browser"
          ? "a browser tab"
          : "your selection"

  return (
    <div className='mt-5'>
      <div className='relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10'>
        <video
          ref={ref}
          playsInline
          autoPlay
          muted
          className={cn(
            "aspect-video w-full object-contain transition-opacity duration-200",
            s.paused && "opacity-40",
          )}
          aria-label='Preview of what you are sharing'
        />
        <span className='absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur'>
          {s.paused ? "Paused : viewer sees a still frame" : `Sharing ${what}`}
        </span>
      </div>
      <div className='mt-3 flex flex-wrap gap-2'>
        <Btn
          size='sm'
          onClick={() => setPaused(!s.paused)}
          aria-pressed={s.paused}
          disabled={
            s.phase !== "streaming" &&
            s.phase !== "waiting" &&
            s.phase !== "negotiating"
          }
        >
          <Icon icon={s.paused ? PlayIcon : PauseIcon} className='size-4' />{" "}
          {s.paused ? "Resume" : "Pause"}
        </Btn>
        <Btn size='sm' onClick={() => changeSource()}>
          Share something else
        </Btn>
      </div>
    </div>
  )
}
