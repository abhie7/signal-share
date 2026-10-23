"use client"

import { useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

const SHOTS = {
  then: {
    label: "Then · 1.2.4",
    date: "May 2026",
    desktop: {
      src: "/devlog/v1-landing.jpg",
      alt: "SignalShare 1.2.4: dark grid background, all-caps monospace text, a sidebar of share types, a large spinning radar with a peer label drifting over the drop instructions, and an Active Nodes list claiming Channel Strength: High.",
    },
    phone: {
      src: "/devlog/v1-landing-mobile.jpg",
      alt: "SignalShare 1.2.4 on a phone: a Files/Folders dropdown and Join button above the same radar, with peer names overlapping the instructions.",
    },
  },
  now: {
    label: "Now · 2.4",
    date: "October 2026",
    desktop: {
      src: "/devlog/v2-landing.jpg",
      alt: "SignalShare 2.4: a contour-map background, the headline Send anything to your laptop, glass Send and Receive cards, voxel avatars orbiting, and a split navigation bar.",
    },
    phone: {
      src: "/devlog/v2-landing-mobile.jpg",
      alt: "SignalShare 2.4 on a phone: the headline, the Send card with Files, Text and Screen tabs, and a floating navigation bar at the bottom.",
    },
  },
} as const

type Era = keyof typeof SHOTS
type Device = "desktop" | "phone"

/** Before/after of the landing page, with a crossfade between the two eras. */
export function DevlogCompare() {
  const [era, setEra] = useState<Era>("then")
  const [device, setDevice] = useState<Device>("desktop")

  return (
    <figure className='not-prose'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Segmented
          label='Version'
          value={era}
          onChange={setEra}
          options={[
            ["then", SHOTS.then.label],
            ["now", SHOTS.now.label],
          ]}
        />
        <Segmented
          label='Device'
          value={device}
          onChange={setDevice}
          options={[
            ["desktop", "Desktop"],
            ["phone", "Phone"],
          ]}
        />
      </div>

      <div
        className={cn(
          "relative mx-auto mt-3 overflow-hidden rounded-2xl border border-border bg-black",
          device === "desktop"
            ? "aspect-[16/10] w-full"
            : "aspect-[390/844] w-56",
        )}
      >
        {(Object.keys(SHOTS) as Era[]).map((key) => {
          const shot = SHOTS[key][device]
          return (
            <Image
              key={`${key}-${device}`}
              src={shot.src}
              alt={shot.alt}
              fill
              sizes={
                device === "desktop"
                  ? "(min-width: 768px) 840px, 100vw"
                  : "224px"
              }
              className={cn(
                "object-cover object-top transition-opacity duration-300 motion-reduce:transition-none",
                era === key ? "opacity-100" : "opacity-0",
              )}
              aria-hidden={era !== key}
            />
          )
        })}
      </div>
      <figcaption className='mt-2 text-center text-xs'>
        The landing page, {SHOTS[era].date}. Same browser window, a second
        device connected.
      </figcaption>
    </figure>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: Array<[T, string]>
}) {
  return (
    <div
      role='radiogroup'
      aria-label={label}
      className='flex rounded-full bg-surface-2 p-1'
    >
      {options.map(([key, text]) => (
        <button
          key={key}
          type='button'
          role='radio'
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "pressable rounded-full px-3 py-1 text-xs font-medium",
            value === key
              ? "bg-popover text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
