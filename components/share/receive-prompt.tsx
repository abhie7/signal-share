'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { DeviceAvatar } from './device-avatar';

interface ReceivePromptProps {
  onAccept: (sessionId: string, senderId: string) => void;
  onDecline: (sessionId: string) => void;
}

export function ReceivePrompt({ onAccept, onDecline }: ReceivePromptProps) {
  const incomingTransfer = useTransferStore((s) => s.incomingTransfer);

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

                <div className="flex w-full gap-3 mt-2">
                  <Button
                    variant="outline"
                    className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 font-mono uppercase tracking-widest text-xs"
                    onClick={() => onDecline(incomingTransfer.sessionId)}
                  >
                    Reject
                  </Button>
                  <Button
                    className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest text-xs shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                    onClick={() => onAccept(incomingTransfer.sessionId, incomingTransfer.senderId)}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
