"use client"

import { useClientValue } from "@/lib/use-client-value"
import { useTheme } from "next-themes"
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useClientValue(() => true, false)
  const dark = mounted && resolvedTheme === "dark"

  return (
    <button
      type='button'
      onClick={() => setTheme(dark ? "light" : "dark")}
      className='pressable grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground'
      aria-label={
        dark ? "Switch to light appearance" : "Switch to dark appearance"
      }
    >
      {mounted ? (
        <Icon icon={dark ? Sun03Icon : Moon02Icon} className='size-[18px]' />
      ) : (
        <span className='size-[18px]' />
      )}
    </button>
  )
}
