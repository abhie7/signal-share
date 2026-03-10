'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { Copy01Icon as CopyIcon, CheckmarkCircle02Icon as CheckIcon } from '@hugeicons/core-free-icons';

interface ShareLinkProps {
  link: string;
}

export function ShareLink({ link }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [link]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex flex-col items-center gap-4 w-full"
    >
      <div className="relative flex flex-col gap-3 w-full rounded-2xl border border-primary/20 bg-card/40 p-3 sm:p-4 backdrop-blur-xl shadow-[0_0_20px_rgba(var(--primary),0.1)] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex flex-col gap-1.5 overflow-hidden">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70">Share Link</span>
          <span className="wrap-break-word text-[11px] sm:text-xs text-primary/90 font-mono tracking-tight leading-relaxed bg-primary/5 p-3 rounded-lg border border-primary/10">
            {link}
          </span>
        </div>

        <Button
          onClick={copyLink}
          className={`
            w-full flex items-center justify-center gap-2 font-mono text-[10px] sm:text-xs text-center uppercase tracking-widest min-h-11 h-auto px-3 py-2 transition-all duration-300
            ${copied
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
              : 'bg-primary/20 text-primary border-primary/30 hover:bg-primary/30'
            }
            border
          `}
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.div
                key="check"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="flex items-center gap-2"
              >
                <HugeiconsIcon icon={CheckIcon} className="w-4 h-4" />
                <span>LINK COPIED</span>
              </motion.div>
            ) : (
              <motion.div
                key="copy"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                className="flex items-center gap-2"
              >
                <HugeiconsIcon icon={CopyIcon} className="w-4 h-4" />
                <span>COPY LINK TO CLIPBOARD</span>
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </motion.div>
  );
}
