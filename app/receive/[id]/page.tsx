'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/share/app-shell';
import { TransferProgress } from '@/components/share/transfer-progress';
import { DeviceAvatar } from '@/components/share/device-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransfer } from '@/hooks/use-transfer';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { useAppStore } from '@/lib/stores/app-store';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon } from '@hugeicons/core-free-icons';

interface SessionInfo {
  id: string;
  code: string;
  senderName: string;
  files: Array<{ name: string; size: number; type: string }>;
  totalSize: number;
  status: string;
}

export default function ReceivePage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const { joinByLink } = useTransfer();
  const status = useTransferStore((s) => s.status);
  const isConnected = useAppStore((s) => s.isConnected);

  // Fetch session info
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/transfer/${sessionId}`);
        if (!res.ok) {
          setError('This transfer link is invalid or has expired.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setSessionInfo(data);
      } catch {
        setError('Failed to load transfer info.');
      }
      setLoading(false);
    }

    fetchSession();
  }, [sessionId]);

  const handleAccept = () => {
    setJoined(true);
    joinByLink(sessionId);
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <motion.div
            className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 py-20 flex flex-col items-center"
        >
          <HugeiconsIcon icon={Alert01Icon} className="w-10 h-10 text-destructive" />
          <h1 className="text-xl font-bold tracking-widest uppercase text-destructive">{error}</h1>
          <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
            The sender may have cancelled the transfer, or the link has expired.
          </p>
          <Button variant="outline" onClick={() => window.location.href = '/'} className="border-primary/30 text-primary hover:bg-primary/10 font-mono uppercase tracking-widest text-xs">
            Return to Scanner
          </Button>
        </motion.div>
      </AppShell>
    );
  }

  if (!sessionInfo) return null;

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md mx-auto space-y-6"
      >
        {!joined ? (
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
                <DeviceAvatar name={sessionInfo.senderName} size="lg" active showTooltip={false} />
              </motion.div>

              <div className="space-y-1">
                <h2 className="text-lg font-bold tracking-widest uppercase text-foreground/90">Incoming Signal</h2>
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  From <span className="text-primary">{sessionInfo.senderName}</span>
                </p>
              </div>

              <div className="w-full rounded-xl border border-border/20 bg-card/30 p-3 space-y-2">
                {sessionInfo.files.map((file, i) => (
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
                  <span>{sessionInfo.files.length} FILE{sessionInfo.files.length !== 1 ? 'S' : ''}</span>
                  <span>{formatBytes(sessionInfo.totalSize)} TOTAL</span>
                </div>
              </div>

              {!isConnected && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] font-mono text-amber-500 uppercase tracking-widest"
                >
                  Establishing connection...
                </motion.p>
              )}

              <div className="flex w-full gap-3 mt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 font-mono uppercase tracking-widest text-xs"
                  onClick={() => window.location.href = '/'}
                >
                  Reject
                </Button>
                <Button
                  className="flex-1 bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest text-xs shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                  onClick={handleAccept}
                  disabled={!isConnected}
                >
                  Accept
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-widest uppercase text-foreground/90">
                {status === 'connecting' && 'Establishing Link'}
                {status === 'transferring' && 'Receiving Data'}
                {status === 'complete' && 'Transmission Complete'}
                {status === 'error' && 'Transmission Failed'}
              </h1>
              <div className="flex items-center justify-center gap-2">
                <DeviceAvatar name={sessionInfo.senderName} size="sm" />
                <span className="text-sm font-mono text-primary/80 uppercase tracking-wider">
                  From {sessionInfo.senderName}
                </span>
              </div>
            </div>

            {status === 'connecting' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex items-center justify-center w-64 h-64 mx-auto"
              >
                <div className="absolute inset-0 rounded-full border border-primary/20" />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-primary"
                  style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%)' }}
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                />
                <div className="absolute w-24 h-24 rounded-full bg-primary/20 blur-xl animate-pulse" />
                <div className="z-10">
                  <DeviceAvatar name={sessionInfo.senderName} size="lg" active showTooltip={false} />
                </div>
              </motion.div>
            )}

            {(status === 'transferring' || status === 'complete') && <TransferProgress />}

            <div className="flex justify-center">
              {status === 'complete' ? (
                <Button
                  onClick={() => window.location.href = '/'}
                  className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest"
                >
                  Done
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/'}
                  className="border-destructive/50 text-destructive hover:bg-destructive/10 font-mono uppercase tracking-widest"
                >
                  Abort
                </Button>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AppShell>
  );
}
