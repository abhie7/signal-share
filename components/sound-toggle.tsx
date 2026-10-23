"use client"

import { useState } from "react"
import { useClientValue } from "@/lib/use-client-value"
import { VolumeHighIcon, VolumeOffIcon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { getSoundEnabled, setSoundEnabled } from "@/lib/sounds"

export function SoundToggle() {
  const stored = useClientValue(getSoundEnabled, null)
  const [override, setEnabled] = useState<boolean | null>(null)
  const enabled = override ?? stored

  return (
    <button
      type='button'
      onClick={() => {
        const next = !enabled
        setEnabled(next)
        setSoundEnabled(next)
      }}
      className='pressable grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground'
      aria-label={enabled ? "Mute sounds" : "Unmute sounds"}
      aria-pressed={enabled === false}
    >
      {enabled === null ? (
        <span className='size-[18px]' />
      ) : (
        <Icon
          icon={enabled ? VolumeHighIcon : VolumeOffIcon}
          className='size-[18px]'
        />
      )}
    </button>
  )
}
