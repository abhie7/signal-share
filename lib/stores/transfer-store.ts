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
export type TransferKind = 'file' | 'text' | 'screen' | null;
export type ScreenMode = 'share-self' | 'request-remote';
export type ScreenStatus = 'idle' | 'prompting' | 'connecting' | 'live' | 'ended' | 'declined' | 'error';

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

export interface TextStreamProgress {
  bytesSent: number;
  bytesReceived: number;
  totalBytes: number;
  chunksSent: number;
  chunksReceived: number;
  totalChunks: number;
  assembling: boolean;
}

export interface IncomingTransfer {
  transferType: 'file' | 'text' | 'screen';
  sessionId: string;
  senderId: string;
  senderName: string;
  files: FileInfo[];
  totalSize: number;
  textContent?: string;
  screenMode?: ScreenMode | null;
  controlEnabled?: boolean;
  autoPromptShare?: boolean;
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
  transferKind: TransferKind;
  screenMode: ScreenMode | null;
  screenStatus: ScreenStatus;
  screenRenderNonce: number;
  isScreenSharer: boolean;
  controlEnabled: boolean;
  remoteWantsControl: boolean;
  screenPrompt: {
    visible: boolean;
    requesterId: string | null;
    requesterName: string | null;
    sessionId: string | null;
  };
  status: TransferStatus;
  role: TransferRole;
  error: string | null;
  pendingText: string | null;

  // Remote peer info
  remotePeerName: string | null;
  remotePeerId: string | null;

  // Error details
  errorDetails: ErrorDetails | null;

  // Progress
  progress: TransferProgress;
  textStream: TextStreamProgress;

  // Incoming transfer prompt
  incomingTransfer: IncomingTransfer | null;

  // Received files for download
  receivedFiles: Array<{ blob: Blob; name: string; type: string }>;

  // Actions
  setFiles: (files: File[]) => void;
  setSession: (data: { sessionId: string; code: string; shareLink?: string }) => void;
  setTransferMode: (mode: 'local' | 'remote') => void;
  setTransferKind: (kind: TransferKind) => void;
  setScreenMode: (mode: ScreenMode | null) => void;
  setScreenStatus: (status: ScreenStatus) => void;
  bumpScreenRenderNonce: () => void;
  setScreenSharer: (isSharer: boolean) => void;
  setControlEnabled: (enabled: boolean) => void;
  setRemoteWantsControl: (value: boolean) => void;
  setScreenPrompt: (data: TransferState['screenPrompt']) => void;
  setStatus: (status: TransferStatus) => void;
  setRole: (role: TransferRole) => void;
  setPendingText: (text: string | null) => void;
  setError: (error: string | null) => void;
  setErrorDetails: (error: string, details?: { files?: FileInfo[]; totalSize?: number; code?: string }) => void;
  setRemotePeer: (name: string, id: string) => void;
  updateProgress: (progress: Partial<TransferProgress>) => void;
  updateTextStream: (progress: Partial<TextStreamProgress>) => void;
  setIncomingTransfer: (transfer: IncomingTransfer | null) => void;
  setFileInfos: (fileInfos: FileInfo[]) => void;
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

const initialTextStream: TextStreamProgress = {
  bytesSent: 0,
  bytesReceived: 0,
  totalBytes: 0,
  chunksSent: 0,
  chunksReceived: 0,
  totalChunks: 0,
  assembling: false,
};

export const useTransferStore = create<TransferState>((set) => ({
  files: [],
  fileInfos: [],
  sessionId: null,
  transferCode: null,
  shareLink: null,
  transferMode: null,
  transferKind: null,
  screenMode: null,
  screenStatus: 'idle',
  screenRenderNonce: 0,
  isScreenSharer: false,
  controlEnabled: false,
  remoteWantsControl: false,
  screenPrompt: {
    visible: false,
    requesterId: null,
    requesterName: null,
    sessionId: null,
  },
  status: 'idle',
  role: null,
  error: null,
  pendingText: null,
  remotePeerName: null,
  remotePeerId: null,
  errorDetails: null,
  progress: { ...initialProgress },
  textStream: { ...initialTextStream },
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

  setTransferKind: (kind) => set({ transferKind: kind }),
  setScreenMode: (mode) => set({ screenMode: mode }),
  setScreenStatus: (screenStatus) => set({ screenStatus }),
  bumpScreenRenderNonce: () => set((state) => ({ screenRenderNonce: state.screenRenderNonce + 1 })),
  setScreenSharer: (isScreenSharer) => set({ isScreenSharer }),
  setControlEnabled: (controlEnabled) => set({ controlEnabled }),
  setRemoteWantsControl: (remoteWantsControl) => set({ remoteWantsControl }),
  setScreenPrompt: (screenPrompt) => set({ screenPrompt }),

  setStatus: (status) => set({ status }),

  setRole: (role) => set({ role }),

  setPendingText: (text) => set({ pendingText: text }),

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

  updateTextStream: (progress) =>
    set((state) => ({
      textStream: { ...state.textStream, ...progress },
    })),

  setIncomingTransfer: (transfer) => set({ incomingTransfer: transfer }),

  setFileInfos: (fileInfos) => set({ fileInfos }),

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
      transferKind: null,
      screenMode: null,
      screenStatus: 'idle',
      screenRenderNonce: 0,
      isScreenSharer: false,
      controlEnabled: false,
      remoteWantsControl: false,
      screenPrompt: {
        visible: false,
        requesterId: null,
        requesterName: null,
        sessionId: null,
      },
      status: 'idle',
      role: null,
      error: null,
      pendingText: null,
      errorDetails: null,
      remotePeerName: null,
      remotePeerId: null,
      progress: { ...initialProgress },
      textStream: { ...initialTextStream },
      incomingTransfer: null,
      receivedFiles: [],
    }),
}));
