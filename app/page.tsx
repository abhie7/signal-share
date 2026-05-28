'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '@/components/share/app-shell';
import { RadarScanner } from '@/components/share/radar-scanner';
import { FileDropZone } from '@/components/share/file-drop-zone';
import { NearbyPeers } from '@/components/share/nearby-peers';
import { TransferCode } from '@/components/share/transfer-code';
import { ShareLink } from '@/components/share/share-link';
import { QRCodeDisplay } from '@/components/share/qr-code';
import { TransferProgress } from '@/components/share/transfer-progress';
import { ReceivePrompt } from '@/components/share/receive-prompt';
import { DeviceAvatar } from '@/components/share/device-avatar';
import { Confetti } from '@/components/confetti';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/lib/stores/app-store';
import { useTransferStore } from '@/lib/stores/transfer-store';
import { useTransfer } from '@/hooks/use-transfer';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert01Icon, SecurityLockIcon } from '@hugeicons/core-free-icons';
import { InfoSection } from '@/components/share/info-section';
import { ShareTypeNav } from '@/components/share/share-type-nav';
import { ScreenSharePanel } from '@/components/share/screen-share-placeholder';
import { ScreenCallStage } from '@/components/share/screen-call-stage';
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
  const [stagingFiles, setStagingFiles] = useState<File[]>([]);
  const [textDraft, setTextDraft] = useState('');
  const [textStatus, setTextStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [textStatusMessage, setTextStatusMessage] = useState('');
  const { shareFiles, shareText, sendToPeer, joinByCode, sendEncryptedText, shareScreen } = useTransfer();
  const files = useTransferStore((s) => s.files);
  const textStream = useTransferStore((s) => s.textStream);
  const shareType = useAppStore((s) => s.shareType);
  const setShareType = useAppStore((s) => s.setShareType);

  useEffect(() => {
    const handleStageFiles = (e: Event) => {
      const customEvent = e as CustomEvent<File[]>;
      const incomingFiles = customEvent.detail || [];
      if (incomingFiles.length === 0) {
        return;
      }

      setShareType('files');
      setStagingFiles((prev) => [...prev, ...incomingFiles]);
    };

    window.addEventListener('signalshare:stage-files', handleStageFiles as EventListener);
    return () => {
      window.removeEventListener('signalshare:stage-files', handleStageFiles as EventListener);
    };
  }, [setShareType]);

  const handlePeerClick = async (peer: NearbyPeer) => {
    if (stagingFiles.length > 0) {
      sendToPeer(peer.id, stagingFiles);
    } else if (files.length > 0) {
      sendToPeer(peer.id, files);
    } else {
      const message = textDraft.trim();
      if (!message) {
        setTextStatus('error');
        setTextStatusMessage('Write a text snippet first');
        return;
      }

      if (textStatus === 'sending') {
        return;
      }

      try {
        setTextStatus('sending');
        setTextStatusMessage(`Encrypting for ${peer.name}...`);
        await sendEncryptedText(peer.id, message);
        setTextStatus('sent');
        setTextStatusMessage(`Encrypted message sent to ${peer.name}`);
        setTextDraft('');
      } catch (error) {
        console.error('Encrypted text send failed:', error);
        setTextStatus('error');
        setTextStatusMessage(error instanceof Error ? error.message : 'Failed to send encrypted text');
      }
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="relative w-full min-h-screen pt-20 pb-8 px-3 sm:px-6"
    >
      <ShareTypeNav
        activeType={shareType}
        onSelect={(type) => setShareType(type)}
        compact
        className="sticky top-20 z-40 mb-4 rounded-2xl border border-border/40 bg-background/70 p-2 backdrop-blur-xl lg:hidden"
      />

      <div className="mx-auto grid w-full max-w-[1800px] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[20rem_minmax(0,1fr)_24rem]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-3 rounded-3xl border border-border/50 bg-card/25 p-4 backdrop-blur-xl">
            <p className="px-2 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Share or Receive</p>
            <ShareTypeNav
              activeType={shareType}
              onSelect={(type) => setShareType(type)}
              className="grid gap-2"
            />
          </div>
        </aside>

        <AnimatePresence mode="wait">
          <motion.section
            key={shareType}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="min-h-[62vh] rounded-3xl border border-primary/15 bg-card/15 p-4 sm:p-6 xl:p-10 backdrop-blur-lg"
          >
            {shareType === 'files' && (
              <div className="space-y-6">
                <div className={`text-center transition-opacity ${stagingFiles.length > 0 ? 'opacity-0 lg:opacity-100' : 'opacity-100'}`}>
                  <h1 className="text-xl sm:text-2xl xl:text-4xl font-bold tracking-widest uppercase text-foreground/90 mb-2">
                    Share Files, Folders, and Archives
                  </h1>
                  <p className="text-[11px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Direct transfer with no account and no storage.
                  </p>
                </div>
                {stagingFiles.length > 0 ? (
                  <div className="mx-auto w-full max-w-2xl">
                    <FileDropZone
                      initialFiles={stagingFiles}
                      onFilesSelected={(filesToShare) => {
                        setStagingFiles([]);
                        shareFiles(filesToShare);
                      }}
                    />
                    <Button
                      variant="ghost"
                      onClick={() => setStagingFiles([])}
                      className="w-full mt-4 text-muted-foreground hover:text-destructive text-xs uppercase tracking-widest font-mono"
                    >
                      Cancel sharing
                    </Button>
                  </div>
                ) : (
                  <div className="w-full flex flex-col items-center gap-6">
                    <RadarScanner onFilesSelected={setStagingFiles} />
                  </div>
                )}
              </div>
            )}

            {shareType === 'text' && (
              <div className="mx-auto w-full max-w-3xl space-y-5">
                <div className="text-center space-y-2">
                  <h2 className="text-xl sm:text-2xl xl:text-3xl font-bold tracking-widest uppercase text-foreground/90">Text Sharing</h2>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    End-to-end encrypted text stream with chunked delivery.
                  </p>
                </div>
                <div className="rounded-2xl border border-primary/20 bg-card/30 p-4 sm:p-6 backdrop-blur-md">
                  <Textarea
                    value={textDraft}
                    onChange={(e) => {
                      setTextDraft(e.target.value);
                      if (textStatus !== 'idle') {
                        setTextStatus('idle');
                        setTextStatusMessage('');
                      }
                    }}
                    placeholder="Type any length text..."
                    className="min-h-56 sm:min-h-72 bg-background/50 text-sm"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider">
                    <span className={`${textStatus === 'error' ? 'text-destructive' : textStatus === 'sent' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {textStatusMessage || 'Chunked encrypted streaming enabled'}
                    </span>
                    <span className="text-muted-foreground">{textDraft.length.toLocaleString()} chars</span>
                  </div>
                  {textStream.totalChunks > 0 && (
                    <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-primary/80">
                      stream {textStream.chunksSent}/{textStream.totalChunks} chunks • {textStream.bytesSent}/{textStream.totalBytes} chars sent
                    </p>
                  )}
                  <Button
                    onClick={() => {
                      try {
                        shareText(textDraft);
                        setTextStatus('idle');
                        setTextStatusMessage('');
                        setTextDraft('');
                      } catch (error) {
                        setTextStatus('error');
                        setTextStatusMessage(error instanceof Error ? error.message : 'Failed to create text session');
                      }
                    }}
                    variant="outline"
                    className="w-full mt-4 border-primary/30 text-primary hover:bg-primary/10 font-mono uppercase tracking-widest text-xs"
                  >
                    Share Text via Code/Link/QR
                  </Button>
                </div>
              </div>
            )}

            {shareType === 'screen' && (
              <ScreenSharePanel
                onShareSelf={() => shareScreen('share-self', false)}
                onRequestRemote={() => shareScreen('request-remote', false)}
              />
            )}

            {shareType === 'receive' && (
              <div className="mx-auto w-full max-w-xl flex flex-col items-center gap-6 sm:gap-8">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-bold tracking-widest uppercase text-foreground/90">Join Transmission</h2>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Enter a secure relay key</p>
                </div>
                <div className="w-full rounded-2xl border border-primary/20 bg-card/20 p-5 sm:p-8 backdrop-blur-xl shadow-[0_0_30px_rgba(var(--primary),0.1)]">
                  <TransferCode mode="input" onCodeSubmit={joinByCode} />
                </div>
              </div>
            )}
          </motion.section>
        </AnimatePresence>

        <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)]">
          <NearbyPeers onPeerClick={handlePeerClick} />
        </aside>
      </div>
    </motion.div>
  );
}

function SendingView() {
  const { transferCode, shareLink, status, cancelTransfer, goHome, getRemoteStream, getLocalPreviewStream } = useTransfer();
  const transferKind = useTransferStore((s) => s.transferKind);
  const screenStatus = useTransferStore((s) => s.screenStatus);
  const screenRenderNonce = useTransferStore((s) => s.screenRenderNonce);
  const isScreenSharer = useTransferStore((s) => s.isScreenSharer);
  const remotePeerName = useTransferStore((s) => s.remotePeerName);
  const error = useTransferStore((s) => s.error);
  const errorDetails = useTransferStore((s) => s.errorDetails);
  const fileInfos = useTransferStore((s) => s.fileInfos);
  const remoteStream = transferKind === 'screen' ? getRemoteStream() : null;
  const localPreviewStream = transferKind === 'screen' ? getLocalPreviewStream() : null;
  void screenRenderNonce;

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="relative w-full min-h-screen flex flex-col items-center justify-center gap-8 pt-20 pb-12 px-4 sm:px-6"
    >
      <div className="text-center space-y-2">
        <motion.h1
          className="text-xl sm:text-2xl font-bold tracking-widest uppercase text-foreground/90"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {status === 'waiting' && 'Awaiting Connection'}
          {status === 'connecting' && 'Establishing Link'}
          {status === 'transferring' && (transferKind === 'text' ? 'Sending Encrypted Text' : transferKind === 'screen' ? 'Screen Session Live' : 'Transmitting Data')}
          {status === 'complete' && (transferKind === 'text' ? 'Message Delivered' : 'Transmission Complete')}
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
          className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8"
        >
          {/* Main Code/Radar section (2 columns) */}
          <div className="lg:col-span-2 flex flex-col items-center justify-center gap-6 sm:gap-8 bg-card/10 border border-primary/10 rounded-3xl p-5 sm:p-8 backdrop-blur-md shadow-[0_0_30px_rgba(var(--primary),0.05)]">
            <div className="text-center space-y-2 mb-2">
              <h3 className="text-lg font-bold tracking-widest uppercase text-foreground/80">Transfer Code</h3>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Share this code with the receiver</p>
            </div>

            {/* Radar scanning animation */}
            <div className="relative flex items-center justify-center w-52 h-52 sm:w-64 sm:h-64">
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
          </div>

          {/* QR Code and Link section (1 column) */}
          <div className="flex flex-col items-center justify-center gap-6 bg-card/10 border border-primary/10 rounded-3xl p-5 sm:p-6 lg:p-8 backdrop-blur-md shadow-[0_0_30px_rgba(var(--primary),0.05)]">
            <div className="text-center space-y-2 w-full">
              <h3 className="text-lg font-bold tracking-widest uppercase text-foreground/80">Scan or Share</h3>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Alternative methods</p>
            </div>

            <div className="flex flex-col items-center gap-6 w-full">
              {shareLink && <QRCodeDisplay value={shareLink} />}
              <div className="w-full h-px bg-border/40 my-1" />
              {shareLink && <ShareLink link={shareLink} />}
              {/* E2E Security Badge */}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2 sm:mt-4 px-3 sm:px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-center">
                <HugeiconsIcon icon={SecurityLockIcon} className="w-4 h-4" />
                <span className="text-[9px] sm:text-[10px] font-mono uppercase tracking-widest">100% E2E Encrypted via WebRTC</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Connecting animation */}
      {status === 'connecting' && transferKind !== 'screen' && (
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
      {transferKind === 'file' && (status === 'transferring' || status === 'complete') && <TransferProgress />}

      {transferKind === 'text' && status === 'transferring' && (
        <div className="rounded-2xl border border-primary/20 bg-card/20 px-6 py-4 text-xs font-mono uppercase tracking-widest text-primary">
          Encrypting and delivering message payload...
        </div>
      )}

      {transferKind === 'screen' && (
        <ScreenCallStage
          remotePeerName={remotePeerName}
          isSharer={isScreenSharer}
          viewerStream={remoteStream}
          localPreviewStream={localPreviewStream}
          onAbort={cancelTransfer}
        />
      )}

      {/* Confetti on complete */}
      {status === 'complete' && <Confetti />}

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
  const { status, goHome, cancelTransfer, getRemoteStream, getLocalPreviewStream, acceptScreenPrompt, declineScreenPrompt } = useTransfer();
  const transferKind = useTransferStore((s) => s.transferKind);
  const screenStatus = useTransferStore((s) => s.screenStatus);
  const screenRenderNonce = useTransferStore((s) => s.screenRenderNonce);
  const isScreenSharer = useTransferStore((s) => s.isScreenSharer);
  const screenPrompt = useTransferStore((s) => s.screenPrompt);
  const remotePeerName = useTransferStore((s) => s.remotePeerName);
  const error = useTransferStore((s) => s.error);
  const errorDetails = useTransferStore((s) => s.errorDetails);
  const fileInfos = useTransferStore((s) => s.fileInfos);
  const remoteStream = transferKind === 'screen' ? getRemoteStream() : null;
  const localPreviewStream = transferKind === 'screen' ? getLocalPreviewStream() : null;
  void screenRenderNonce;

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
          {status === 'transferring' && (transferKind === 'text' ? 'Receiving Encrypted Text' : transferKind === 'screen' ? 'Screen Session Live' : 'Receiving Data')}
          {status === 'complete' && (transferKind === 'text' ? 'Message Received' : 'Transmission Complete')}
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
      {status === 'connecting' && transferKind !== 'screen' && (
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
      {transferKind === 'file' && (status === 'transferring' || status === 'complete') && <TransferProgress />}

      {transferKind === 'text' && status === 'transferring' && (
        <div className="rounded-2xl border border-primary/20 bg-card/20 px-6 py-4 text-xs font-mono uppercase tracking-widest text-primary">
          Waiting for secure text payload...
        </div>
      )}

      {transferKind === 'screen' && (
        <ScreenCallStage
          remotePeerName={remotePeerName}
          isSharer={isScreenSharer}
          viewerStream={remoteStream}
          localPreviewStream={localPreviewStream}
          onAbort={cancelTransfer}
        />
      )}

      {/* Confetti on complete */}
      {status === 'complete' && <Confetti />}

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
      <AnimatePresence>
        {screenPrompt.visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="w-full max-w-md rounded-2xl border border-primary/30 bg-background/90 p-6 text-center backdrop-blur-xl"
            >
              <h3 className="text-lg font-bold uppercase tracking-widest text-foreground/90">Screen Share Request</h3>
              <p className="mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {screenPrompt.requesterName || 'A device'} asked you to share your screen.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Button variant="outline" className="font-mono uppercase tracking-widest text-xs" onClick={declineScreenPrompt}>
                  Decline
                </Button>
                <Button className="font-mono uppercase tracking-widest text-xs" onClick={() => void acceptScreenPrompt()}>
                  Start Sharing
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setIncomingTransfer = useTransferStore((s) => s.setIncomingTransfer);

  const acceptIncoming = (incomingSessionId: string, senderId: string) => {
    const state = useTransferStore.getState();
    const senderName = state.incomingTransfer?.senderName ?? 'Unknown';

    state.setRole('receiver');
    state.setTransferKind('file');
    state.setStatus('connecting');
    state.setSession({ sessionId: incomingSessionId, code: '' });
    state.setRemotePeer(senderName, senderId);
    setView('receiving');

    void import('@/lib/webrtc/signaling').then(({ signaling }) => {
      signaling.send({ type: 'accept-transfer', sessionId: incomingSessionId });
    });

    setIncomingTransfer(null);
  };

  const declineIncoming = (incomingSessionId: string) => {
    void import('@/lib/webrtc/signaling').then(({ signaling }) => {
      signaling.send({ type: 'decline-transfer', sessionId: incomingSessionId });
    });
    setIncomingTransfer(null);
  };

  const dismissIncomingTransfer = () => {
    setIncomingTransfer(null);
  };

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
      <ReceivePrompt onAccept={acceptIncoming} onDecline={declineIncoming} onDismissText={dismissIncomingTransfer} />
    </AppShell>
  );
}
