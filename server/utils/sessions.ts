import type { WebSocket } from 'ws';
import { generateCode } from './names.js';
import { nanoid } from 'nanoid';

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export type TransferStatus =
  | 'waiting'
  | 'connecting'
  | 'transferring'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface TransferSession {
  id: string;
  code: string;
  senderId: string;
  senderName: string;
  receiverId?: string;
  receiverName?: string;
  files: FileMetadata[];
  totalSize: number;
  status: TransferStatus;
  transferMode: 'local' | 'remote' | null;
  createdAt: number;
  senderWs?: WebSocket;
  receiverWs?: WebSocket;
  // For remote relay: chunks from sender buffered for receiver SSE
  chunkCallbacks: Array<(chunk: Buffer | null) => void>;
  progressCallbacks: Array<(progress: TransferProgress) => void>;
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

class SessionRegistry {
  private sessions = new Map<string, TransferSession>();
  private codeIndex = new Map<string, string>(); // code -> session id
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Purge expired sessions every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  create(senderId: string, senderName: string, files: FileMetadata[]): TransferSession {
    const id = nanoid(12);
    let code = generateCode();

    // Ensure unique code
    while (this.codeIndex.has(code)) {
      code = generateCode();
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const session: TransferSession = {
      id,
      code,
      senderId,
      senderName,
      files,
      totalSize,
      status: 'waiting',
      transferMode: null,
      createdAt: Date.now(),
      chunkCallbacks: [],
      progressCallbacks: [],
    };

    this.sessions.set(id, session);
    this.codeIndex.set(code, id);

    return session;
  }

  getById(id: string): TransferSession | undefined {
    return this.sessions.get(id);
  }

  getByCode(code: string): TransferSession | undefined {
    const id = this.codeIndex.get(code);
    if (!id) return undefined;
    return this.sessions.get(id);
  }

  joinSession(sessionId: string, receiverId: string, receiverName: string): TransferSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (session.receiverId && session.receiverId !== receiverId) return undefined;

    session.receiverId = receiverId;
    session.receiverName = receiverName;
    session.status = 'connecting';
    return session;
  }

  updateStatus(sessionId: string, status: TransferStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
    }
  }

  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.codeIndex.delete(session.code);
      this.sessions.delete(sessionId);
    }
  }

  getSessionsBySender(senderId: string): TransferSession[] {
    const result: TransferSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.senderId === senderId) {
        result.push(session);
      }
    }
    return result;
  }

  getSessionsByReceiver(receiverId: string): TransferSession[] {
    const result: TransferSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.receiverId === receiverId) {
        result.push(session);
      }
    }
    return result;
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > maxAge) {
        this.codeIndex.delete(session.code);
        this.sessions.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
    this.codeIndex.clear();
  }
}

export const sessionRegistry = new SessionRegistry();
