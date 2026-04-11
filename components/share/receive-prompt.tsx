'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { DeviceAvatar } from './device-avatar';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, Copy01Icon } from '@hugeicons/core-free-icons';

interface ReceivePromptProps {
  onAccept: (sessionId: string, senderId: string) => void;
  onDecline: (sessionId: string) => void;
  onDismissText: () => void;
}

export function ReceivePrompt({ onAccept, onDecline, onDismissText }: ReceivePromptProps) {
  const incomingTransfer = useTransferStore((s) => s.incomingTransfer);
  const [copied, setCopied] = useState(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyText = async () => {
    if (!incomingTransfer?.textContent) {
      return;
    }

    try {
      await navigator.clipboard.writeText(incomingTransfer.textContent);
      setCopied(true);

      if (copyResetTimeoutRef.current) {
        clearTimeout(copyResetTimeoutRef.current);
      }

      copyResetTimeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error('Failed to copy incoming text:', error);
    }
  };

  return (
    <AnimatePresence>
      {incomingTransfer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="w-full max-w-sm"
          >
            <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-background/80 backdrop-blur-xl shadow-[0_0_50px_rgba(var(--primary),0.15)]">
              {/* Ambient glow */}
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/20 blur-3xl" />

              <div className="relative p-6 flex flex-col items-center text-center gap-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1 }}
                  className="relative"
                >
                  <div className="absolute inset-0 rounded-full border border-primary/50 animate-ping" />
                  <DeviceAvatar name={incomingTransfer.senderName} size="lg" active showTooltip={false} />
                </motion.div>

                <div className="space-y-1">
                  <h2 className="text-lg font-bold tracking-widest uppercase text-foreground/90">Incoming Signal</h2>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    From <span className="text-primary">{incomingTransfer.senderName}</span>
                  </p>
                </div>

                {incomingTransfer.transferType === 'text' ? (
                  <div className="w-full rounded-xl border border-border/20 bg-card/30 p-3 space-y-3">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Encrypted message</p>
                    <p className="max-h-52 overflow-auto rounded-lg border border-primary/20 bg-background/60 p-3 text-sm leading-relaxed text-foreground/90 wrap-break-word">
                      {incomingTransfer.textContent || ''}
                    </p>
                  </div>
                ) : (
                  <div className="w-full rounded-xl border border-border/20 bg-card/30 p-3 space-y-2">
                    {incomingTransfer.files.map((file, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        className="flex items-center justify-between text-xs font-mono"
                      >
                        <span className="truncate text-foreground/80 pr-2">{file.name}</span>
                        <span className="text-primary/80 shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </motion.div>
                    ))}

                    <div className="pt-2 mt-2 border-t border-border/20 text-[10px] font-mono text-muted-foreground uppercase tracking-widest flex justify-between">
                      <span>{incomingTransfer.files.length} FILE{incomingTransfer.files.length !== 1 ? 'S' : ''}</span>
                      <span>{formatBytes(incomingTransfer.totalSize)} TOTAL</span>
                    </div>
                  </div>
                )}

                <div className="flex w-full gap-3 mt-2">
                  {incomingTransfer.transferType === 'text' ? (
                    <>
                      <Button
                        variant="outline"
                        className={`flex-1 font-mono uppercase tracking-widest text-xs transition-colors ${copied ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'border-border/40 text-muted-foreground hover:bg-muted/20'}`}
                        onClick={handleCopyText}
                      >
                        <AnimatePresence mode="wait">
                          {copied ? (
                            <motion.span
                              key="copied"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="inline-flex items-center gap-1.5"
                            >
                              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4" />
                              Copied
                            </motion.span>
                          ) : (
                            <motion.span
                              key="copy"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="inline-flex items-center gap-1.5"
                            >
                              <HugeiconsIcon icon={Copy01Icon} className="w-4 h-4" />
                              Copy
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </Button>
                      <Button
                        className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest text-xs shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                        onClick={onDismissText}
                      >
                        Dismiss
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 font-mono uppercase tracking-widest text-xs"
                        onClick={() => {
                          onDecline(incomingTransfer.sessionId);
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest text-xs shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                        onClick={() => {
                          onAccept(incomingTransfer.sessionId, incomingTransfer.senderId);
                        }}
                      >
                        Accept
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
