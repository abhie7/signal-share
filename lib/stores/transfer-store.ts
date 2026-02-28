import { create } from 'zustand';

export type TransferStatus =
  | 'idle'
  | 'waiting'
  | 'connecting'
  | 'transferring'
  | 'complete'
  | 'error'
  | 'cancelled';

export type TransferRole = 'sender' | 'receiver' | null;

export interface FileInfo {
  name: string;
  size: number;
  type: string;
}

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  speed: number;
  eta: number;
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
}

export interface IncomingTransfer {
  sessionId: string;
  senderId: string;
  senderName: string;
  files: FileInfo[];
  totalSize: number;
}

export interface ErrorDetails {
  files: FileInfo[];
  totalSize: number;
  code?: string;
}

interface TransferState {
  // Files selected by sender
  files: File[];
  fileInfos: FileInfo[];

  // Session info
  sessionId: string | null;
  transferCode: string | null;
  shareLink: string | null;
  transferMode: 'local' | 'remote' | null;
  status: TransferStatus;
  role: TransferRole;
  error: string | null;

  // Remote peer info
  remotePeerName: string | null;
  remotePeerId: string | null;

  // Error details
  errorDetails: ErrorDetails | null;

  // Progress
  progress: TransferProgress;

  // Incoming transfer prompt
  incomingTransfer: IncomingTransfer | null;

  // Received files for download
  receivedFiles: Array<{ blob: Blob; name: string; type: string }>;

  // Actions
  setFiles: (files: File[]) => void;
  setSession: (data: { sessionId: string; code: string; shareLink?: string }) => void;
  setTransferMode: (mode: 'local' | 'remote') => void;
  setStatus: (status: TransferStatus) => void;
  setRole: (role: TransferRole) => void;
  setError: (error: string | null) => void;
  setErrorDetails: (error: string, details?: { files?: FileInfo[]; totalSize?: number; code?: string }) => void;
  setRemotePeer: (name: string, id: string) => void;
  updateProgress: (progress: Partial<TransferProgress>) => void;
  setIncomingTransfer: (transfer: IncomingTransfer | null) => void;
  addReceivedFile: (file: { blob: Blob; name: string; type: string }) => void;
  reset: () => void;
}

const initialProgress: TransferProgress = {
  bytesTransferred: 0,
  totalBytes: 0,
  speed: 0,
  eta: 0,
  currentFile: '',
  fileIndex: 0,
  totalFiles: 0,
};

export const useTransferStore = create<TransferState>((set) => ({
  files: [],
  fileInfos: [],
  sessionId: null,
  transferCode: null,
  shareLink: null,
  transferMode: null,
  status: 'idle',
  role: null,
  error: null,
  remotePeerName: null,
  remotePeerId: null,
  errorDetails: null,
  progress: { ...initialProgress },
  incomingTransfer: null,
  receivedFiles: [],

  setFiles: (files) =>
    set({
      files,
      fileInfos: files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream' })),
    }),

  setSession: ({ sessionId, code, shareLink }) =>
    set({
      sessionId,
      transferCode: code,
      shareLink: shareLink || null,
    }),

  setTransferMode: (mode) => set({ transferMode: mode }),

  setStatus: (status) => set({ status }),

  setRole: (role) => set({ role }),

  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

  setErrorDetails: (error: string, details?: { files?: FileInfo[]; totalSize?: number; code?: string }) =>
    set((state) => ({
      error,
      status: 'error' as TransferStatus,
      errorDetails: details
        ? {
            files: details.files ?? state.fileInfos,
            totalSize: details.totalSize ?? state.progress.totalBytes,
            code: details.code,
          }
        : {
            files: state.fileInfos,
            totalSize: state.progress.totalBytes,
          },
    })),

  setRemotePeer: (name, id) => set({ remotePeerName: name, remotePeerId: id }),

  updateProgress: (progress) =>
    set((state) => ({
      progress: { ...state.progress, ...progress },
    })),

  setIncomingTransfer: (transfer) => set({ incomingTransfer: transfer }),

  addReceivedFile: (file) =>
    set((state) => ({
      receivedFiles: [...state.receivedFiles, file],
    })),

  reset: () =>
    set({
      files: [],
      fileInfos: [],
      sessionId: null,
      transferCode: null,
      shareLink: null,
      transferMode: null,
      status: 'idle',
      role: null,
      error: null,
      errorDetails: null,
      remotePeerName: null,
      remotePeerId: null,
      progress: { ...initialProgress },
      incomingTransfer: null,
      receivedFiles: [],
    }),
}));
