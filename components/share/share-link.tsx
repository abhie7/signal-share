'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface ShareLinkProps {
  link: string;
}

export function ShareLink({ link }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [link]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex flex-col items-center gap-3 w-full max-w-md"
    >
      <div className="flex items-center gap-2 w-full rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 backdrop-blur-md shadow-[0_0_15px_rgba(var(--primary),0.1)]">
        <span className="flex-1 truncate text-xs text-primary/90 font-mono tracking-wider">{link}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyLink}
          className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/20 border border-primary/30"
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="text-emerald-400"
              >
                COPIED
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
              >
                COPY LINK
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </div>
    </motion.div>
  );
}
