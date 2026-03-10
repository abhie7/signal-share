'use client';

import { motion } from 'framer-motion';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { formatBytes, formatSpeed, formatETA, downloadBlob } from '@/lib/webrtc/file-chunker';
import { useTransfer } from '@/hooks/use-transfer';
import { useEffect, useState } from 'react';

export function TransferProgress() {
  const { forceRelay } = useTransfer();
  const progress = useTransferStore((s: any) => s.progress);
  const status = useTransferStore((s: any) => s.status);
  const fileInfos = useTransferStore((s: any) => s.fileInfos);
  const role = useTransferStore((s: any) => s.role);
  const receivedFiles = useTransferStore((s: any) => s.receivedFiles);
  const [showRelayOption, setShowRelayOption] = useState(false);

  const percentage =
    progress.totalBytes > 0
      ? Math.min((progress.bytesTransferred / progress.totalBytes) * 100, 100)
      : 0;

  // Show relay option after 8 seconds of connecting
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (status === 'connecting') {
      timer = setTimeout(() => setShowRelayOption(true), 8000);
    } else {
      setShowRelayOption(false);
    }
    return () => clearTimeout(timer);
  }, [status]);

  const radius = 180;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-12">
      {/* Circular Progress Ring */}
      <div className="relative flex items-center justify-center w-[400px] h-[400px]">
        {/* Background Ring */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 400 400">
          <circle
            cx="200"
            cy="200"
            r={radius}
            fill="none"
            stroke="rgba(var(--primary), 0.1)"
            strokeWidth="4"
          />
          {/* Progress Ring */}
          <motion.circle
            cx="200"
            cy="200"
            r={radius}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ filter: 'drop-shadow(0 0 10px rgba(var(--primary), 0.5))' }}
          />
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="oklch(0.6 0.15 250)" /> {/* Blue */}
              <stop offset="100%" stopColor="oklch(0.8 0.15 150)" /> {/* Lime */}
            </linearGradient>
          </defs>
        </svg>

        {/* Center Content */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <motion.span
            className="text-6xl font-bold tracking-tighter text-foreground drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            {Math.round(percentage)}%
          </motion.span>
          <span className="text-sm font-mono text-primary/80 uppercase tracking-widest mt-2">
            {status === 'complete' ? 'TRANSMISSION COMPLETE' : 'TRANSMITTING'}
          </span>

          {status === 'complete' && (
            <motion.div
              className="absolute inset-0 rounded-full bg-emerald-500/20"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          )}

          {showRelayOption && (
            <motion.button
              onClick={forceRelay}
              className="mt-6 px-4 py-2 rounded-full bg-primary/20 hover:bg-primary/30 text-[10px] font-bold text-primary border border-primary/30 backdrop-blur-sm transition-colors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              CONNECTION SLOW? TRY RELAY MODE
            </motion.button>
          )}
        </div>
      </div>

      {/* File List Stack */}
      <motion.div
        className="w-full max-w-md space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
          }
        }}
      >
        {fileInfos.map((file: any, index: number) => {
          const isCurrent = index === progress.fileIndex;
          const isPast = index < progress.fileIndex;
          const isComplete = status === 'complete' || isPast;

          let fileProgress = 0;
          if (isComplete) fileProgress = 100;
          else if (isCurrent) {
            // Estimate current file progress
            const previousFilesBytes = fileInfos.slice(0, index).reduce((acc: any, f: any) => acc + f.size, 0);
            const currentFileBytesTransferred = Math.max(0, progress.bytesTransferred - previousFilesBytes);
            fileProgress = Math.min(100, (currentFileBytesTransferred / file.size) * 100);
          }

          const receivedFile = receivedFiles.find((f: any) => f.name === file.name);

          return (
            <motion.div
              key={index}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 }
              }}
              className="relative overflow-hidden rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-md"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground/90 truncate pr-4">
                  {file.name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground shrink-0">
                    {formatBytes(file.size)}
                  </span>
                  {isComplete && role === 'receiver' && receivedFile && (
                    <button
                      onClick={() => downloadBlob(receivedFile.blob, receivedFile.name)}
                      className="text-primary hover:text-primary/80 transition-colors p-1"
                      title="Download file"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider mb-2">
                <span className={isComplete ? 'text-emerald-400' : isCurrent ? 'text-primary' : 'text-muted-foreground'}>
                  {isComplete ? 'DONE' : isCurrent ? 'SENDING...' : 'QUEUED'}
                </span>
                {isCurrent && status === 'transferring' && (
                  <span className="text-primary/80">{formatSpeed(progress.speed)}</span>
                )}
              </div>

              {/* Thin Progress Bar */}
              <div className="h-1 w-full bg-background/50 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${isComplete ? 'bg-emerald-400' : 'bg-primary'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${fileProgress}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    boxShadow: isCurrent || isComplete ? `0 0 10px ${isComplete ? 'rgba(52,211,153,0.5)' : 'rgba(var(--primary),0.5)'}` : 'none'
                  }}
                />
                {isCurrent && status === 'transferring' && (
                  <motion.div
                    className="absolute top-0 bottom-0 left-0 w-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  />
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
