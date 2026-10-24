import { create } from "zustand"
import type { FileMeta, SessionView, ShareKind } from "./protocol"
import type { SignalingStatus } from "./signaling"
import type { PathKind } from "./transfer/pipe"
import type { Attempt } from "./transfer/connect"
import { canTransition, TERMINAL, type Phase } from "./machine"
import type { DeviceKind } from "./device"
import type { KeyMode } from "./transfer/handshake"

export type ScreenQuality = "smooth" | "sharp"

export interface ShareError {
  title: string
  detail: string
  retryable: boolean
  code: string
}

export interface ReceivedItem {
  name: string
  size: number
  type: string
  url: string
  blob: Blob
}

/** Live picture and connection quality of a screen stream (sent or received). */
export interface VideoStats {
  width: number
  height: number
  fps: number
  /** Round-trip time in ms, when the browser reports it. */
  rtt: number | null
  /** Share of packets lost, 0 to 1. */
  loss: number | null
}

export interface ShareState {
  phase: Phase
  role: "sender" | "receiver" | null
  kind: ShareKind | null
  session: SessionView | null
  files: FileMeta[]
  totalBytes: number
  doneBytes: number
  speed: number
  path: PathKind | null
  attempts: Attempt[]
  peerName: string | null
  peerDevice: DeviceKind | null
  peerOnline: boolean
  error: ShareError | null
  /** Free-form status line for the current phase ("Direct connection blocked : using relay"). */
  note: string | null
  received: ReceivedItem[]
  text: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  paused: boolean
  /** File transfer paused: "you", the other device's name, or null while running. */
  pausedBy: string | null
  /** Show a system notification when this share finishes in a background tab. */
  notify: boolean
  /** How the share keys were checked: by the link's secret, or by a code both screens show. */
  security: { mode: KeyMode; sas: string } | null
  /** This share answers someone's request: their name, shown while they decide. */
  answering: string | null
  /** Received files were written straight into a file or folder the user picked. */
  savedToDisk: boolean
  /** When the share reached a terminal phase: the moment the server forgot it. */
  endedAt: number | null
  /** Sharer's encoder profile: smooth 60 fps, or sharp text at 30 fps. */
  screenQuality: ScreenQuality
  /** Live resolution and frame rate of the screen stream (sent or received). */
  videoStats: VideoStats | null
  startedAt: number | null
}

export const initialShare: ShareState = {
  phase: "idle",
  role: null,
  kind: null,
  session: null,
  files: [],
  totalBytes: 0,
  doneBytes: 0,
  speed: 0,
  path: null,
  attempts: [],
  peerName: null,
  peerDevice: null,
  peerOnline: false,
  error: null,
  note: null,
  received: [],
  text: null,
  localStream: null,
  remoteStream: null,
  paused: false,
  pausedBy: null,
  notify: false,
  savedToDisk: false,
  answering: null,
  security: null,
  endedAt: null,
  screenQuality: "smooth",
  videoStats: null,
  startedAt: null,
}

export const useShare = create<ShareState>(() => ({ ...initialShare }))

/** Validated phase change. Invalid transitions are refused (and logged) instead of corrupting the UI. */
export function setPhase(to: Phase, patch: Partial<ShareState> = {}): boolean {
  const from = useShare.getState().phase
  if (!canTransition(from, to)) {
    console.warn(`[share] ignored transition ${from} → ${to}`)
    return false
  }
  useShare.setState({
    ...patch,
    phase: to,
    ...(TERMINAL.has(to) && from !== to ? { endedAt: Date.now() } : {}),
  })
  return true
}

export const patchShare = (patch: Partial<ShareState>) =>
  useShare.setState(patch)

export interface NearbyPeer {
  id: string
  name: string
  device: DeviceKind
}

export interface IncomingInvite {
  sessionId: string
  from: string
  fromDevice?: DeviceKind
  /** Sent by one of our paired devices: its pairing keys the share. */
  pairId?: string | null
  kind: ShareKind
  files: FileMeta[]
  totalSize: number
  /** Set when this is an answer to our own request (lib/request.ts). */
  requestId?: string
  /** The answer was made with our request link's secret, so keys can be checked with it. */
  keyed?: boolean
}

interface ConnectionState {
  status: SignalingStatus
  name: string
  peerId: string
  relay: boolean
  turn: boolean
  nearby: NearbyPeer[]
  invite: IncomingInvite | null
}

export const useConnection = create<ConnectionState>(() => ({
  status: "offline",
  name: "",
  peerId: "",
  relay: true,
  turn: false,
  nearby: [],
  invite: null,
}))
