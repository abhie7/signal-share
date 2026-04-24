/// <reference lib="webworker" />

import JSZip from 'jszip';

export interface ZipEntry {
  path: string;
  file: File;
}

interface WorkerRequest {
  entries: ZipEntry[];
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { entries } = e.data;

  try {
    const zip = new JSZip();

    for (const { path, file } of entries) {
      zip.file(path, file);
    }

    const blob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      ({ percent }) => {
        self.postMessage({ type: 'progress', percent });
      },
    );

    self.postMessage({ type: 'complete', blob });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'ZIP generation failed',
    });
  }
};
