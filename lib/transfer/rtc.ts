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
  /** Optional rewrite of the remote answer before it is applied (sender-side tuning). */
  mungeAnswer: ((sdp: string) => string) | null = null
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
      const desc = data.sdp as RTCSessionDescriptionInit
      await this.pc.setRemoteDescription(
        data.k === "answer" && this.mungeAnswer && desc.sdp
          ? { ...desc, sdp: this.mungeAnswer(desc.sdp) }
          : desc,
      )
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
  | "auth-failed" // keys or DTLS fingerprints didn't match: someone is in the middle
  | "aborted"

export class PathError extends Error {
  constructor(
    public reason: FailReason,
    message?: string,
  ) {
    super(message ?? reason)
  }
}

/**
 * Chrome's bandwidth estimate starts near 300 kbps and ramps slowly, so a fresh screen share
 * looked soft and juddery for its first seconds. Advertise a higher starting bitrate for every
 * video codec (Chrome reads x-google-* from the remote description; other browsers ignore it).
 */
export function withStartBitrate(sdp: string, kbps: number): string {
  const lines = sdp.split("\r\n")
  const video = new Set<string>()
  let inVideo = false
  for (const line of lines) {
    if (line.startsWith("m=")) inVideo = line.startsWith("m=video")
    const m = inVideo && /^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\//i.exec(line)
    if (m) video.add(m[1])
  }
  const param = `x-google-start-bitrate=${kbps}`
  const out: string[] = []
  const hasFmtp = new Set<string>()
  for (const line of lines) {
    const f = /^a=fmtp:(\d+) (.*)$/.exec(line)
    if (f && video.has(f[1]) && !f[2].includes("x-google-start-bitrate")) {
      hasFmtp.add(f[1])
      out.push(`${line};${param}`)
      continue
    }
    out.push(line)
    const r = /^a=rtpmap:(\d+) /.exec(line)
    // Codecs without an fmtp line (VP8) get one right after their rtpmap.
    if (
      r &&
      video.has(r[1]) &&
      !lines.some((l) => l.startsWith(`a=fmtp:${r[1]} `))
    )
      out.push(`a=fmtp:${r[1]} ${param}`)
  }
  return out.join("\r\n")
}
