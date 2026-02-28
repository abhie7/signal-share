'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '@/components/share/app-shell';
import { RadarScanner } from '@/components/share/radar-scanner';
import { NearbyPeers } from '@/components/share/nearby-peers';
import { TransferCode } from '@/components/share/transfer-code';
import { ShareLink } from '@/components/share/share-link';
import { TransferProgress } from '@/components/share/transfer-progress';
import { ReceivePrompt } from '@/components/share/receive-prompt';
import { DeviceAvatar } from '@/components/share/device-avatar';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/stores/app-store';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { useTransfer } from '@/hooks/use-transfer';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon } from '@hugeicons/core-free-icons';
import { InfoSection } from '@/components/share/info-section';
import type { NearbyPeer } from '@/lib/stores/peers-store';

import type { ErrorDetails, FileInfo } from '@/lib/stores/transfer-store';

const pageVariants = {
  initial: { opacity: 0, y: 20, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -20, filter: 'blur(4px)' },
};

function TransferErrorCard({
  error,
  errorDetails,
  fallbackFiles,
  label,
}: {
  error: string | null;
  errorDetails: ErrorDetails | null;
  fallbackFiles: FileInfo[];
  label: string;
}) {
  const files = errorDetails?.files?.length ? errorDetails.files : fallbackFiles;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md"
    >
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3 backdrop-blur-md shadow-[0_0_20px_rgba(var(--destructive),0.1)]">
        <div className="flex items-center gap-2 text-destructive">
          <HugeiconsIcon icon={Alert01Icon} className="w-5 h-5" />
          <p className="text-sm font-bold tracking-widest uppercase">{error || 'Transmission Failed'}</p>
        </div>
        {errorDetails?.code && (
          <p className="text-[10px] text-destructive/70 font-mono uppercase tracking-wider">
            ERR_CODE: {errorDetails.code}
          </p>
        )}
        {files.length > 0 && (
          <div className="space-y-2 border-t border-destructive/20 pt-3">
            <p className="text-[10px] font-mono text-destructive/80 uppercase tracking-widest">{label}:</p>
            {files.map((file, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-destructive/70 font-mono">
                <span className="truncate pr-2">{file.name}</span>
                <span className="shrink-0">{formatBytes(file.size)}</span>
              </div>
            ))}
            <p className="text-[10px] text-destructive/60 font-mono pt-1 border-t border-destructive/10 mt-2">
              TOTAL: {formatBytes(files.reduce((s, f) => s + f.size, 0))}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function HomeView() {
  const [mode, setMode] = useState<'local' | 'link'>('local');
  const { shareFiles, sendToPeer, joinByCode } = useTransfer();
  const files = useTransferStore((s) => s.files);

  const handlePeerClick = (peer: NearbyPeer) => {
    if (files.length > 0) {
      sendToPeer(peer.id, files);
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="relative w-full min-h-screen flex flex-col items-center justify-center pt-20"
    >
      {/* Mode Toggle */}
      <div className="fixed top-24 right-6 z-40 flex items-center rounded-full border border-primary/20 bg-background/40 backdrop-blur-md p-1 shadow-[0_0_15px_rgba(var(--primary),0.1)]">
        <button
          onClick={() => setMode('local')}
          className={`px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all ${
            mode === 'local'
              ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(var(--primary),0.2)]'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Direct
        </button>
        <button
          onClick={() => setMode('link')}
          className={`px-4 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest transition-all ${
            mode === 'link'
              ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(var(--primary),0.2)]'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Relay
        </button>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'local' ? (
          <motion.div
            key="local"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full flex flex-col items-center justify-center relative"
          >
            {/* Visual Hero Text */}
            <div className="absolute top-10 md:top-20 flex flex-col items-center text-center px-4 z-20 pointer-events-none">
              <h1 className="text-xl md:text-3xl font-bold tracking-widest uppercase text-foreground/90 mb-2">
                Transmit files directly across your network
              </h1>
              <p className="text-xs md:text-sm font-mono text-muted-foreground uppercase tracking-wider">
                Live peer-to-peer signal transfer. No accounts. No storage. No cloud.
              </p>
            </div>

            <RadarScanner onFilesSelected={shareFiles} />

            {/* Nearby Devices Panel */}
            <div className="fixed right-6 top-32 bottom-6 w-80 hidden lg:flex flex-col gap-4 z-30">
              <NearbyPeers onPeerClick={handlePeerClick} />
            </div>

            {/* Mobile Nearby Devices */}
            <div className="fixed bottom-0 left-0 right-0 h-64 lg:hidden z-30 p-4">
              <NearbyPeers onPeerClick={handlePeerClick} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="link"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-md flex flex-col items-center gap-8"
          >
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-widest uppercase text-foreground/90">Join Transmission</h2>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Enter a secure relay key</p>
            </div>

            <div className="w-full rounded-2xl border border-primary/20 bg-card/20 p-8 backdrop-blur-xl shadow-[0_0_30px_rgba(var(--primary),0.1)] flex flex-col items-center gap-8">
              {/* Waveform animation */}
              <div className="flex items-center justify-center gap-1 h-12 w-full">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-primary/60 rounded-full"
                    animate={{ height: ['20%', '100%', '20%'] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      delay: i * 0.1,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </div>

              <div className="w-full">
                <TransferCode mode="input" onCodeSubmit={joinByCode} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SendingView() {
  const { transferCode, shareLink, status, cancelTransfer, goHome } = useTransfer();
  const remotePeerName = useTransferStore((s) => s.remotePeerName);
  const error = useTransferStore((s) => s.error);
  const errorDetails = useTransferStore((s) => s.errorDetails);
  const fileInfos = useTransferStore((s) => s.fileInfos);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="relative w-full min-h-screen flex flex-col items-center justify-center gap-8 pt-20 pb-12"
    >
      <div className="text-center space-y-2">
        <motion.h1
          className="text-2xl font-bold tracking-widest uppercase text-foreground/90"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {status === 'waiting' && 'Awaiting Connection'}
          {status === 'connecting' && 'Establishing Link'}
          {status === 'transferring' && 'Transmitting Data'}
          {status === 'complete' && 'Transmission Complete'}
          {status === 'error' && 'Transmission Failed'}
          {status === 'cancelled' && 'Transmission Aborted'}
        </motion.h1>
        {remotePeerName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <DeviceAvatar name={remotePeerName} size="sm" />
            <span className="text-sm font-mono text-primary/80 uppercase tracking-wider">{remotePeerName}</span>
          </motion.div>
        )}
      </div>

      {/* Show code and link while waiting */}
      {status === 'waiting' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-8"
        >
          {/* Radar scanning animation */}
          <div className="relative flex items-center justify-center w-64 h-64">
            <motion.div
              className="absolute inset-0 rounded-full border border-primary/30"
              animate={{ scale: [1, 2], opacity: [0.8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeOut' }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border border-primary/30"
              animate={{ scale: [1, 2], opacity: [0.8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeOut', delay: 1 }}
            />
            <div className="absolute inset-0 rounded-full border border-primary/10" />
            <div className="absolute w-16 h-16 rounded-full bg-primary/20 blur-xl" />

            <div className="z-10 flex flex-col items-center gap-4">
              {transferCode && <TransferCode mode="display" code={transferCode} />}
            </div>
          </div>

          {shareLink && <ShareLink link={shareLink} />}
        </motion.div>
      )}

      {/* Connecting animation */}
      {status === 'connecting' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative flex items-center justify-center w-64 h-64"
        >
          <div className="absolute inset-0 rounded-full border border-primary/20" />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary"
            style={{ clipPath: 'polygon(50% 50%, 100% 0, 100% 100%)' }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          />
          <div className="absolute w-24 h-24 rounded-full bg-primary/20 blur-xl animate-pulse" />
          <div className="z-10">
            <DeviceAvatar name={remotePeerName || 'Unknown'} size="lg" active showTooltip={false} />
          </div>
        </motion.div>
      )}

      {/* Progress */}
      {(status === 'transferring' || status === 'complete') && <TransferProgress />}

      {/* Error details */}
      {status === 'error' && (
        <TransferErrorCard
          error={error}
          errorDetails={errorDetails}
          fallbackFiles={fileInfos}
          label="Failed files"
        />
      )}

      {/* Actions */}
      <div className="flex justify-center gap-3 mt-8">
        {status === 'complete' ? (
          <Button
            onClick={goHome}
            className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest"
          >
            New Transmission
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={cancelTransfer}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 font-mono uppercase tracking-widest"
          >
            Abort
          </Button>
        )}
      </div>
    </motion.div>
  );
}

function ReceivingView() {
  const { status, goHome, cancelTransfer } = useTransfer();
  const remotePeerName = useTransferStore((s) => s.remotePeerName);
  const error = useTransferStore((s) => s.error);
  const errorDetails = useTransferStore((s) => s.errorDetails);
  const fileInfos = useTransferStore((s) => s.fileInfos);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="relative w-full min-h-screen flex flex-col items-center justify-center gap-8 pt-20 pb-12"
    >
      <div className="text-center space-y-2">
        <motion.h1
          className="text-2xl font-bold tracking-widest uppercase text-foreground/90"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {status === 'connecting' && 'Establishing Link'}
          {status === 'transferring' && 'Receiving Data'}
          {status === 'complete' && 'Transmission Complete'}
          {status === 'error' && 'Transmission Failed'}
          {status === 'cancelled' && 'Transmission Aborted'}
        </motion.h1>
        {remotePeerName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <DeviceAvatar name={remotePeerName} size="sm" />
            <span className="text-sm font-mono text-primary/80 uppercase tracking-wider">From {remotePeerName}</span>
          </motion.div>
        )}
      </div>

      {/* Connecting animation */}
      {status === 'connecting' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative flex items-center justify-center w-64 h-64"
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
            <DeviceAvatar name={remotePeerName || 'Unknown'} size="lg" active showTooltip={false} />
          </div>
        </motion.div>
      )}

      {/* Progress */}
      {(status === 'transferring' || status === 'complete') && <TransferProgress />}

      {/* Error details */}
      {status === 'error' && (
        <TransferErrorCard
          error={error}
          errorDetails={errorDetails}
          fallbackFiles={fileInfos}
          label="Failed files"
        />
      )}

      {/* Actions */}
      <div className="flex justify-center gap-3 mt-8">
        {status === 'complete' ? (
          <Button
            onClick={goHome}
            className="bg-primary/20 text-primary hover:bg-primary/30 border border-primary/50 font-mono uppercase tracking-widest"
          >
            Acknowledge
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={cancelTransfer}
            className="border-destructive/50 text-destructive hover:bg-destructive/10 font-mono uppercase tracking-widest"
          >
            Abort
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export default function Home() {
  const view = useAppStore((s) => s.view);
  const { acceptIncoming, declineIncoming } = useTransfer();

  return (
    <AppShell>
      <AnimatePresence mode="wait">
        {view === 'home' && <HomeView key="home" />}
        {view === 'sending' && <SendingView key="sending" />}
        {view === 'receiving' && <ReceivingView key="receiving" />}
      </AnimatePresence>

      {/* SEO & Footer Section - only visible when home */}
      {view === 'home' && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           className="w-full"
        >
          <InfoSection />
        </motion.div>
      )}

      {/* Incoming transfer modal */}
      <ReceivePrompt onAccept={acceptIncoming} onDecline={declineIncoming} />
    </AppShell>
  );
}