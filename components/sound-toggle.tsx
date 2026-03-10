'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getSoundEnabled, setSoundEnabled } from '@/lib/sounds';

export function SoundToggle() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setEnabled(getSoundEnabled());
  }, []);

  if (!mounted) return <div className="w-8 h-8" />;

  const toggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    setSoundEnabled(newValue);
  };

  return (
    <motion.button
      onClick={toggle}
      className="cursor-pointer relative flex h-8 w-8 items-center justify-center rounded-full border border-border/40 bg-background/40 backdrop-blur-md text-muted-foreground hover:text-primary transition-colors"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label={enabled ? 'Mute sounds' : 'Unmute sounds'}
    >
      <motion.svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ opacity: 1 }}
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        {enabled ? (
          <>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </>
        ) : (
          <line x1="23" y1="9" x2="17" y2="15" />
        )}
      </motion.svg>

      {/* Mute slash line */}
      {!enabled && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="w-[70%] h-[1.5px] bg-destructive rotate-45 rounded-full" />
        </motion.div>
      )}
    </motion.button>
  );
}
