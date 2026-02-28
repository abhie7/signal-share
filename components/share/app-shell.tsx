'use client';

import { useAppStore } from '@/lib/stores/app-store';
import { useWebSocket } from '@/hooks/use-websocket';
import { motion } from 'framer-motion';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';

export function AppShell({ children }: { children: React.ReactNode }) {
  useWebSocket();

  const deviceName = useAppStore((s) => s.deviceName);
  const isConnected = useAppStore((s) => s.isConnected);

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
          className="fixed top-0 left-0 right-0 z-50 px-6 py-6 pointer-events-none"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              <motion.div
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary font-bold text-xs shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(var(--primary),0.4)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"></path>
                </svg>
              </motion.div>
              <span className="text-sm font-bold tracking-widest uppercase text-foreground/90">SignalShare</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-4 mr-2">
                <Link href="/docs" className="text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">Docs</Link>
                <a href="https://github.com/aumu1031/p2p-share" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors">
                  <HugeiconsIcon icon={GithubIcon} className="w-4 h-4" />
                  <span>GitHub</span>
                </a>
              </div>
              <div className="flex items-center gap-3 rounded-full border border-border/40 bg-background/40 px-4 py-1.5 backdrop-blur-md">
                {deviceName && (
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    {deviceName}
                  </span>
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

        {/* Main content */}
        <main className="relative z-10 flex min-h-screen flex-col w-full">
          {children}
        </main>

        <Toaster position="bottom-right" theme="dark" />
      </div>
    </TooltipProvider>
  );
}
