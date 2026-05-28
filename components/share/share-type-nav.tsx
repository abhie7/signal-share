'use client';

import type { ShareType } from '@/lib/stores/app-store';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComputerScreenShareFreeIcons, FolderUploadFreeIcons, FolderUploadIcon, Link04Icon, MessageUpload02FreeIcons } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

const ITEMS = [
  { type: 'files', label: 'Files/Folders', icon: FolderUploadFreeIcons },
  { type: 'text', label: 'Text', icon: MessageUpload02FreeIcons },
  { type: 'screen', label: 'Screen', icon: ComputerScreenShareFreeIcons },
] as const;

interface ShareTypeNavProps {
  activeType: ShareType;
  onSelect: (type: ShareType) => void;
  className?: string;
  compact?: boolean;
}

export function ShareTypeNav({ activeType, onSelect, className = '', compact = false }: ShareTypeNavProps) {
  // Check if current active state is one of the sharing options
  const isSharing = ITEMS.some((item) => item.type === activeType);

  if (compact) {
    return (
      <div className={className} aria-label="Share and receive options">
        <div className="flex items-center gap-2 rounded-xl border border-border/10 bg-background/20 p-1">
          <Select 
            value={isSharing ? activeType : 'placeholder'} 
            onValueChange={(value) => onSelect(value as ShareType)}
          >
            <SelectTrigger className="h-10 flex-1 rounded-lg border-transparent bg-background/50 px-3 text-left text-[10px] font-bold uppercase tracking-widest text-foreground/80 transition-colors hover:bg-background/80">
              <SelectValue placeholder="Select Share Type">
                {isSharing ? ITEMS.find(i => i.type === activeType)?.label : "Choose Share Type"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" className="min-w-48 bg-popover/95 backdrop-blur-md">
              <SelectItem value="placeholder" className="hidden">Choose Share Type</SelectItem>
              {ITEMS.map((item) => {
                return (
                  <SelectItem key={item.type} value={item.type} className="text-xs font-medium uppercase tracking-wider">
                    <span className="flex items-center gap-2">
                      <HugeiconsIcon icon={item.icon} className="h-3.5 w-3.5 opacity-60" />
                      {item.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={activeType === 'receive' ? 'default' : 'ghost'}
            onClick={() => onSelect('receive')}
            className={`h-10 shrink-0 rounded-lg px-3.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
              activeType === 'receive' 
                ? 'bg-primary text-primary-foreground shadow-[0_0_12px_rgba(var(--primary),0.3)]' 
                : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
            }`}
          >
            <HugeiconsIcon icon={Link04Icon} className="mr-1.5 h-3.5 w-3.5" />
            Join
          </Button>
        </div>
      </div>
    );
  }

  // Desktop / Expanded view
  return (
    <div className={`w-full max-w-sm rounded-2xl border border-border/10 bg-primary/8 p-3 backdrop-blur-md ${className}`} aria-label="Share and receive options">
      <div className="space-y-4">
        {/* SHARE TYPE SECTION */}
        <div>
          <span className="block px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
            Share Type
          </span>
          <div className="space-y-1">
            {ITEMS.map((item) => {
              const isActive = item.type === activeType;
              return (
                <Button
                  key={item.type}
                  type="button"
                  onClick={() => onSelect(item.type)}
                  className={`w-full h-11 justify-start gap-3 rounded-xl px-3 text-left transition-all duration-200 border ${
                    isActive
                      ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_16px_rgba(var(--primary),0.08)]'
                      : 'border-transparent bg-transparent text-foreground/70 hover:bg-white/5 hover:text-foreground'
                  }`}
                >
                  <HugeiconsIcon icon={item.icon} className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'opacity-50'}`} />
                  <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
                  
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-border/10" />

        {/* JOIN SESSION SECTION */}
        <div>
          <span className="block px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
            Connect
          </span>
          <Button
            type="button"
            onClick={() => onSelect('receive')}
            className={`w-full justify-start gap-3 rounded-xl border p-3 h-auto text-left transition-all duration-200 ${
              activeType === 'receive'
                ? 'border-primary bg-primary/10 text-primary shadow-[0_0_16px_rgba(var(--primary),0.08)]'
                : 'border-border/30 bg-background/30 text-foreground hover:bg-white/5'
            }`}
          >
            <div className={`p-2 rounded-lg ${activeType === 'receive' ? 'bg-primary/20' : 'bg-muted/40'}`}>
              {/* Swapped out broken Link2 for Link04Icon */}
              <HugeiconsIcon icon={Link04Icon} className="h-4 w-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider">Receive/Join Session</span>
              <span className="text-[11px] text-muted-foreground font-normal normal-case">Use a code or link</span>
            </div>
            {activeType === 'receive' && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}