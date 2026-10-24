"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import {
  ComputerScreenShareIcon,
  File01Icon,
  MailSend01Icon,
} from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { Btn, CopyButton, Spinner } from "@/components/ui-kit"
import { InfoTip } from "@/components/info-tip"
import {
  cancelRequest,
  createRequest,
  requestLink,
  useRequest,
} from "@/lib/request"
import { LIMITS, type RequestWant } from "@/lib/protocol"
import { useConnection } from "@/lib/store"
import { cn } from "@/lib/utils"

const WANTS: Array<{
  id: RequestWant
  label: string
  icon: typeof File01Icon
}> = [
  { id: "files", label: "Files", icon: File01Icon },
  { id: "screen", label: "Their screen", icon: ComputerScreenShareIcon },
]

/** What a request link is, for the info button. */
function RequestHelp() {
  return (
    <InfoTip label='What is a request link?' align='end'>
      <span className='font-medium text-foreground'>
        For when the other person has nothing to send yet.
      </span>{" "}
      You get a link to send them (by message or QR code). When they open it,
      they see one button to send you files or share their screen: no code, no
      account. You accept before anything arrives.
    </InfoTip>
  )
}

/**
 * Under Receive: the other direction of a code. Instead of them giving you a code, you give
 * them a link that asks for files or their screen.
 */
export function RequestSection() {
  const mine = useRequest((s) => s.mine)
  const online = useConnection((s) => s.status === "online")
  const [open, setOpen] = useState(false)
  const [want, setWant] = useState<RequestWant>("files")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (mine) return <RequestWaiting />

  if (!open)
    return (
      <div className='mt-4 border-t border-border pt-4'>
        <p className='text-sm text-muted-foreground'>No code to enter?</p>
        <div className='mt-2 flex items-center gap-1'>
          <Btn className='flex-1' onClick={() => setOpen(true)}>
            <Icon icon={MailSend01Icon} className='size-4 text-sky' />
            Request files or a screen
          </Btn>
          <RequestHelp />
        </div>
      </div>
    )

  return (
    <form
      className='enter mt-5 border-t border-border pt-4'
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(await createRequest(want, note))
        setBusy(false)
      }}
    >
      <div className='flex items-center justify-between'>
        <p className='text-sm font-medium'>What do you need from them?</p>
        <RequestHelp />
      </div>
      <div role='radiogroup' aria-label='Ask for' className='mt-2 flex gap-2'>
        {WANTS.map((w) => (
          <button
            key={w.id}
            type='button'
            role='radio'
            aria-checked={want === w.id}
            onClick={() => setWant(w.id)}
            className={cn(
              "pressable flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium",
              want === w.id
                ? "border-sky/60 bg-sky/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon icon={w.icon} className='size-4' />
            {w.label}
          </button>
        ))}
      </div>
      <label htmlFor='request-note' className='sr-only'>
        Note for them (optional)
      </label>
      <input
        id='request-note'
        value={note}
        maxLength={LIMITS.maxNote}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          want === "files"
            ? "Note (optional): the photos from Saturday"
            : "Note (optional): show me the error"
        }
        className='well mt-3 h-10 w-full rounded-full px-4 text-sm outline-none focus:border-sky/60'
      />
      {error && (
        <p role='alert' className='mt-2 text-sm text-destructive'>
          {error}
        </p>
      )}
      <div className='mt-3 flex gap-2'>
        <Btn variant='ghost' onClick={() => setOpen(false)}>
          Cancel
        </Btn>
        <Btn
          type='submit'
          variant='primary'
          className='flex-1'
          disabled={!online || busy}
        >
          {busy && <Spinner className='size-3.5' />}
          Get link to send them
        </Btn>
      </div>
    </form>
  )
}

function RequestWaiting() {
  const mine = useRequest((s) => s.mine)!
  const link = requestLink(mine)
  const [qr, setQr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const canNativeShare =
    typeof navigator !== "undefined" && "share" in navigator

  useEffect(() => {
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: "M" })
      .then((url) => live && setQr(url))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [link])

  return (
    <div className='enter mt-5 border-t border-border pt-4' role='status'>
      <p className='flex items-center gap-2 text-sm font-medium'>
        <Spinner className='size-3.5 text-sky' />
        Waiting for someone to answer
      </p>
      <ol className='mt-2 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground'>
        <li>Send them this link.</li>
        <li>
          They {mine.want === "files" ? "pick files" : "share their screen"}{" "}
          with one button.
        </li>
        <li>You accept, then it arrives here.</li>
      </ol>
      <div className='mt-3 flex items-center gap-2'>
        <input
          readOnly
          aria-label='Request link'
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className='well h-10 min-w-0 flex-1 rounded-full px-4 font-mono text-[12px] text-muted-foreground outline-none'
        />
        <CopyButton value={link} size='md' />
      </div>
      <div className='disclosure' data-open={showQr}>
        <div>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt='QR code for the request link'
              className='mx-auto mt-3 size-40 rounded-xl bg-white p-2'
            />
          )}
        </div>
      </div>
      <div className='mt-3 flex flex-wrap justify-between gap-2'>
        <Btn
          size='sm'
          variant='ghost'
          aria-expanded={showQr}
          onClick={() => setShowQr((v) => !v)}
        >
          {showQr ? "Hide QR code" : "QR code"}
        </Btn>
        {canNativeShare && (
          <Btn
            size='sm'
            variant='ghost'
            onClick={() =>
              navigator
                .share({ title: "SignalShare request", url: link })
                .catch(() => {})
            }
          >
            Share link…
          </Btn>
        )}
        <Btn
          size='sm'
          variant='danger'
          className='ml-auto'
          onClick={cancelRequest}
        >
          Cancel request
        </Btn>
      </div>
    </div>
  )
}
