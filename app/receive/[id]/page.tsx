"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Alert02Icon,
  ComputerScreenShareIcon,
  File01Icon,
  TextIcon,
} from "@hugeicons/core-free-icons"
import { AppShell } from "@/components/app-shell"
import { SessionView } from "@/components/session-view"
import { Icon } from "@/components/icon"
import { Btn, Spinner } from "@/components/ui-kit"
import { Avatar, Glass } from "@/components/brand"
import { join } from "@/lib/controller"
import { useConnection, useShare } from "@/lib/store"
import { safeStorage } from "@/lib/signaling"
import type { SessionPreview } from "@/lib/protocol"
import { formatBytes } from "@/lib/utils"
import { PRECAUTION, riskMessage, riskOf } from "@/lib/risky"
import { useClientValue } from "@/lib/use-client-value"
import { isSecret } from "@/lib/transfer/handshake"

/** The share secret from the link's #fragment (never sent to the server), if it survived. */
const linkSecret = () => {
  const h = location.hash.slice(1)
  return isSecret(h) ? h : null
}

type Load =
  | { state: "loading" }
  | { state: "ready"; preview: SessionPreview }
  | { state: "error"; title: string; detail: string }

export default function ReceivePage() {
  const { id } = useParams<{ id: string }>()
  const idle = useShare((s) => s.phase === "idle")
  const online = useConnection((s) => s.status === "online")
  const [load, setLoad] = useState<Load>({ state: "loading" })
  const resumable = useClientValue(
    () =>
      Boolean(
        safeStorage(() => sessionStorage.getItem(`signalshare-seat:${id}`)),
      ),
    false,
  )

  useEffect(() => {
    let live = true
    fetch(`/api/sessions/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!live) return
        if (res.ok)
          return setLoad({ state: "ready", preview: await res.json() })
        if (res.status === 429)
          return setLoad({
            state: "error",
            title: "Too many requests",
            detail: "Wait a moment and reload the page.",
          })
        setLoad({
          state: "error",
          title: "This share has ended",
          detail:
            "The sender stopped sharing, someone else received it, or the link expired. Ask for a new link.",
        })
      })
      .catch(
        () =>
          live &&
          setLoad({
            state: "error",
            title: "Can’t reach SignalShare",
            detail: "Check your internet connection and reload.",
          }),
      )
    return () => {
      live = false
    }
  }, [id])

  // Coming back after a reload: reclaim our seat automatically.
  useEffect(() => {
    if (resumable && online && idle && load.state === "ready")
      void join({ sessionId: id, secret: linkSecret() })
    // Only on first eligibility.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumable, online, load.state])

  if (!idle)
    return (
      <AppShell>
        <SessionView />
      </AppShell>
    )

  return (
    <AppShell>
      <div className='mx-auto w-full max-w-md px-4 pb-10 pt-10 sm:pt-16'>
        {load.state === "loading" && (
          <div
            className='flex justify-center py-20 text-muted-foreground'
            role='status'
          >
            <Spinner className='size-6' />{" "}
            <span className='sr-only'>Loading share</span>
          </div>
        )}
        {load.state === "error" && (
          <Glass as='section' className='enter p-6 text-center'>
            <span className='mx-auto grid size-12 place-items-center rounded-full bg-destructive/12 text-destructive'>
              <Icon icon={Alert02Icon} />
            </span>
            <h1 className='title mt-4'>{load.title}</h1>
            <p className='mt-2 text-sm text-muted-foreground'>{load.detail}</p>
            <Link
              href='/'
              className='pressable mt-6 inline-flex h-10 items-center rounded-full bg-surface-2 px-5 text-sm font-medium'
            >
              Go to SignalShare
            </Link>
          </Glass>
        )}
        {load.state === "ready" && (
          <Preview
            id={id}
            preview={load.preview}
            online={online}
            resumable={resumable}
          />
        )}
      </div>
    </AppShell>
  )
}

function Preview({
  id,
  preview,
  online,
  resumable,
}: {
  id: string
  preview: SessionPreview
  online: boolean
  resumable: boolean
}) {
  const [busy, setBusy] = useState(false)
  const icon =
    preview.kind === "screen"
      ? ComputerScreenShareIcon
      : preview.kind === "text"
        ? TextIcon
        : File01Icon
  const what =
    preview.kind === "screen"
      ? "is sharing their screen"
      : preview.kind === "text"
        ? "wants to send you some text"
        : `wants to send you ${preview.files.length === 1 ? "a file" : `${preview.files.length} files`}`
  const claimed = !preview.available && !resumable

  return (
    <Glass
      as='section'
      className='enter overflow-hidden'
      aria-labelledby='preview-title'
    >
      <div className='p-6'>
        <div className='flex items-center gap-3'>
          <Avatar name={preview.senderName} ring className='size-14' />
          <div className='min-w-0'>
            <h1 id='preview-title' className='font-semibold'>
              {preview.senderName}
            </h1>
            <p className='text-sm text-muted-foreground'>{what}</p>
          </div>
        </div>

        {preview.kind === "files" && (
          <ul className='well mt-5 max-h-60 divide-y divide-border overflow-auto rounded-2xl'>
            {preview.files.map((f, i) => {
              const risk = riskOf(f.name)
              return (
                <li key={i} className='px-3 py-2.5 text-sm'>
                  <div className='flex items-center gap-3'>
                    <Icon
                      icon={risk ? Alert02Icon : icon}
                      className={
                        risk
                          ? "size-4 text-warning"
                          : "size-4 text-muted-foreground"
                      }
                    />
                    <span className='min-w-0 flex-1 truncate'>{f.name}</span>
                    <span className='tabular-nums text-muted-foreground'>
                      {formatBytes(f.size)}
                    </span>
                  </div>
                  {risk && (
                    <p className='mt-1.5 pl-7 text-xs text-warning'>
                      {riskMessage(f.name, risk, preview.senderName)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {preview.kind === "files" && (
          <p className='mt-3 text-xs text-muted-foreground'>{PRECAUTION}</p>
        )}
        {preview.kind !== "files" && (
          <div className='well mt-5 flex items-center gap-3 rounded-2xl p-4 text-sm'>
            <Icon icon={icon} className='text-primary' />
            {preview.kind === "screen"
              ? "Live screen : view only. Nothing is recorded."
              : `${formatBytes(preview.totalSize)} of text`}
          </div>
        )}

        {claimed && (
          <p className='mt-4 text-sm text-warning' role='alert'>
            Another device already received this share. Ask the sender to share
            again.
          </p>
        )}
      </div>
      <footer className='flex gap-2 border-t border-border px-6 py-4'>
        <Link
          href='/'
          className='pressable inline-flex h-10 flex-1 items-center justify-center rounded-full text-sm font-medium text-muted-foreground hover:bg-surface-2'
        >
          Not now
        </Link>
        <Btn
          variant='primary'
          className='flex-1'
          disabled={!online || busy || claimed}
          onClick={async () => {
            setBusy(true)
            await join({ sessionId: id, secret: linkSecret() })
            setBusy(false)
          }}
        >
          {(!online || busy) && <Spinner className='size-3.5' />}
          {!online
            ? "Connecting…"
            : preview.kind === "screen"
              ? "View screen"
              : "Receive"}
        </Btn>
      </footer>
    </Glass>
  )
}
