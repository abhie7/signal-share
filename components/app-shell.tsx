"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Toaster } from "sonner"
import { MotionConfig } from "framer-motion"
import { useTheme } from "next-themes"
import { boot } from "@/lib/controller"
import { useConnection } from "@/lib/store"
import { useClientValue } from "@/lib/use-client-value"
import { ThemeToggle } from "@/components/theme-toggle"
import { SoundToggle } from "@/components/sound-toggle"
import { InvitePrompt } from "@/components/invite-prompt"
import { Shortcuts, command } from "@/components/shortcuts"
import { Ambient, Avatar, LogoTile } from "@/components/brand"
import { MorphicNavbar } from "@/components/kokonutui/morphic-navbar"
import { GitHubLink, GitHubStars } from "@/components/github-link"
import { cn } from "@/lib/utils"

const STATUS = {
  online: { label: "Online", dot: "bg-mint" },
  connecting: { label: "Connecting…", dot: "bg-amber" },
  offline: { label: "Offline : reconnecting", dot: "bg-coral" },
  outdated: { label: "Update available : reload", dot: "bg-amber" },
} as const

const NAV = {
  "/": { name: "Share" },
  "/history": { name: "History" },
  "/docs": { name: "How it works" },
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => boot(), [])
  const status = useConnection((s) => s.status)
  const name = useConnection((s) => s.name)
  const { resolvedTheme } = useTheme()
  const insecure = useClientValue(() => !window.isSecureContext, false)
  const st = STATUS[status]

  return (
    <div className='relative flex min-h-dvh flex-col'>
      <Ambient />

      <header className='sticky top-0 z-40'>
        {/* Scroll edge: content fades under the bar instead of meeting a hard line. */}
        <div
          className='pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background via-background/70 to-transparent'
          aria-hidden
        />
        <div className='relative mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6'>
          <Link
            href='/'
            className='pressable flex items-center gap-2.5 rounded-xl py-1 pr-2 font-semibold tracking-tight'
          >
            <LogoTile />
            <span className='text-[15px]'>SignalShare</span>
          </Link>
          {/* defaultPath="": pages outside the nav (changelog, privacy) highlight nothing */}
          <MorphicNavbar
            items={NAV}
            defaultPath=''
            compact
            className='absolute left-1/2 hidden -translate-x-1/2 px-0 sm:flex'
          />
          <div className='flex items-center gap-0.5'>
            <GitHubStars className='mr-1 hidden lg:inline-flex' />
            <div
              className='mr-1 flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-2.5 text-xs text-muted-foreground backdrop-blur-md sm:pr-3'
              role='status'
              aria-live='polite'
              title={name ? `This device appears as “${name}”` : undefined}
            >
              {status === "online" && name ? (
                <Avatar name={name} className='size-6' />
              ) : (
                <span className='size-6' />
              )}
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  st.dot,
                  status === "connecting" && "animate-pulse",
                )}
                aria-hidden
              />
              <span className='hidden max-w-[9rem] truncate lg:inline'>
                {status === "online" && name ? name : st.label}
              </span>
              <span className='sr-only lg:hidden'>{st.label}</span>
            </div>
            <SoundToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <MorphicNavbar
        items={NAV}
        defaultPath=''
        className='fixed inset-x-0 bottom-3 z-40 sm:hidden'
      />

      {insecure && (
        <div
          role='alert'
          className='relative z-10 mx-auto mt-3 max-w-3xl rounded-2xl border border-amber/40 bg-amber/15 px-4 py-2.5 text-center text-sm backdrop-blur'
        >
          <strong className='font-semibold'>Not a secure connection.</strong>{" "}
          Encryption and screen capture need HTTPS. Open SignalShare over{" "}
          <code className='font-mono'>https://</code> or on{" "}
          <code className='font-mono'>localhost</code>.
        </div>
      )}
      {status === "outdated" && (
        <div
          role='alert'
          className='relative z-10 mx-auto mt-3 rounded-2xl border border-amber/40 bg-amber/15 px-4 py-2.5 text-center text-sm backdrop-blur'
        >
          SignalShare was updated.{" "}
          <button
            className='font-semibold text-primary underline-offset-2 hover:underline'
            onClick={() => location.reload()}
          >
            Reload to continue
          </button>
        </div>
      )}

      <main className='relative z-10 flex flex-1 flex-col'>
        <MotionConfig reducedMotion='user'>{children}</MotionConfig>
      </main>

      <footer className='relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 pb-20 pt-6 text-xs text-muted-foreground sm:px-6 sm:pb-6'>
        <span>No accounts. Nothing stored on the server.</span>
        <span className='flex flex-wrap gap-x-4 gap-y-2'>
          <GitHubLink />
          <button
            type='button'
            onClick={() => command("keys")}
            className='hidden hover:text-foreground sm:inline'
          >
            Shortcuts
          </button>
          <Link href='/privacy' className='hover:text-foreground'>
            Privacy
          </Link>
          <Link href='/change-logs' className='hover:text-foreground'>
            Changelog
          </Link>
        </span>
      </footer>

      <InvitePrompt />
      <Shortcuts />
      <Toaster
        position='bottom-center'
        theme={(resolvedTheme as "light" | "dark") ?? "dark"}
        toastOptions={{
          className:
            "font-sans !rounded-2xl !backdrop-blur-xl !bg-[var(--glass-a)] !border-[var(--border)]",
        }}
      />
    </div>
  )
}
