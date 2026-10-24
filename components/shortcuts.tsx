"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { cancel } from "@/lib/controller"
import { useShare } from "@/lib/store"
import type { Phase } from "@/lib/machine"
import { useClientValue } from "@/lib/use-client-value"
import { cn } from "@/lib/utils"

/** Home acts on these (components/home.tsx): files, text, screen, receive. */
export const command = (what: string) =>
  window.dispatchEvent(new CustomEvent("ss:command", { detail: what }))

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  Boolean(t.closest("input, textarea, select, [contenteditable='true']"))
const modalOpen = () =>
  Boolean(document.querySelector("dialog[open], [aria-modal='true']"))
/** Esc only cancels before anything has moved; an accidental key never kills a transfer. */
const CANCELLABLE: Phase[] = ["creating", "waiting", "joining", "connecting"]

interface Cmd {
  id: string
  label: string
  keys?: string
  run: () => void
}

/**
 * Keyboard shortcuts and the command palette. Single keys only fire outside text fields and
 * dialogs, and nothing overrides a browser shortcut except ⌘K / Ctrl+K.
 */
export function Shortcuts() {
  const router = useRouter()
  const path = usePathname()
  const phase = useShare((s) => s.phase)
  const { resolvedTheme, setTheme } = useTheme()
  // The server can't know the theme: render the neutral label until hydrated.
  const mounted = useClientValue(() => true, false)
  const dark = mounted && resolvedTheme === "dark"
  const mod = useClientValue(
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"),
    "⌘",
  )
  const palette = useRef<HTMLDialogElement>(null)
  const help = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const home = path === "/" && phase === "idle"

  const commands: Cmd[] = [
    ...(home
      ? [
          { id: "files", label: "Send files", run: () => command("files") },
          { id: "text", label: "Send text", run: () => command("text") },
          {
            id: "screen",
            label: "Share your screen",
            keys: "S",
            run: () => command("screen"),
          },
          {
            id: "receive",
            label: "Receive with a code",
            keys: "R",
            run: () => command("receive"),
          },
        ]
      : path !== "/"
        ? [{ id: "home", label: "Go to Share", run: () => router.push("/") }]
        : []),
    { id: "history", label: "History", run: () => router.push("/history") },
    { id: "docs", label: "How it works", run: () => router.push("/docs") },
    {
      id: "changelog",
      label: "Changelog",
      run: () => router.push("/change-logs"),
    },
    {
      id: "theme",
      label: dark ? "Switch to light appearance" : "Switch to dark appearance",
      run: () => setTheme(dark ? "light" : "dark"),
    },
    {
      id: "keys",
      label: "Keyboard shortcuts",
      keys: "?",
      run: () => command("keys"),
    },
  ]
  const q = query.trim().toLowerCase()
  const shown = commands.filter((c) => c.label.toLowerCase().includes(q))
  const current = Math.min(active, Math.max(0, shown.length - 1))

  const run = (c: Cmd) => {
    palette.current?.close()
    c.run() // still inside the click or key press, so screen capture is allowed
  }

  // Latest state for the window listener, without re-binding it on every render.
  const latest = useRef({ home, phase })
  useEffect(() => {
    latest.current = { home, phase }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault()
        const d = palette.current
        if (!d) return
        if (d.open) return d.close()
        help.current?.close()
        setQuery("")
        setActive(0)
        d.showModal()
        return
      }
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.defaultPrevented ||
        typing(e.target) ||
        modalOpen()
      )
        return
      const { home, phase } = latest.current
      if (e.key === "?") {
        e.preventDefault()
        help.current?.showModal()
      } else if (e.key === "Escape" && CANCELLABLE.includes(phase)) cancel()
      else if (home && e.key.toLowerCase() === "r") {
        e.preventDefault()
        command("receive")
      } else if (home && e.key.toLowerCase() === "s") command("screen")
    }
    const onCommand = (e: Event) =>
      (e as CustomEvent<string>).detail === "keys" && help.current?.showModal()
    window.addEventListener("keydown", onKey)
    window.addEventListener("ss:command", onCommand)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("ss:command", onCommand)
    }
  }, [])

  const dialog =
    "liquid m-auto mt-[12vh] w-[min(32rem,calc(100vw-2rem))] p-0 text-foreground backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"

  return (
    <>
      <dialog
        ref={palette}
        aria-label='Command palette'
        className={dialog}
        onClick={(e) => e.target === palette.current && palette.current.close()}
      >
        <div className='flex items-center gap-2 border-b border-border px-4'>
          <Icon icon={Search01Icon} className='size-4 text-muted-foreground' />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault()
                const step = e.key === "ArrowDown" ? 1 : -1
                setActive((current + step + shown.length) % shown.length)
              } else if (e.key === "Enter" && shown[current]) {
                e.preventDefault()
                run(shown[current])
              }
            }}
            placeholder='What do you want to do?'
            aria-label='Search commands'
            aria-controls='palette-list'
            aria-activedescendant={
              shown[current] ? `cmd-${shown[current].id}` : undefined
            }
            role='combobox'
            aria-expanded
            className='h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70'
          />
        </div>
        <ul
          id='palette-list'
          role='listbox'
          className='max-h-80 overflow-auto p-2'
        >
          {shown.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role='option'
              aria-selected={i === current}
              onClick={() => run(c)}
              onMouseMove={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm",
                i === current && "bg-surface-2",
              )}
            >
              {c.label}
              {c.keys && <Kbd>{c.keys}</Kbd>}
            </li>
          ))}
          {!shown.length && (
            <li className='px-3 py-6 text-center text-sm text-muted-foreground'>
              Nothing matches “{query}”.
            </li>
          )}
        </ul>
      </dialog>

      <dialog
        ref={help}
        aria-labelledby='keys-title'
        className={dialog}
        onClick={(e) => e.target === help.current && help.current.close()}
      >
        <div className='p-5'>
          <h2 id='keys-title' className='title'>
            Keyboard shortcuts
          </h2>
          <dl className='mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm'>
            {[
              [`${mod}K`, "Command palette"],
              [
                `${mod}V`,
                "Paste anywhere: files and text to send, a code or link to receive",
              ],
              ["R", "Receive with a code"],
              ["S", "Share your screen"],
              [`${mod}↵`, "Send the text you typed"],
              ["Esc", "Cancel a share that hasn’t started yet"],
              ["?", "This list"],
            ].map(([k, label]) => (
              <div key={k} className='contents'>
                <dt>
                  <Kbd>{k}</Kbd>
                </dt>
                <dd className='text-muted-foreground'>{label}</dd>
              </div>
            ))}
          </dl>
          <div className='mt-5 flex justify-end'>
            <button
              type='button'
              onClick={() => help.current?.close()}
              className='pressable h-9 rounded-full bg-surface-2 px-4 text-sm font-medium'
            >
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className='inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground'>
      {children}
    </kbd>
  )
}
