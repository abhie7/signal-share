import { signaling } from "../signaling"
import type { SignalData } from "../protocol"
import type { PathKind } from "./pipe"

/**
 * One RTCPeerConnection bound to (session, attempt). Queues remote ICE candidates until the
 * remote description is set : candidates arriving early were the old intermittent ICE failure.
 */
export class Peer {
  readonly pc: RTCPeerConnection
  private queue: RTCIceCandidateInit[] = []
  private closed = false

  constructor(
    private sessionId: string,
    private attempt: number,
  ) {
    const w = signaling.welcome
    this.pc = new RTCPeerConnection({
      iceServers: (w?.iceServers ?? []) as RTCIceServer[],
      iceTransportPolicy: w?.iceTransportPolicy ?? "all",
    })
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.signal({ k: "ice", c: e.candidate.toJSON() })
    }
  }

  signal(data: Omit<SignalData, "a"> & { k: string }) {
    signaling.send({
      type: "signal",
      sessionId: this.sessionId,
      data: { ...data, a: this.attempt },
    })
  }

  async offer() {
    await this.pc.setLocalDescription(await this.pc.createOffer())
    this.signal({ k: "offer", sdp: this.pc.localDescription!.toJSON() })
  }

  /** Handles offer/answer/ice for this attempt. Returns false for messages it does not own. */
  async handle(data: SignalData): Promise<boolean> {
    if (this.closed || data.a !== this.attempt) return false
    if (data.k === "offer" || data.k === "answer") {
      await this.pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit)
      if (data.k === "offer") {
        await this.pc.setLocalDescription(await this.pc.createAnswer())
        this.signal({ k: "answer", sdp: this.pc.localDescription!.toJSON() })
      }
      for (const c of this.queue.splice(0))
        await this.pc.addIceCandidate(c).catch(() => {})
      return true
    }
    if (data.k === "ice") {
      const c = data.c as RTCIceCandidateInit
      if (this.pc.remoteDescription)
        await this.pc.addIceCandidate(c).catch(() => {})
      else this.queue.push(c)
      return true
    }
    return false
  }

  /** 'turn' when the selected candidate pair goes through a TURN server. */
  async pathKind(): Promise<PathKind> {
    try {
      const stats = await this.pc.getStats()
      let pairId: string | undefined
      stats.forEach((s) => {
        if (s.type === "transport" && s.selectedCandidatePairId)
          pairId = s.selectedCandidatePairId
      })
      if (!pairId)
        stats.forEach(
          (s) =>
            s.type === "candidate-pair" &&
            s.nominated &&
            s.state === "succeeded" &&
            (pairId = s.id),
        )
      const pair = pairId ? stats.get(pairId) : undefined
      const local = pair && stats.get(pair.localCandidateId)
      const remote = pair && stats.get(pair.remoteCandidateId)
      return local?.candidateType === "relay" ||
        remote?.candidateType === "relay"
        ? "turn"
        : "direct"
    } catch {
      return "direct"
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.pc.onicecandidate = null
    this.pc.close()
  }
}

/** Resolves when ICE/DTLS connects; rejects on `failed` or after `ms`. */
export function waitConnected(
  pc: RTCPeerConnection,
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer)
      pc.removeEventListener("connectionstatechange", check)
      signal.removeEventListener("abort", onAbort)
      if (err) reject(err)
      else resolve()
    }
    const check = () => {
      if (pc.connectionState === "connected") done()
      else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      )
        done(new PathError("ice-failed"))
    }
    const onAbort = () => done(new PathError("aborted"))
    const timer = setTimeout(() => done(new PathError("ice-timeout")), ms)
    pc.addEventListener("connectionstatechange", check)
    signal.addEventListener("abort", onAbort)
    check()
  })
}

export type FailReason =
  | "ice-failed"
  | "ice-timeout"
  | "channel-timeout"
  | "verify-timeout"
  | "relay-disabled"
  | "relay-rejected"
  | "relay-timeout"
  | "peer-timeout"
  | "webrtc-unsupported"
  | "aborted"

export class PathError extends Error {
  constructor(
    public reason: FailReason,
    message?: string,
  ) {
    super(message ?? reason)
  }
}
