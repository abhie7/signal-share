import { signaling } from './signaling';

const CHUNK_SIZE = 64 * 1024; // 64KB per data channel message
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // No STUN/TURN needed for LAN
    // Add Google STUN as fallback for edge cases
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

export interface PeerConnectionCallbacks {
  onProgress: (bytesTransferred: number, totalBytes: number, currentFile: string, fileIndex: number, totalFiles: number) => void;
  onFileReceived: (file: Blob, metadata: { name: string; size: number; type: string }) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  onStateChange: (state: RTCPeerConnectionState) => void;
}

export class PeerConnectionManager {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private callbacks: PeerConnectionCallbacks;
  private targetPeerId: string;
  private sessionId: string;

  // Receive state
  private receivedChunks: ArrayBuffer[] = [];
  private receivedBytes = 0;
  private currentFileMeta: { name: string; size: number; type: string } | null = null;
  private totalFilesExpected = 0;
  private filesReceived = 0;
  private totalBytesExpected = 0;

  // Signaling cleanup
  private cleanupFns: Array<() => void> = [];

  constructor(
    targetPeerId: string,
    sessionId: string,
    callbacks: PeerConnectionCallbacks,
  ) {
    this.targetPeerId = targetPeerId;
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.setupSignalingListeners();
  }

  private setupSignalingListeners(): void {
    const onOffer = (msg: Record<string, unknown>) => {
      if (msg.fromId === this.targetPeerId) {
        this.handleOffer(msg.sdp as RTCSessionDescriptionInit);
      }
    };

    const onAnswer = (msg: Record<string, unknown>) => {
      if (msg.fromId === this.targetPeerId) {
        this.handleAnswer(msg.sdp as RTCSessionDescriptionInit);
      }
    };

    const onIce = (msg: Record<string, unknown>) => {
      if (msg.fromId === this.targetPeerId) {
        this.handleIceCandidate(msg.candidate as RTCIceCandidateInit);
      }
    };

    this.cleanupFns.push(signaling.on('rtc-offer', onOffer));
    this.cleanupFns.push(signaling.on('rtc-answer', onAnswer));
    this.cleanupFns.push(signaling.on('rtc-ice-candidate', onIce));
  }

  async createOffer(): Promise<void> {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupPCListeners();

    this.dataChannel = this.pc.createDataChannel('file-transfer', {
      ordered: true,
    });
    this.dataChannel.binaryType = 'arraybuffer';
    this.setupDataChannelListeners(this.dataChannel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    signaling.send({
      type: 'rtc-offer',
      targetId: this.targetPeerId,
      sdp: offer,
      sessionId: this.sessionId,
    });
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.setupPCListeners();

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.binaryType = 'arraybuffer';
      this.setupDataChannelListeners(this.dataChannel);
    };

    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    signaling.send({
      type: 'rtc-answer',
      targetId: this.targetPeerId,
      sdp: answer,
      sessionId: this.sessionId,
    });
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (this.pc) {
      await this.pc.setRemoteDescription(sdp);
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.pc) {
      await this.pc.addIceCandidate(candidate);
    }
  }

  private setupPCListeners(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.send({
          type: 'rtc-ice-candidate',
          targetId: this.targetPeerId,
          candidate: event.candidate.toJSON(),
          sessionId: this.sessionId,
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc) {
        this.callbacks.onStateChange(this.pc.connectionState);
      }
    };
  }

  private setupDataChannelListeners(dc: RTCDataChannel): void {
    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        this.handleControlMessage(msg);
      } else {
        this.handleDataChunk(event.data as ArrayBuffer);
      }
    };

    dc.onerror = () => {
      this.callbacks.onError(new Error('Data channel error'));
    };
  }

  private handleControlMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'file-start': {
        this.currentFileMeta = {
          name: msg.name as string,
          size: msg.size as number,
          type: msg.mimeType as string,
        };
        this.totalFilesExpected = msg.totalFiles as number;
        this.totalBytesExpected = msg.totalSize as number;
        this.receivedChunks = [];
        this.receivedBytes = 0;
        break;
      }
      case 'file-end': {
        if (this.currentFileMeta) {
          const blob = new Blob(this.receivedChunks, { type: this.currentFileMeta.type });
          this.callbacks.onFileReceived(blob, this.currentFileMeta);
          this.filesReceived++;
          this.currentFileMeta = null;
          this.receivedChunks = [];
        }
        break;
      }
      case 'transfer-complete': {
        this.callbacks.onComplete();
        break;
      }
    }
  }

  private handleDataChunk(data: ArrayBuffer): void {
    this.receivedChunks.push(data);
    this.receivedBytes += data.byteLength;

    if (this.currentFileMeta) {
      this.callbacks.onProgress(
        this.receivedBytes,
        this.totalBytesExpected,
        this.currentFileMeta.name,
        this.filesReceived,
        this.totalFilesExpected,
      );
    }
  }

  async sendFiles(files: File[]): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel is not open');
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    let totalBytesSent = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Send file start control message
      this.dataChannel.send(
        JSON.stringify({
          type: 'file-start',
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          fileIndex: i,
          totalFiles: files.length,
          totalSize,
        }),
      );

      // Send file in chunks
      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();

        // Wait for buffer to drain if needed
        while (this.dataChannel.bufferedAmount > 10 * CHUNK_SIZE) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        this.dataChannel.send(buffer);
        offset += buffer.byteLength;
        totalBytesSent += buffer.byteLength;

        this.callbacks.onProgress(totalBytesSent, totalSize, file.name, i, files.length);
      }

      // Send file end control message
      this.dataChannel.send(JSON.stringify({ type: 'file-end', fileIndex: i }));
    }

    // Send transfer complete
    this.dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
    this.callbacks.onComplete();

    // Notify server
    signaling.send({
      type: 'transfer-complete',
      sessionId: this.sessionId,
    });
  }

  waitForDataChannel(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.dataChannel?.readyState === 'open') {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.dataChannel?.readyState === 'open') {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        const err = new Error(
          'Data channel connection timed out after 30s. This usually means the other device is unreachable — check that both devices are on the same network, or try using a share link instead.',
        );
        err.name = 'TimeoutError';
        reject(err);
      }, 30000);
    });
  }

  close(): void {
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];

    this.dataChannel?.close();
    this.pc?.close();
    this.dataChannel = null;
    this.pc = null;
  }
}
