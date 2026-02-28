'use client';

import { motion } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon, Link01Icon as LinkIcon, Wifi01Icon as NetworkIcon, Shield01Icon as ShieldIcon, CodeIcon, FlashIcon } from '@hugeicons/core-free-icons';
import Link from 'next/link';

export function InfoSection() {
  return (
    <div className="w-full border-t border-border/10 bg-background/50 backdrop-blur-xl pt-24 pb-12 px-6 flex flex-col items-center">
      <div className="max-w-4xl w-full flex flex-col gap-24">

        {/* Features / SEO Grid */}
        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
              <HugeiconsIcon icon={NetworkIcon} className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-widest uppercase text-foreground/90">
              Peer-to-peer file transfer in your browser
            </h2>
            <p className="text-sm font-mono text-muted-foreground leading-relaxed">
              This tool uses WebRTC to establish direct device-to-device channels over local networks. When devices are remote, a temporary relay is generated. Files are not stored.
            </p>
          </div>

          <div className="space-y-4">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
              <HugeiconsIcon icon={FlashIcon} className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-widest uppercase text-foreground/90">
              Transfer files over local network instantly
            </h2>
            <p className="text-sm font-mono text-muted-foreground leading-relaxed">
              Devices on the same WiFi connect directly without uploading files to any server. No accounts required.
            </p>
          </div>

          <div className="space-y-4">
            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
              <HugeiconsIcon icon={LinkIcon} className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-widest uppercase text-foreground/90">
              Generate temporary file relay links
            </h2>
            <p className="text-sm font-mono text-muted-foreground leading-relaxed">
              When peers are remote, files are streamed through a temporary relay and auto-deleted immediately after completion.
            </p>
          </div>

          <div className="space-y-4">
            <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
              <HugeiconsIcon icon={ShieldIcon} className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold tracking-widest uppercase text-foreground/90">
              Zero storage. Zero tracking.
            </h2>
            <p className="text-sm font-mono text-muted-foreground leading-relaxed">
              No databases, no permanent storage, and no tracking. Your transfer is a direct signal transmission.
            </p>
          </div>
        </div>

        {/* Open Source & Tech Stack */}
        <div className="flex flex-col md:flex-row items-start justify-between gap-12 p-8 rounded-2xl border border-primary/20 bg-primary/5">
          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-widest uppercase text-foreground">Open Source</h2>
              <p className="text-sm font-mono text-muted-foreground leading-relaxed">
                SignalShare is fully open source. Inspect the architecture. Run it locally. Contribute.
              </p>
            </div>
            <div className="flex gap-4">
              <a href="https://github.com/abhie7/signal-share" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 transition-colors font-mono uppercase tracking-widest text-xs">
                <HugeiconsIcon icon={GithubIcon} className="w-4 h-4" />
                View Repository
              </a>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <h3 className="text-sm border-b border-border/20 pb-2 font-bold tracking-widest uppercase text-foreground/70">Built With</h3>
            <div className="flex flex-wrap gap-2">
              {['Next.js', 'Fastify', 'WebRTC', 'WebSockets', 'TailwindCSS', 'Framer Motion'].map((tech) => (
                <span key={tech} className="px-3 py-1 rounded-md bg-background/50 border border-border/50 text-xs font-mono text-muted-foreground">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-12 border-t border-border/10 flex flex-col md:flex-row items-center justify-between gap-6 text-xs font-mono text-muted-foreground uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            SignalShare © {new Date().getFullYear()}
          </div>
          <div className="flex gap-6">
            <Link href="/docs" className="hover:text-primary transition-colors">Docs</Link>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <a href="https://github.com/abhie7/signal-share/commits/main" className="hover:text-primary transition-colors">Changelog</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
