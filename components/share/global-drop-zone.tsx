'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import { FolderUploadIcon } from '@hugeicons/core-free-icons';
import { useAppStore } from '@/lib/stores/app-store';
import { processDataTransfer } from '@/lib/utils/zip';

export function GlobalDropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);
  const [pastedFileCount, setPastedFileCount] = useState(0);
  const [ignoredFolderCount, setIgnoredFolderCount] = useState(0);
  const view = useAppStore((s) => s.view);

  const extractFilesFromClipboard = (clipboardData: DataTransfer): { files: File[]; ignoredFolders: number } => {
    let ignoredFolders = 0;
    const fileItems = Array.from(clipboardData.items).filter((item) => item.kind === 'file');

    const filesFromItems = fileItems
      .flatMap((item) => {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          ignoredFolders += 1;
          return [];
        }

        const file = item.getAsFile();
        return file ? [file] : [];
      });

    if (filesFromItems.length > 0) {
      return { files: filesFromItems, ignoredFolders };
    }

    // If clipboard provided file-kind items but all were directories/unsupported,
    // do not fallback to clipboard.files to avoid staging broken pseudo-file entries.
    if (fileItems.length > 0) {
      return { files: [], ignoredFolders };
    }

    return { files: Array.from(clipboardData.files), ignoredFolders };
  };

  const stageFilesForHomeView = (files: File[]) => {
    window.dispatchEvent(new CustomEvent<File[]>('signalshare:stage-files', { detail: files }));
  };

  const isEditableTarget = (target: EventTarget | null): boolean => {
    const targetEl = target instanceof HTMLElement ? target : null;
    const activeEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = targetEl || activeEl;

    if (!element) {
      return false;
    }

    if (element.isContentEditable || element.closest('[contenteditable="true"]')) {
      return true;
    }

    const textLikeInput = element.closest('textarea, select, input:not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"])');
    return Boolean(textLikeInput);
  };

  useEffect(() => {
    // Only allow global drop if we are currently on the home view (not already transferring)
    if (view !== 'home') return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = 'copy';
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Only set to false if leaving the window, not child elements
      if (e.clientX === 0 && e.clientY === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (!e.dataTransfer) return;
      const files = await processDataTransfer(e.dataTransfer, {
        slowThresholdMs: 400,
        onSlowProcessingChange: setIsProcessingDrop,
      });
      if (files.length > 0) {
        stageFilesForHomeView(files);
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData || isEditableTarget(e.target)) {
        return;
      }

      const { files, ignoredFolders } = extractFilesFromClipboard(e.clipboardData);
      if (ignoredFolders > 0) {
        setIgnoredFolderCount(ignoredFolders);
      }

      if (files.length === 0) {
        return;
      }

      e.preventDefault();
      setPastedFileCount(files.length);
      stageFilesForHomeView(files);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('paste', handlePaste);
    };
  }, [view]);

  useEffect(() => {
    if (pastedFileCount === 0) {
      return;
    }

    const timer = setTimeout(() => setPastedFileCount(0), 1600);
    return () => clearTimeout(timer);
  }, [pastedFileCount]);

  useEffect(() => {
    if (ignoredFolderCount === 0) {
      return;
    }

    const timer = setTimeout(() => setIgnoredFolderCount(0), 2200);
    return () => clearTimeout(timer);
  }, [ignoredFolderCount]);

  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-100 flex items-center justify-center bg-background/80 backdrop-blur-md"
        >
          {/* Animated dashed border */}
          <div className="absolute inset-6 rounded-3xl border-4 border-dashed border-primary/50 animate-pulse bg-primary/5 pointer-events-none" />

          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="flex flex-col items-center gap-6 pointer-events-none"
          >
            <div className="relative flex items-center justify-center w-32 h-32 rounded-full bg-primary/20 border-2 border-primary/50 shadow-[0_0_50px_rgba(var(--primary),0.3)]">
              <HugeiconsIcon icon={FolderUploadIcon} className="w-16 h-16 text-primary" />
              {/* Ripple effect */}
              <div className="absolute inset-0 rounded-full border border-primary animate-ping opacity-50" />
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold tracking-widest uppercase text-foreground">
                Drop to Add
              </h2>
              <p className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
                Release files to add them to your selection
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}

      {isProcessingDrop && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-110 flex items-center justify-center bg-background/70 backdrop-blur-sm pointer-events-none"
        >
          <div className="flex items-center gap-3 rounded-full border border-primary/40 bg-background/70 px-5 py-3 text-primary shadow-[0_0_30px_rgba(var(--primary),0.2)]">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs font-mono uppercase tracking-widest">Preparing dropped folder...</span>
          </div>
        </motion.div>
      )}

      {pastedFileCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-110 pointer-events-none"
        >
          <div className="rounded-full border border-primary/40 bg-background/85 px-4 py-2 text-xs font-mono uppercase tracking-widest text-primary shadow-[0_0_20px_rgba(var(--primary),0.2)]">
            Pasted {pastedFileCount} file{pastedFileCount === 1 ? '' : 's'} • Added to selection
          </div>
        </motion.div>
      )}

      {ignoredFolderCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-110 pointer-events-none"
        >
          <div className="rounded-full border border-amber-400/40 bg-background/85 px-4 py-2 text-xs font-mono uppercase tracking-widest text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
            Folder paste isn&apos;t supported in this browser. Use drag & drop for folders.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
