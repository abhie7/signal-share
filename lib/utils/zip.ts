import type { ZipEntry } from './zip.worker';

interface WebkitFileSystemEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (
      successCallback: (entries: WebkitFileSystemEntry[]) => void,
      errorCallback?: (error: DOMException) => void,
    ) => void;
  };
}

interface ProcessDataTransferOptions {
  slowThresholdMs?: number;
  onSlowProcessingChange?: (isSlow: boolean) => void;
}

const CONCURRENCY_LIMIT = 8;
const YIELD_EVERY = 40;

let operationCount = 0;

async function yieldToBrowser() {
  operationCount += 1;
  if (operationCount % YIELD_EVERY === 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

async function readAllDirectoryEntries(entry: WebkitFileSystemEntry): Promise<WebkitFileSystemEntry[]> {
  if (!entry.createReader) {
    return [];
  }

  const dirReader = entry.createReader();
  const allEntries: WebkitFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      break;
    }

    allEntries.push(...batch);
  }

  return allEntries;
}

async function runWithConcurrency(tasks: Array<() => Promise<void>>, limit: number) {
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async (_, workerIndex) => {
    for (let taskIndex = workerIndex; taskIndex < tasks.length; taskIndex += limit) {
      await tasks[taskIndex]();
    }
  });

  await Promise.all(workers);
}

/**
 * Recursively traverses a FileSystemEntry tree and collects { path, file } pairs.
 * Directory traversal (metadata only) stays on the main thread because the
 * FileSystem API is not available in Web Workers.
 */
async function collectEntries(entry: WebkitFileSystemEntry, list: ZipEntry[], path = '') {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file?.(resolve, reject);
    });
    list.push({ path: path + file.name, file });
    await yieldToBrowser();
  } else if (entry.isDirectory) {
    const newPath = path + entry.name + '/';
    const children = await readAllDirectoryEntries(entry);
    const tasks = children.map((child) => async () => collectEntries(child, list, newPath));
    await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
    await yieldToBrowser();
  }
}

/**
 * Generates a ZIP from an array of { path, file } entries.
 *
 * When a Web Worker is available the heavy compression is offloaded to a
 * background thread so the main thread stays responsive for large folders.
 * Falls back to the main thread if workers are not supported.
 */
async function generateZipBlob(entries: ZipEntry[]): Promise<Blob> {
  if (typeof Worker === 'undefined') {
    // Fallback: run on main thread (e.g. SSR or very old browsers)
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const { path, file } of entries) {
      zip.file(path, file);
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('./zip.worker.ts', import.meta.url));

    worker.onmessage = (e: MessageEvent) => {
      const { type, blob, message } = e.data as { type: string; blob?: Blob; percent?: number; message?: string };
      if (type === 'complete' && blob) {
        worker.terminate();
        resolve(blob);
      } else if (type === 'error') {
        worker.terminate();
        reject(new Error(message ?? 'ZIP generation failed'));
      }
      // 'progress' events are intentionally ignored here; callers that need
      // granular progress can wire up their own listener before calling this.
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    worker.postMessage({ entries });
  });
}

/**
 * Checks if a DataTransfer object contains directories.
 * If yes, it processes them, zips the directories together with any loose files,
 * and returns an array of Files containing the zip. If no directories, returns the files as is.
 */
export async function processDataTransfer(
  dataTransfer: DataTransfer,
  options: ProcessDataTransferOptions = {},
): Promise<File[]> {
  const items = Array.from(dataTransfer.items);
  const fsEntries = items
    .map((item) => item.webkitGetAsEntry?.() as WebkitFileSystemEntry | null)
    .filter((entry): entry is WebkitFileSystemEntry => Boolean(entry));

  let hasDirectory = false;

  for (const entry of fsEntries) {
    if (entry && entry.isDirectory) {
      hasDirectory = true;
      break;
    }
  }

  if (!hasDirectory) {
    // Standard file drop — no zipping needed
    return Array.from(dataTransfer.files);
  }

  const onSlowProcessingChange = options.onSlowProcessingChange;
  const slowThresholdMs = options.slowThresholdMs ?? 400;
  const slowTimer = setTimeout(() => {
    onSlowProcessingChange?.(true);
  }, slowThresholdMs);

  operationCount = 0;

  try {
    // Yield so React can paint the "processing" state before traversal begins.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    // Phase 1: traverse the directory tree on the main thread (fast — metadata only)
    const zipEntries: ZipEntry[] = [];
    const tasks = fsEntries.map((entry) => async () => collectEntries(entry, zipEntries));
    await runWithConcurrency(tasks, CONCURRENCY_LIMIT);

    // Phase 2: generate the ZIP off the main thread via a Web Worker
    const zipBlob = await generateZipBlob(zipEntries);
    const folderName = fsEntries.length === 1 && fsEntries[0]?.name ? fsEntries[0].name : 'Archive';

    const zipFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });
    return [zipFile];
  } finally {
    clearTimeout(slowTimer);
    onSlowProcessingChange?.(false);
  }
}
