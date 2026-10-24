"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Alert02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { AppShell } from "@/components/app-shell"
import { Icon } from "@/components/icon"
import { Glass } from "@/components/brand"
import { Spinner } from "@/components/ui-kit"
import { DeviceIcon } from "@/components/device-icon"
import { acceptPairing, usePairs } from "@/lib/pairing"
import { DEVICE_LABEL } from "@/lib/device"
import { isSecret } from "@/lib/transfer/handshake"

/** Opened from the QR code another device shows under My devices. */
export default function PairPage() {
  const [id, setId] = useState<string | null>(null)
  const [bad, setBad] = useState(false)
  const pair = usePairs((s) => s.pairs.find((p) => p.id === id))
  const online = usePairs((s) => s.online.some((o) => o.pairId === id))

  useEffect(() => {
    const secret = location.hash.slice(1)
    void (isSecret(secret) ? acceptPairing(secret) : Promise.reject()).then(
      (pairId) => {
        // The secret is stored now: drop it from the address bar and history.
        history.replaceState(null, "", "/pair")
        setId(pairId)
      },
      () => setBad(true),
    )
  }, [])

  return (
    <AppShell>
      <div className='mx-auto w-full max-w-md px-4 pb-10 pt-10 sm:pt-16'>
        <Glass as='section' className='enter p-6 text-center'>
          {bad ? (
            <>
              <span className='mx-auto grid size-12 place-items-center rounded-full bg-destructive/12 text-destructive'>
                <Icon icon={Alert02Icon} />
              </span>
              <h1 className='title mt-4'>This pairing link is incomplete</h1>
              <p className='mt-2 text-sm text-muted-foreground'>
                Scan the QR code again, or copy the whole link from the other
                device.
              </p>
            </>
          ) : online && pair?.device ? (
            <>
              <span className='mx-auto grid size-12 place-items-center rounded-full bg-mint/15 text-mint'>
                <Icon icon={Tick02Icon} />
              </span>
              <h1 className='title mt-4'>Paired with {pair.name}</h1>
              <p className='mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground'>
                <DeviceIcon device={pair.device} className='size-4' />
                {DEVICE_LABEL[pair.device]}
              </p>
              <p className='mt-3 text-sm text-muted-foreground'>
                It shows up under My devices whenever both are online. The
                pairing lives only on these two devices.
              </p>
            </>
          ) : (
            <>
              <Spinner className='mx-auto size-6 text-sky' />
              <h1 className='title mt-4'>Pairing…</h1>
              <p className='mt-2 text-sm text-muted-foreground'>
                Keep SignalShare open on the other device.
              </p>
            </>
          )}
          <Link
            href='/'
            className='pressable mt-6 inline-flex h-10 items-center rounded-full bg-surface-2 px-5 text-sm font-medium'
          >
            Go to SignalShare
          </Link>
        </Glass>
      </div>
    </AppShell>
  )
}
