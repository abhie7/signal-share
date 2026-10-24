"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { toast } from "sonner"
import { Link04Icon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { Btn, CopyButton } from "@/components/ui-kit"
import { Glass } from "@/components/brand"
import { DeviceIcon } from "@/components/device-icon"
import {
  enableWakeups,
  startPairing,
  unpair,
  usePairs,
  wakePair,
  type Pair,
} from "@/lib/pairing"
import { DEVICE_LABEL } from "@/lib/device"
import { useConnection } from "@/lib/store"
import { signaling } from "@/lib/signaling"
import { useClientValue } from "@/lib/use-client-value"
import { cn } from "@/lib/utils"

/** "Sage Albatross · iPhone": the other device's name and what it is. */
export const pairLabel = (p: Pick<Pair, "device" | "name">) =>
  p.device
    ? `${p.name ?? "Paired device"} · ${DEVICE_LABEL[p.device]}`
    : "Waiting for the other device…"

/** Wake a paired device whose tab is closed (push), when this server can. */
export function WakeButton({ pair }: { pair: Pair }) {
  const [busy, setBusy] = useState(false)
  const online = useConnection((s) => s.status === "online")
  const can = useClientValue(() => Boolean(signaling.welcome?.vapidKey), false)
  if (!can || !pair.device) return null
  return (
    <Btn
      size='sm'
      variant='ghost'
      disabled={busy || !online}
      onClick={async () => {
        setBusy(true)
        const err = await wakePair(pair.id)
        setBusy(false)
        if (err) toast.error(err)
        else
          toast.success("Notification sent", {
            description: `Open it on your ${DEVICE_LABEL[pair.device!]} and it will show up here.`,
          })
      }}
    >
      {busy ? "Waking…" : "Wake"}
    </Btn>
  )
}

/**
 * Devices paired with this one: "Send to my iPhone" whenever it's online, no account. Pairing
 * is a QR code scanned once; the secret stays on the two devices.
 */
export function MyDevices() {
  const pairs = usePairs((s) => s.pairs)
  const online = usePairs((s) => s.online)
  const [link, setLink] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const pending = pairs.find((p) => !p.device)

  useEffect(() => {
    if (!link) return
    let live = true
    QRCode.toDataURL(link, { margin: 1, width: 360, errorCorrectionLevel: "M" })
      .then((url) => live && setQr(url))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [link])

  const done = pairs.filter((p) => p.device)
  return (
    <Glass
      as='section'
      className='p-4 sm:p-6'
      aria-labelledby='devices-heading'
    >
      <h2 id='devices-heading' className='title'>
        My devices
      </h2>
      {done.length === 0 && !link && (
        <p className='mt-1.5 text-sm text-muted-foreground'>
          Pair your phone or laptop once. It shows up here whenever it’s online,
          ready to send to.
        </p>
      )}
      {done.length > 0 && (
        <ul className='mt-3 space-y-1'>
          {done.map((p) => {
            const here = online.some((o) => o.pairId === p.id)
            return (
              <li
                key={p.id}
                className='flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm'
              >
                <span className='relative'>
                  <DeviceIcon device={p.device} className='size-5 text-sky' />
                  <span
                    className={cn(
                      "absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-[var(--popover)]",
                      here ? "bg-mint" : "bg-border",
                    )}
                    aria-hidden
                  />
                </span>
                <span className='min-w-0 flex-1'>
                  <span className='block truncate'>{pairLabel(p)}</span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {here ? "Online" : "Offline"}
                  </span>
                </span>
                {!here && <WakeButton pair={p} />}
                <button
                  type='button'
                  onClick={() => {
                    if (confirm(`Unpair ${pairLabel(p)}?`)) unpair(p.id)
                  }}
                  className='text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline'
                >
                  Unpair
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {link && pending ? (
        <div className='enter mt-4 text-center'>
          <p className='text-sm font-medium'>Scan with your other device</p>
          <p className='mt-1 text-xs text-muted-foreground'>
            Open the camera on your phone, or open the link on your laptop.
          </p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt='QR code to pair a device'
              className='mx-auto mt-3 size-44 rounded-xl bg-white p-2'
            />
          )}
          <input
            readOnly
            aria-label='Pairing link'
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className='well mt-3 h-9 w-full rounded-full px-4 font-mono text-[11px] text-muted-foreground outline-none'
          />
          <div className='mt-3 flex justify-center gap-2'>
            <CopyButton value={link} label='Copy link' />
            <Btn
              size='sm'
              variant='ghost'
              onClick={() => {
                unpair(pending.id)
                setLink(null)
              }}
            >
              Cancel
            </Btn>
          </div>
        </div>
      ) : (
        <div className='mt-3 flex flex-wrap items-center justify-between gap-2'>
          <Btn
            size='sm'
            onClick={async () => {
              if (pending) unpair(pending.id)
              setLink(await startPairing())
            }}
          >
            <Icon icon={Link04Icon} className='size-4' /> Pair a device
          </Btn>
          {done.length > 0 && <WakeupsToggle />}
        </div>
      )}
    </Glass>
  )
}

/** Let paired devices wake this one with a notification when its tab is closed. */
function WakeupsToggle() {
  const supported = useClientValue(
    () =>
      Boolean(signaling.welcome?.vapidKey) &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    false,
  )
  const granted = useClientValue(
    () =>
      typeof Notification !== "undefined" &&
      Notification.permission === "granted",
    false,
  )
  const ios = useClientValue(
    () =>
      /iPhone|iPad/.test(navigator.userAgent) &&
      !(navigator as Navigator & { standalone?: boolean }).standalone,
    false,
  )
  const [on, setOn] = useState(false)
  if (ios)
    return (
      <span className='text-xs text-muted-foreground'>
        To be woken up, add SignalShare to your Home Screen.
      </span>
    )
  if (!supported) return null
  if (granted || on)
    return (
      <span className='text-xs text-muted-foreground'>
        Your devices can wake this one.
      </span>
    )
  return (
    <button
      type='button'
      className='text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline'
      onClick={async () => setOn(await enableWakeups().catch(() => false))}
    >
      Let them wake this device
    </button>
  )
}
