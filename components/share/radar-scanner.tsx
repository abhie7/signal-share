'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { useTransfer } from '@/hooks/use-transfer';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { usePeersStore } from '@/lib/stores/peers-store';

interface RadarScannerProps {
  onFilesSelected: (files: File[]) => void;
}

export function RadarScanner({ onFilesSelected }: RadarScannerProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const peers = usePeersStore((s) => s.nearbyPeers);
  const status = useTransferStore((s) => s.status);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      e.target.value = '';
    },
    [onFilesSelected],
  );

  const isIdle = status === 'idle';

  return (
    <div className="relative flex items-center justify-center w-full h-full min-h-[600px]">
      <input
        type="file"
        multiple
        className="hidden"
        ref={inputRef}
        onChange={handleFileInput}
      />

      {/* Radar Container */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => isIdle && inputRef.current?.click()}
        className={`relative flex items-center justify-center w-[min(550px,90vw)] h-[min(550px,90vw)] rounded-full cursor-pointer transition-all duration-500 ${
          isDragOver ? 'scale-105' : ''
        }`}
        whileHover={isIdle ? { scale: 1.02 } : {}}
        whileTap={isIdle ? { scale: 0.98 } : {}}
      >
        {/* Outer Rings */}
        <div className="absolute inset-0 rounded-full border border-primary/20 shadow-[0_0_50px_rgba(var(--primary),0.1)]" />
        <div className="absolute inset-[10%] rounded-full border border-primary/10" />
        <div className="absolute inset-[25%] rounded-full border border-primary/10" />
        <div className="absolute inset-[40%] rounded-full border border-primary/10" />

        {/* Grid Lines */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-[1px] bg-primary/10" />
          <div className="absolute h-full w-[1px] bg-primary/10" />
        </div>

        {/* Sweep Beam effect */}
        <motion.div
          className="absolute inset-0 rounded-full overflow-hidden"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: isDragOver ? 2 : 4, ease: 'linear' }}
        >
          <div
            className="absolute top-0 bottom-1/2 left-1/2 right-0 origin-bottom-left"
            style={{
              background: `conic-gradient(from 0deg at 0% 100%,
                transparent 0deg,
                rgba(var(--primary), 0.02) 40deg,
                rgba(var(--primary), 0.1) 70deg,
                rgba(var(--primary), ${isDragOver ? '0.6' : '0.4'}) 90deg,
                transparent 90.1deg)`,
              borderBottom: `2px solid rgba(var(--primary), ${isDragOver ? '1' : '0.8'})`,
              boxShadow: `0 2px ${isDragOver ? '30px' : '15px'} rgba(var(--primary), ${isDragOver ? '0.8' : '0.5'})`
            }}
          />
        </motion.div>

        {/* Center Glow */}
        <div className={`absolute w-32 h-32 rounded-full bg-primary/10 blur-2xl transition-all duration-500 ${isDragOver ? 'scale-150 bg-primary/30' : ''}`} />

        {/* Center Content */}
        <div className="absolute flex flex-col items-center justify-center text-center z-10 pointer-events-none">
          <AnimatePresence mode="wait">
            {isDragOver ? (
              <motion.div
                key="drag"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center"
              >
                <span className="text-primary font-bold tracking-widest uppercase text-lg drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]">
                  Release to transmit
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-2"
              >
                <span className="text-foreground/90 font-bold tracking-widest uppercase text-sm">
                  Drop files to initiate transmission
                </span>
                <span className="text-muted-foreground text-xs font-mono uppercase tracking-wider">
                  Scanning local network...
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nearby Devices Dots */}
        <AnimatePresence>
          {peers.map((peer, index) => {
            // Calculate random position on the radar, avoid inner circle
            const angle = (index * 137.5) % 360; // Golden angle for distribution
            const minRadius = 150; // Keep outside text
            const maxRadius = 240; // Keep inside max width (which max width is 550/2 = ~275, minus padding)

            // Generate a deterministic but seemingly random radius
            const hash = peer.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const radius = minRadius + (hash % (maxRadius - minRadius));

            const x = Math.cos((angle * Math.PI) / 180) * radius;
            const y = Math.sin((angle * Math.PI) / 180) * radius;

            return (
              <motion.div
                key={peer.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]"
                style={{
                  x,
                  y,
                }}
              >
                <motion.div
                  className="absolute inset-0 rounded-full border border-primary"
                  animate={{ scale: [1, 3], opacity: [0.8, 0] }}
                  transition={{ repeat: Infinity, duration: 2, delay: index * 0.5 }}
                />
                <div className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono text-primary/80 uppercase tracking-wider">
                  {peer.name}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
