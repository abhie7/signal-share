'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/webrtc/file-chunker';
import { processDataTransfer } from '@/lib/utils/zip';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Image02Icon as ImageIcon,
  Video01Icon as VideoIcon,
  MusicNote01Icon as AudioIcon,
  Pdf01Icon as PdfIcon,
  PackageIcon,
  File02Icon as DocumentIcon,
  AnalyticsUpIcon as ChartIcon,
  File01Icon as FileIcon,
  Folder01Icon as FolderIcon,
  Download04Icon as DownloadIcon
} from '@hugeicons/core-free-icons';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  initialFiles?: File[];
}

export function FileDropZone({ onFilesSelected, disabled, initialFiles }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>(initialFiles || []);
  const inputRef = useRef<HTMLInputElement>(null);
  const syncedExternalCountRef = useRef(initialFiles?.length || 0);

  useEffect(() => {
    const externalFiles = initialFiles || [];
    if (externalFiles.length === 0) {
      syncedExternalCountRef.current = 0;
      return;
    }

    if (externalFiles.length <= syncedExternalCountRef.current) {
      return;
    }

    const newlyStaged = externalFiles.slice(syncedExternalCountRef.current);
    syncedExternalCountRef.current = externalFiles.length;
    setSelectedFiles((prev) => [...prev, ...newlyStaged]);
  }, [initialFiles]);

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
          setSelectedFiles((prev) => [...prev, ...files]);
        }
      } catch (err) {
        console.error('Error processing dropped items', err);
      }
    },
    [],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        setSelectedFiles((prev) => [...prev, ...files]);
      }
      // Reset the input so the same file can be selected again
      e.target.value = '';
    },
    [],
  );

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleShare = useCallback(() => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
    }
  }, [selectedFiles, onFilesSelected]);

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <HugeiconsIcon icon={ImageIcon} className="w-5 h-5" />;
    if (type.startsWith('video/')) return <HugeiconsIcon icon={VideoIcon} className="w-5 h-5" />;
    if (type.startsWith('audio/')) return <HugeiconsIcon icon={AudioIcon} className="w-5 h-5" />;
    if (type.includes('pdf')) return <HugeiconsIcon icon={PdfIcon} className="w-5 h-5" />;
    if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return <HugeiconsIcon icon={PackageIcon} className="w-5 h-5" />;
    if (type.includes('text') || type.includes('document')) return <HugeiconsIcon icon={DocumentIcon} className="w-5 h-5" />;
    if (type.includes('spreadsheet') || type.includes('csv')) return <HugeiconsIcon icon={ChartIcon} className="w-5 h-5" />;
    if (type.includes('presentation')) return <HugeiconsIcon icon={ChartIcon} className="w-5 h-5" />;
    return <HugeiconsIcon icon={FileIcon} className="w-5 h-5" />;
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />

      {/* Drop zone */}
      {selectedFiles.length === 0 && (
        <motion.div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`
            relative cursor-pointer rounded-2xl border-2 border-dashed p-10
            transition-colors duration-200
            ${isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border/60 hover:border-primary/40 hover:bg-muted/30'
            }
            ${disabled ? 'pointer-events-none opacity-50' : ''}
          `}
          animate={{
            borderColor: isDragOver ? 'var(--color-primary)' : undefined,
          }}
        >
          {/* Animated pulse ring on drag */}
          <AnimatePresence>
            {isDragOver && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                className="absolute inset-0 rounded-2xl border-2 border-primary/30"
              />
            )}
          </AnimatePresence>

          <div className="flex flex-col items-center gap-3 text-center">
            <motion.div
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
              animate={{ y: isDragOver ? -5 : 0 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {isDragOver ? <HugeiconsIcon icon={DownloadIcon} className="w-8 h-8" /> : <HugeiconsIcon icon={FolderIcon} className="w-8 h-8" />}
            </motion.div>
            <div>
              <p className="text-base font-medium text-foreground">
                {isProcessing ? 'Processing files...' : isDragOver ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isProcessing ? 'Zipping directories...' : 'or click to browse • files & folders • no size limit'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Selected files list */}
      <AnimatePresence mode="popLayout">
        {selectedFiles.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatBytes(totalSize)}
                </span>
              </div>

              <div className="max-h-[50vh] overflow-y-auto p-2">
                <AnimatePresence mode="popLayout">
                  {selectedFiles.map((file, index) => (
                    <motion.div
                      key={`${file.name}-${file.size}-${index}`}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 group"
                    >
                      {file.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="w-8 h-8 rounded-md object-cover shrink-0"
                          onLoad={(e) => {
                            // Revoke after rendering to free memory
                            // We delay slightly so the browser can paint
                            const src = (e.target as HTMLImageElement).src;
                            setTimeout(() => URL.revokeObjectURL(src), 1000);
                          }}
                        />
                      ) : (
                        <span className="text-lg shrink-0">{getFileIcon(file.type)}</span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 p-1 rounded-md"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </motion.button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="border-t border-border/40 p-3 flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                  disabled={disabled}
                  className="w-full border-dashed border-primary/30 text-primary hover:bg-primary/10"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Add more files
                </Button>
                <Button
                  onClick={handleShare}
                  disabled={disabled}
                  className="w-full"
                  size="lg"
                >
                  Share {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
