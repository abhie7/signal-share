'use client';

import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { ComputerScreenShareFreeIcons, Link04Icon } from '@hugeicons/core-free-icons';

interface ScreenSharePanelProps {
  onShareSelf: () => void;
  onRequestRemote: () => void;
}

export function ScreenSharePanel({ onShareSelf, onRequestRemote }: ScreenSharePanelProps) {
  return (
    <div className="w-full rounded-3xl border border-primary/20 bg-card/20 p-6 sm:p-8 backdrop-blur-md shadow-[0_0_32px_rgba(var(--primary),0.12)]">
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-xl sm:text-2xl font-bold uppercase tracking-widest text-foreground/90">Screen Share</p>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Start your screen or request the other device to share.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={onShareSelf}
            className="group relative flex flex-col items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-6 text-center transition-all hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_20px_rgba(var(--primary),0.15)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/20 group-hover:scale-110 transition-transform">
              <HugeiconsIcon icon={ComputerScreenShareFreeIcons} className="w-6 h-6" />
            </div>
            <span className="font-bold uppercase tracking-widest text-xs text-foreground/90">Share My Screen</span>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Broadcast your display to a connected peer
            </span>
          </button>

          <button
            onClick={onRequestRemote}
            className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border/20 bg-card/10 p-6 text-center transition-all hover:border-primary/30 hover:bg-primary/5 hover:shadow-[0_0_20px_rgba(var(--primary),0.1)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/30 text-muted-foreground border border-border/20 group-hover:text-primary group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:scale-110 transition-all">
              <HugeiconsIcon icon={Link04Icon} className="w-6 h-6" />
            </div>
            <span className="font-bold uppercase tracking-widest text-xs text-foreground/90">Request Their Screen</span>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Ask the remote peer to share their display
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
