'use client';

import type { ShareType } from '@/lib/stores/app-store';

const ITEMS: Array<{ type: ShareType; label: string }> = [
  { type: 'files', label: 'Files/Folders/Zips' },
  { type: 'text', label: 'Text Share' },
  { type: 'screen', label: 'Screen Share' },
  { type: 'receive', label: 'Receive/Join' },
];

interface ShareTypeNavProps {
  activeType: ShareType;
  onSelect: (type: ShareType) => void;
  className?: string;
}

export function ShareTypeNav({ activeType, onSelect, className = '' }: ShareTypeNavProps) {
  return (
    <nav className={className} aria-label="Share types">
      {ITEMS.map((item) => {
        const isActive = item.type === activeType;
        return (
          <button
            key={item.type}
            type="button"
            onClick={() => onSelect(item.type)}
            className={`rounded-2xl border px-4 py-3 text-left text-xs font-mono uppercase tracking-widest transition-all ${
              isActive
                ? 'border-primary/40 bg-primary/15 text-primary shadow-[0_0_16px_rgba(var(--primary),0.18)]'
                : 'border-border/50 bg-background/40 text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
