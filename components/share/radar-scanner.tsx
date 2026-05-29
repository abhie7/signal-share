'use client';
 
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useRef, useState, useEffect } from 'react';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { usePeersStore } from '@/lib/stores/peers-store';
import { processDataTransfer } from '@/lib/utils/zip';
 
interface RadarScannerProps {
  onFilesSelected: (files: File[]) => void;
}
 
export function RadarScanner({ onFilesSelected }: RadarScannerProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const radarRef = useRef<HTMLDivElement>(null);
  const [radarWidth, setRadarWidth] = useState(550);
  const peers = usePeersStore((s) => s.nearbyPeers);
  const status = useTransferStore((s) => s.status);

  useEffect(() => {
    if (!radarRef.current) return;
    setRadarWidth(radarRef.current.offsetWidth || 550);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width) {
          setRadarWidth(width);
        }
      }
    });

    observer.observe(radarRef.current);
    return () => observer.disconnect();
  }, []);
 
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
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      try {
        const files = await processDataTransfer(e.dataTransfer, {
          slowThresholdMs: 400,
          onSlowProcessingChange: setIsProcessing,
        });
        if (files.length > 0) {
          onFilesSelected(files);
        }
      } catch (err) {
        console.error('Error processing dropped items', err);
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
    <div className="relative flex items-center justify-center w-full h-full min-h-[350px] sm:min-h-[450px] lg:min-h-[550px]">
      <input
        type="file"
        multiple
        className="hidden"
        ref={inputRef}
        onChange={handleFileInput}
      />
 
      <motion.div
        ref={radarRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => isIdle && inputRef.current?.click()}
        className={`relative flex items-center justify-center w-full max-w-[550px] aspect-square rounded-full cursor-pointer transition-all duration-500 ${isDragOver ? 'scale-105' : ''
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
          <div className="w-full h-px bg-primary/10" />
          <div className="absolute h-full w-px bg-primary/10" />
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
 
        {/* Center Glow with pulsing ring */}
        <div className={`absolute w-32 h-32 rounded-full bg-primary/10 blur-2xl transition-all duration-500 ${isDragOver ? 'scale-150 bg-primary/30' : ''}`} />
        <motion.div
          className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full border border-primary/10"
          animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        />
 
        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 pointer-events-none p-6">
          <AnimatePresence mode="wait">
            {isDragOver ? (
              <motion.div
                key="drag"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center"
              >
                <span className="text-primary font-bold tracking-widest uppercase text-base sm:text-lg drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]">
                  Release to transmit
                </span>
              </motion.div>
            ) : isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin mb-2" />
                <span className="text-primary font-bold tracking-widest uppercase text-xs sm:text-sm drop-shadow-[0_0_8px_rgba(var(--primary),0.8)]">
                  Zipping contents...
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
                <span className="text-foreground/90 font-bold tracking-widest uppercase text-xs sm:text-sm lg:text-base px-4">
                  Drop files/folders here to initiate transmission
                </span>
                <span className="text-muted-foreground text-[10px] sm:text-xs font-mono uppercase tracking-wider px-2">
                  Click to select files (you can drag n drop folders)
                </span>
                <span className="text-muted-foreground/80 text-[8px] sm:text-[10px] font-mono uppercase tracking-wider px-2 hidden xs:inline-block">
                  Tip: Copy files and press Ctrl+V anywhere on this page
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
 
        {/* Nearby Devices Dots */}
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {peers.map((peer, index) => {
              const angle = (index * 137.5) % 360; // Golden angle for distribution
              const minRadius = Math.max(50, radarWidth * 0.18 + 25);
              const maxRadius = Math.max(100, radarWidth * 0.43);
   
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
                  className="absolute left-1/2 top-1/2 -ml-[5px] -mt-[5px] sm:-ml-[6px] sm:-mt-[6px] w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)] pointer-events-auto"
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
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] sm:text-[10px] font-mono text-primary/80 uppercase tracking-wider bg-background/60 px-1 py-0.5 rounded backdrop-blur-xs">
                    {peer.name}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
