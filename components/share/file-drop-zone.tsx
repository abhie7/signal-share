'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/webrtc/file-chunker';
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
}

export function FileDropZone({ onFilesSelected, disabled }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

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
        setSelectedFiles((prev) => [...prev, ...files]);
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
      {/* Drop zone */}
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
              {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse • any file type • no size limit
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </motion.div>

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

              <div className="max-h-48 overflow-y-auto p-2">
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
                      <span className="text-lg shrink-0">{getFileIcon(file.type)}</span>
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
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 p-1 rounded-md"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </motion.button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="border-t border-border/40 p-3">
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
