'use client';

import { useAppStore } from '@/lib/stores/app-store';
import { useWebSocket } from '@/hooks/use-websocket';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon, Rocket01Icon, Time02Icon, Calendar01Icon, LinerIcon } from '@hugeicons/core-free-icons';
import { ThemeToggle } from '@/components/theme-toggle';
import { SoundToggle } from '@/components/sound-toggle';
import { DeviceAvatar } from '@/components/share/device-avatar';
import { GlobalDropZone } from '@/components/share/global-drop-zone';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import GitHubButton from 'react-github-btn'
import { useState } from 'react';

const HamburgerIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="transition-transform duration-300"
  >
    <path
      d={isOpen ? "M4 16L16 4" : "M3 6h14"}
      className="transition-all duration-300"
    />
    <path
      d="M3 10h14"
      className="transition-all duration-300"
      style={{ opacity: isOpen ? 0 : 1 }}
    />
    <path
      d={isOpen ? "M4 4l12 12" : "M3 14h14"}
      className="transition-all duration-300"
    />
  </svg>
);

export function AppShell({ children }: { children: React.ReactNode }) {
  useWebSocket();

  const deviceName = useAppStore((s) => s.deviceName);
  const isConnected = useAppStore((s) => s.isConnected);
  const { resolvedTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <TooltipProvider>
      <div className="relative min-h-screen bg-background overflow-hidden text-foreground selection:bg-primary/30">
        {/* Background Mesh Gradient and Grid */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background">
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]"></div>

          {/* Mesh gradients */}
          <div className="absolute -top-[40%] -left-[10%] w-[70%] h-[70%] rounded-full bg-primary/5 blur-[120px] mix-blend-screen" />
          <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-teal-500/5 blur-[120px] mix-blend-screen" />
          <div className="absolute -bottom-[30%] left-[20%] w-[80%] h-[80%] rounded-full bg-purple-500/5 blur-[120px] mix-blend-screen" />
        </div>

        {/* Header */}
        <motion.header
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="fixed z-50 bg-background/40 backdrop-blur-md px-6 py-2.5 top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] rounded-full border border-border/40 lg:top-0 lg:left-0 lg:translate-x-0 lg:w-full lg:max-w-none lg:rounded-none lg:border-0 lg:border-b lg:border-border/20 lg:px-8 lg:py-3"
        >
          <div className="mx-auto flex w-full items-center justify-between">
            <Link href="/" className="flex items-center gap-3" onClick={() => setMobileMenuOpen(false)}>
              <motion.div
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary font-bold text-xs shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(var(--primary),0.4)" }}
              >
                <HugeiconsIcon icon={Rocket01Icon} className="w-4 h-4" />
              </motion.div>
              <span className="text-sm font-bold tracking-widest uppercase text-foreground/90">SignalShare</span>
            </Link>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-4 mr-2">
                <Link href="/history" className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                  <span>History</span>
                </Link>
                <HugeiconsIcon icon={LinerIcon} className="w-4 h-4 text-muted-foreground" />
                <Link href="/docs" className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">Docs</Link>
                <HugeiconsIcon icon={LinerIcon} className="w-4 h-4 text-muted-foreground" />
                <GitHubButton href="https://github.com/abhie7/signal-share" data-color-scheme="no-preference: dark; light: light; dark: dark;" data-icon="octicon-star" data-show-count="true" aria-label="Star abhie7/signal-share on GitHub">Star</GitHubButton>
                <HugeiconsIcon icon={LinerIcon} className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-1.5">
                <SoundToggle />
                <ThemeToggle />
              </div>

              {/* Hamburger Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex sm:hidden h-9 w-9 items-center justify-center rounded-full border border-border/40 bg-background/40 backdrop-blur-md text-foreground transition-all hover:bg-background/80 focus:outline-none z-50 pointer-events-auto"
                aria-label="Toggle menu"
              >
                <HamburgerIcon isOpen={mobileMenuOpen} />
              </button>

              <div className="hidden sm:flex items-center gap-3 rounded-full border border-border/40 bg-background/40 px-4 py-1.5 backdrop-blur-md">
                {deviceName && (
                  <div className="flex items-center gap-2">
                    <DeviceAvatar name={deviceName} size="sm" />
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      {deviceName}
                    </span>
                  </div>
                )}
                <div className="relative flex h-2 w-2 items-center justify-center">
                  {isConnected && (
                    <motion.div
                      className="absolute h-full w-full rounded-full bg-emerald-500/40"
                      animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    />
                  )}
                  <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500'}`} />
                </div>
              </div>
            </div>
          </div>
        </motion.header>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl flex flex-col justify-between p-8 pt-28 sm:hidden pointer-events-auto"
            >
              <div className="flex flex-col gap-6">
                <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground border-b border-border/10 pb-2">Menu</p>

                <Link
                  href="/history"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-mono uppercase tracking-widest text-foreground/90 hover:text-primary transition-colors flex items-center gap-3.5 py-1"
                >
                  <HugeiconsIcon icon={Time02Icon} className="w-5 h-5 text-primary/80" />
                  <span>History</span>
                </Link>

                <Link
                  href="/docs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-mono uppercase tracking-widest text-foreground/90 hover:text-primary transition-colors flex items-center gap-3.5 py-1"
                >
                  <HugeiconsIcon icon={Calendar01Icon} className="w-5 h-5 text-primary/80" />
                  <span>Docs</span>
                </Link>

                <Link
                  href="/change-logs"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-mono uppercase tracking-widest text-foreground/90 hover:text-primary transition-colors flex items-center gap-3.5 py-1"
                >
                  <HugeiconsIcon icon={Time02Icon} className="w-5 h-5 text-primary/80" />
                  <span>Changelogs</span>
                </Link>

                <Link
                  href="/privacy"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-base font-mono uppercase tracking-widest text-foreground/90 hover:text-primary transition-colors flex items-center gap-3.5 py-1"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary/80 fill-none stroke-current stroke-2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>Privacy Policy</span>
                </Link>
              </div>

              <div className="flex flex-col gap-6 border-t border-border/10 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">GitHub Project</span>
                  <GitHubButton href="https://github.com/abhie7/signal-share" data-color-scheme="no-preference: dark; light: light; dark: dark;" data-icon="octicon-star" data-show-count="true" aria-label="Star abhie7/signal-share on GitHub">Star</GitHubButton>
                </div>

                {deviceName && (
                  <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/40 p-4">
                    <div className="flex items-center gap-3">
                      <DeviceAvatar name={deviceName} size="sm" />
                      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        {deviceName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">{isConnected ? 'Online' : 'Offline'}</span>
                      <div className="relative flex h-2 w-2 items-center justify-center">
                        {isConnected && (
                          <motion.div
                            className="absolute h-full w-full rounded-full bg-emerald-500/40"
                            animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
                            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                          />
                        )}
                        <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-red-500'}`} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="relative z-10 flex min-h-screen flex-col w-full">
          {children}
        </main>

        <GlobalDropZone />
        <Toaster position="bottom-right" theme={(resolvedTheme as 'dark' | 'light') || 'dark'} />
      </div>
    </TooltipProvider>
  );
}
