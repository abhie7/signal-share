import { signaling } from './signaling';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

interface ScreenConnectionCallbacks {
  onStateChange: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onError: (error: Error) => void;
}

export class ScreenConnectionManager {
  private pc: RTCPeerConnection | null = null;
  private targetPeerId: string;
  private sessionId: string;
  private callbacks: ScreenConnectionCallbacks;
  private cleanupFns: Array<() => void> = [];
  private localStream: MediaStream | null = null;

  constructor(targetPeerId: string, sessionId: string, callbacks: ScreenConnectionCallbacks) {
    this.targetPeerId = targetPeerId;
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.setupSignalingListeners();
  }

  private setupSignalingListeners(): void {
    this.cleanupFns.push(
      signaling.on('rtc-offer', (msg) => {
        if (msg.fromId === this.targetPeerId) {
          void this.handleOffer(msg.sdp as RTCSessionDescriptionInit);
        }
      }),
      signaling.on('rtc-answer', (msg) => {
        if (msg.fromId === this.targetPeerId) {
          void this.handleAnswer(msg.sdp as RTCSessionDescriptionInit);
        }
      }),
      signaling.on('rtc-ice-candidate', (msg) => {
        if (msg.fromId === this.targetPeerId) {
          void this.handleIceCandidate(msg.candidate as RTCIceCandidateInit);
        }
      }),
    );
  }

  private setupPeerConnection(): void {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      signaling.send({
        type: 'rtc-ice-candidate',
        targetId: this.targetPeerId,
        sessionId: this.sessionId,
        candidate: event.candidate.toJSON(),
      });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc) this.callbacks.onStateChange(this.pc.connectionState);
    };
    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        this.callbacks.onRemoteStream(stream);
      }
    };
  }

  async createOffer(localStream: MediaStream): Promise<void> {
    this.localStream = localStream;
    this.setupPeerConnection();
    if (!this.pc) {
      throw new Error('Failed to initialize screen connection');
    }
    for (const track of localStream.getTracks()) {
      this.pc.addTrack(track, localStream);
    }
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    signaling.send({
      type: 'rtc-offer',
      targetId: this.targetPeerId,
      sessionId: this.sessionId,
      sdp: offer,
    });
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    this.setupPeerConnection();
    if (!this.pc) return;
    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    signaling.send({
      type: 'rtc-answer',
      targetId: this.targetPeerId,
      sessionId: this.sessionId,
      sdp: answer,
    });
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(sdp);
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.addIceCandidate(candidate);
  }

  close(): void {
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];
    this.pc?.close();
    this.pc = null;
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
  }
}
