"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Btn } from "@/components/ui-kit"
import { Avatar } from "@/components/brand"
import { declineInvite, join } from "@/lib/controller"
import { cancelRequest, declineRequested, useRequest } from "@/lib/request"
import { useConnection, useShare } from "@/lib/store"
import { isActive } from "@/lib/machine"
import { formatBytes } from "@/lib/utils"
import { pairFor } from "@/lib/pairing"
import { DEVICE_LABEL } from "@/lib/device"
import { riskOf } from "@/lib/risky"

/**
 * A nearby device offered us a share, or someone answered our request link. Modal: dimmed
 * backdrop, focus moved in, Escape declines.
 */
export function InvitePrompt() {
  const invite = useConnection((s) => s.invite)
  // Already in a share: an answer to our request waits until it's done (accepting would fail).
  const busy = useShare((s) => isActive(s.phase))
  const accept = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const path = usePathname()

  const decline = () =>
    invite?.requestId ? declineRequested(invite) : declineInvite()

  useEffect(() => {
    if (!invite) return
    accept.current?.focus()
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" &&
      (invite.requestId ? declineRequested(invite) : declineInvite())
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [invite])

  if (!invite) return null
  const paired = invite.pairId ? pairFor(invite.pairId) : undefined
  const what =
    invite.kind === "screen"
      ? invite.requestId
        ? "is ready to share their screen"
        : "wants to share their screen"
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
        {invite.requestId && (
          <p className='eyebrow mb-3'>Answer to your request</p>
        )}
        {paired && <p className='eyebrow mb-3'>From one of your devices</p>}
        <div className='flex items-center gap-3'>
          <Avatar name={invite.from} ring className='size-12' />
          <div className='min-w-0'>
            <h2 id='invite-title' className='font-semibold'>
              {paired
                ? `${invite.from} · ${DEVICE_LABEL[invite.fromDevice ?? paired.device ?? "other"]}`
                : invite.from}
            </h2>
            <p className='truncate text-sm text-muted-foreground'>{what}</p>
          </div>
        </div>
        {invite.kind === "files" && (
          <p className='mt-3 text-sm text-muted-foreground'>
            {formatBytes(invite.totalSize)} in total
          </p>
        )}
        {invite.files.some((f) => riskOf(f.name)) && (
          <p className='mt-2 text-sm text-warning' role='note'>
            Includes a program or script. Only accept if you expected it from{" "}
            {invite.from}.
          </p>
        )}
        {busy && (
          <p className='mt-2 text-sm text-muted-foreground' role='note'>
            Finish your current share first, then accept.
          </p>
        )}
        <div className='mt-5 flex gap-2'>
          <Btn className='flex-1' onClick={decline}>
            {invite.requestId ? "Decline" : "Not now"}
          </Btn>
          <Btn
            ref={accept}
            variant='primary'
            className='flex-1'
            disabled={busy}
            onClick={() => {
              // An answer made with our request link carries its secret: check keys with it.
              const secret =
                invite.requestId && invite.keyed
                  ? (useRequest.getState().mine?.secret ?? null)
                  : null
              if (invite.requestId) cancelRequest() // answered: the link is done
              // The share is shown on the home page.
              if (path !== "/") router.push("/")
              void join({
                sessionId: invite.sessionId,
                secret,
                pairId: paired?.id ?? null,
              })
            }}
          >
            {invite.kind === "screen"
              ? "View"
              : invite.requestId
                ? "Accept"
                : "Receive"}
          </Btn>
        </div>
      </div>
    </div>
  )
}
