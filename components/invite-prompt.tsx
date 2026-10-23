"use client"

import { useEffect, useRef } from "react"
import { Btn } from "@/components/ui-kit"
import { Avatar } from "@/components/brand"
import { declineInvite, join } from "@/lib/controller"
import { useConnection } from "@/lib/store"
import { formatBytes } from "@/lib/utils"

/** A nearby device offered us a share. Modal: dimmed backdrop, focus moved in, Escape declines. */
export function InvitePrompt() {
  const invite = useConnection((s) => s.invite)
  const accept = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!invite) return
    accept.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && declineInvite()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [invite])

  if (!invite) return null
  const what =
    invite.kind === "screen"
      ? "wants to share their screen"
      : invite.kind === "text"
        ? "wants to send you text"
        : `wants to send you ${invite.files.length === 1 ? invite.files[0].name : `${invite.files.length} files`}`

  return (
    <div
      className='fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 backdrop-blur-[2px] sm:place-items-center'
      style={{ animation: "fade 180ms ease both" }}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-labelledby='invite-title'
        className='liquid enter w-full max-w-sm p-5'
      >
        <div className='flex items-center gap-3'>
          <Avatar name={invite.from} ring className='size-12' />
          <div className='min-w-0'>
            <h2 id='invite-title' className='font-semibold'>
              {invite.from}
            </h2>
            <p className='truncate text-sm text-muted-foreground'>{what}</p>
          </div>
        </div>
        {invite.kind === "files" && (
          <p className='mt-3 text-sm text-muted-foreground'>
            {formatBytes(invite.totalSize)} in total
          </p>
        )}
        <div className='mt-5 flex gap-2'>
          <Btn className='flex-1' onClick={declineInvite}>
            Not now
          </Btn>
          <Btn
            ref={accept}
            variant='primary'
            className='flex-1'
            onClick={() => void join({ sessionId: invite.sessionId })}
          >
            {invite.kind === "screen" ? "View" : "Receive"}
          </Btn>
        </div>
      </div>
    </div>
  )
}
