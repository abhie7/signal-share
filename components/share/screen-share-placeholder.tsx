'use client';

import { Button } from '@/components/ui/button';

interface ScreenSharePanelProps {
  onShareSelf: () => void;
  onRequestRemote: () => void;
}

export function ScreenSharePanel({ onShareSelf, onRequestRemote }: ScreenSharePanelProps) {
  return (
    <div className="w-full rounded-3xl border border-primary/20 bg-card/20 p-6 sm:p-8 backdrop-blur-md shadow-[0_0_32px_rgba(var(--primary),0.12)]">
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-xl font-bold uppercase tracking-widest text-foreground/90">Screen Share</p>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Start your screen or request the other device to share.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={onShareSelf} className="font-mono uppercase tracking-widest text-xs">
            Share My Screen
          </Button>
          <Button onClick={onRequestRemote} variant="outline" className="font-mono uppercase tracking-widest text-xs">
            Request Their Screen
          </Button>
        </div>
      </div>
    </div>
  );
}
