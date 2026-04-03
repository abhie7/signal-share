import JSZip from 'jszip';

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
 * Recursively reads a FileSystemEntry and adds its contents to a JSZip instance.
 */
async function addEntryToZip(entry: WebkitFileSystemEntry, zip: JSZip, path = '') {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file?.(resolve, reject);
    });
    zip.file(path + file.name, file);
    await yieldToBrowser();
  } else if (entry.isDirectory) {
    const newPath = path + entry.name + '/';
    const entries = await readAllDirectoryEntries(entry);
    const tasks = entries.map((childEntry) => async () => addEntryToZip(childEntry, zip, newPath));
    await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
    await yieldToBrowser();
  }
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
  const entries = items
    .map((item) => item.webkitGetAsEntry?.() as WebkitFileSystemEntry | null)
    .filter((entry): entry is WebkitFileSystemEntry => Boolean(entry));

  let hasDirectory = false;

  // Check for directories
  for (const entry of entries) {
    if (entry && entry.isDirectory) {
      hasDirectory = true;
      break;
    }
  }

  if (!hasDirectory) {
    // Standard file drop
    return Array.from(dataTransfer.files);
  }

  const onSlowProcessingChange = options.onSlowProcessingChange;
  const slowThresholdMs = options.slowThresholdMs ?? 400;
  const slowTimer = setTimeout(() => {
    onSlowProcessingChange?.(true);
  }, slowThresholdMs);

  // Has directories, need to zip
  const zip = new JSZip();
  operationCount = 0;

  try {
    // Give React a chance to paint loader state before heavy folder traversal starts.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    for (const entry of entries) {
      await addEntryToZip(entry, zip);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const folderName = entries.length === 1 && entries[0]?.name ? entries[0].name : 'Archive';

    const zipFile = new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' });
    return [zipFile];
  } finally {
    clearTimeout(slowTimer);
    onSlowProcessingChange?.(false);
  }
}
