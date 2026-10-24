"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import QRCode from "qrcode"
import {
  Alert02Icon,
  ComputerScreenShareIcon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"
import { AppShell } from "@/components/app-shell"
import { SessionView } from "@/components/session-view"
import { Icon } from "@/components/icon"
import { Btn, CopyButton, Spinner } from "@/components/ui-kit"
import { Avatar, Glass } from "@/components/brand"
import { screenShareSupported, shareFiles, shareScreen } from "@/lib/controller"
import { useConnection, useShare } from "@/lib/store"
import type { RequestPreview } from "@/lib/protocol"
import { formatBytes } from "@/lib/utils"
import { useClientValue } from "@/lib/use-client-value"
import { isSecret } from "@/lib/transfer/handshake"

type Load =
  | { state: "loading" }
  | { state: "ready"; request: RequestPreview }
  | { state: "error"; title: string; detail: string }

/**
 * The page someone opens from a request link. Usually their first visit: one sentence, one
 * button, nothing about codes or networks.
 */
export default function RequestPage() {
  const { id } = useParams<{ id: string }>()
  const idle = useShare((s) => s.phase === "idle")
  const [load, setLoad] = useState<Load>({ state: "loading" })

  useEffect(() => {
    let live = true
    fetch(`/api/requests/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!live) return
        if (res.ok)
          return setLoad({ state: "ready", request: await res.json() })
        setLoad({
          state: "error",
          title:
            res.status === 429 ? "Too many requests" : "This request has ended",
          detail:
            res.status === 429
              ? "Wait a moment and reload the page."
              : "It was answered, cancelled or it expired. Ask for a new link.",
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
            <Spinner className='size-6' />
            <span className='sr-only'>Loading request</span>
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
        {load.state === "ready" && <Answer id={id} request={load.request} />}
      </div>
    </AppShell>
  )
}

function Answer({ id, request }: { id: string; request: RequestPreview }) {
  const name = request.requesterName
  const online = useConnection((s) => s.status === "online")
  // The request link's #secret: the share is keyed with it, so the asker can verify us.
  const secret = useClientValue(() => {
    const h = location.hash.slice(1)
    return isSecret(h) ? h : null
  }, null)
  const answer = { requestId: id, to: name, secret }
  return (
    <Glass
      as='section'
      className='enter overflow-hidden'
      aria-labelledby='request-title'
    >
      <div className='p-6 text-center'>
        <Avatar name={name} ring className='mx-auto size-16' />
        <h1 id='request-title' className='title mt-4'>
          {request.want === "files"
            ? `${name} is asking you for files`
            : `${name} wants to see your screen`}
        </h1>
        {request.note && (
          <p className='mx-auto mt-3 max-w-xs text-balance text-[15px] italic text-muted-foreground'>
            “{request.note}”
          </p>
        )}
        {!request.available ? (
          <p className='mt-5 text-sm text-warning' role='alert'>
            Someone already answered this request. Ask {name} for a new link.
          </p>
        ) : request.want === "files" ? (
          <FilesAnswer
            name={name}
            online={online}
            send={(f) => shareFiles(f, answer)}
          />
        ) : (
          <ScreenAnswer
            name={name}
            online={online}
            start={() => shareScreen(answer)}
          />
        )}
      </div>
      <p className='border-t border-border px-6 py-3 text-center text-xs text-muted-foreground'>
        Goes straight to {name}, end-to-end encrypted. Nothing is stored, no
        account needed.
      </p>
    </Glass>
  )
}

function FilesAnswer({
  name,
  online,
  send,
}: {
  name: string
  online: boolean
  send: (files: File[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [over, setOver] = useState(false)
  const total = files.reduce((n, f) => n + f.size, 0)

  return (
    <div className='mt-6'>
      <input
        ref={input}
        type='file'
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ""
          setFiles((prev) => [...prev, ...picked])
        }}
      />
      {files.length === 0 ? (
        <button
          type='button'
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            setFiles(Array.from(e.dataTransfer.files))
          }}
          className={
            over
              ? "flex w-full flex-col items-center gap-3 rounded-2xl border border-solid border-teal bg-teal/10 px-6 py-10"
              : "flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-[color-mix(in_oklch,var(--foreground)_25%,transparent)] px-6 py-10 hover:bg-surface-2/60"
          }
        >
          <Icon icon={Upload04Icon} className='size-6 text-teal' />
          <span className='text-[15px] font-semibold'>
            Choose files to send
          </span>
          <span className='hidden text-xs text-muted-foreground sm:block'>
            or drop them here
          </span>
        </button>
      ) : (
        <>
          <ul className='well max-h-56 divide-y divide-border overflow-auto rounded-2xl text-left text-sm'>
            {files.map((f, i) => (
              <li key={i} className='flex items-center gap-3 px-3 py-2'>
                <span className='min-w-0 flex-1 truncate'>{f.name}</span>
                <span className='tabular-nums text-muted-foreground'>
                  {formatBytes(f.size)}
                </span>
              </li>
            ))}
          </ul>
          <div className='mt-3 flex gap-2'>
            <Btn onClick={() => setFiles([])}>Clear</Btn>
            <Btn
              variant='primary'
              size='lg'
              className='flex-1'
              disabled={!online}
              onClick={() => send(files)}
            >
              {!online && <Spinner className='size-3.5' />}
              Send {files.length === 1 ? "it" : `${files.length} files`} to{" "}
              {name}
            </Btn>
          </div>
          <p className='mt-2 text-xs text-muted-foreground'>
            {formatBytes(total)} · {name} accepts before it starts
          </p>
        </>
      )}
    </div>
  )
}

function ScreenAnswer({
  name,
  online,
  start,
}: {
  name: string
  online: boolean
  start: () => void
}) {
  const supported = useClientValue(screenShareSupported, true)
  const href = useClientValue(() => location.href, "")
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    if (supported || !href) return
    let live = true
    QRCode.toDataURL(href, { margin: 1, width: 360, errorCorrectionLevel: "M" })
      .then((url) => live && setQr(url))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [supported, href])

  if (!supported)
    return (
      <div className='mt-6'>
        <p className='text-[15px] font-medium'>Open this on your computer</p>
        <p className='mt-1 text-sm text-muted-foreground'>
          Phones and tablets can’t share their screen from a browser. Scan the
          code with your computer’s camera, or send yourself the link.
        </p>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt='QR code for this request'
            className='mx-auto mt-4 size-44 rounded-xl bg-white p-2'
          />
        )}
        <div className='mt-4 flex justify-center'>
          <CopyButton value={href} size='md' label='Copy link' />
        </div>
      </div>
    )

  return (
    <div className='mt-6'>
      <ul className='mx-auto max-w-xs space-y-1 text-sm text-muted-foreground'>
        <li>
          You choose what to share: one window, a tab or the whole screen.
        </li>
        <li>You can stop any time.</li>
      </ul>
      <Btn
        variant='primary'
        size='lg'
        className='mt-5 w-full'
        disabled={!online}
        onClick={start}
      >
        {online ? (
          <Icon icon={ComputerScreenShareIcon} className='size-5' />
        ) : (
          <Spinner className='size-3.5' />
        )}
        Share my screen with {name}
      </Btn>
    </div>
  )
}
